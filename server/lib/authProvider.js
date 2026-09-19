const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { runMigrationsIfNeeded } = require('./migrationRunner');
const { createSystemAlert, computeGlobalScore } = require('./alertService');
const { emitLiveState, emitNewAlert } = require('./liveSocket');

const triggerLockoutAlert = async (username) => {
  try {
    const { updatedData, createdAlert } = await createSystemAlert(
      'Account Lockout',
      'critical',
      username,
      { reason: 'max_failed_attempts' }
    );
    emitLiveState(updatedData.users, computeGlobalScore(updatedData.users));
    emitNewAlert(createdAlert);
  } catch (err) {
    console.error('Failed to generate lockout alert:', err);
  }
};

const isProduction = process.env.NODE_ENV === 'production';

const defaultUsers = [
  {
    username: 'admin',
    passwordHash: '$2b$10$oTYkCCH9YobRMHRt.IO.huadmNo2lFzATouATY3/y.l10mejimUQ2',
    role: 'admin'
  },
  {
    username: 'analyst',
    passwordHash: '$2b$10$OXC/cYgi00PZJ3lNVrvnt.Xlx6.3Lww4gV9WJRXS5HhpkytkUHB92',
    role: 'analyst'
  },
  {
    username: 'connector',
    passwordHash: '$2b$10$Lup1kphkO2XQ7tpdieZJzOvPocJBuDm5K.JUU9AyUTH/qkk/iqbMW',
    role: 'connector'
  }
];

const parseAuthUsers = () => {
  const raw = process.env.AUTH_USERS_JSON;
  if (!raw) {
    return defaultUsers;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaultUsers;
    }
    return parsed.filter((u) => u?.username && (u?.passwordHash || u?.password) && u?.role);
  } catch {
    return defaultUsers;
  }
};

class EnvAuthProvider {
  constructor() {
    this.users = parseAuthUsers();
    this.maxFailedAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || 5);
    this.lockMinutes = Number(process.env.AUTH_LOCK_MINUTES || 15);
    this.attemptState = new Map();
  }

  async init() {
    return undefined;
  }

  async authenticate(username, password) {
    const user = this.users.find((candidate) => candidate.username === username);
    if (!user) {
      return null;
    }

    const current = this.attemptState.get(username) || { failedAttempts: 0, lockedUntil: null };
    const now = Date.now();
    if (current.lockedUntil && current.lockedUntil > now) {
      return null;
    }

    const registerFailure = async () => { // <--- Added async
      const nextFailedAttempts = current.failedAttempts + 1;
      const willLock = nextFailedAttempts >= this.maxFailedAttempts;
      const lockedUntil = willLock ? now + this.lockMinutes * 60 * 1000 : null;

      this.attemptState.set(username, { failedAttempts: nextFailedAttempts, lockedUntil });

      if (willLock && current.failedAttempts < this.maxFailedAttempts) {
        await triggerLockoutAlert(username);
      }
      return null;
    };

    if (user.passwordHash) {
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return await registerFailure();
      }
      this.attemptState.delete(username);
      return { username: user.username, role: user.role };
    }

    if (user.password && !isProduction) {
      if (user.password !== password) {
        return await registerFailure();
      }
      this.attemptState.delete(username);
      return { username: user.username, role: user.role };
    }

    return null;
  }
}

class PostgresAuthProvider {
  constructor() {
    const sslEnabled = process.env.PG_SSL === 'true';
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false
    });
    this.maxFailedAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || 5);
    this.lockMinutes = Number(process.env.AUTH_LOCK_MINUTES || 15);
    this.seedDefaults = process.env.AUTH_SEED_DEFAULT_USERS !== 'false';
    this._initialized = false;
  }

  async init() {
    if (this._initialized) {
      return;
    }

    await runMigrationsIfNeeded();

    const client = await this.pool.connect();
    try {
      if (this.seedDefaults) {
        for (const user of defaultUsers) {
          await client.query(
            `
              INSERT INTO auth_users (username, password_hash, role)
              VALUES ($1, $2, $3)
              ON CONFLICT (username) DO NOTHING
            `,
            [user.username, user.passwordHash, user.role]
          );
        }
      }

      this._initialized = true;
    } finally {
      client.release();
    }
  }

  async authenticate(username, password) {
    await this.init();

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
          SELECT username, password_hash, role, is_active, failed_attempts, locked_until
          FROM auth_users
          WHERE username = $1
        `,
        [username]
      );

      if (result.rowCount === 0) {
        return null;
      }

      const account = result.rows[0];
      if (!account.is_active) {
        return null;
      }

      const now = new Date();
      if (account.locked_until && new Date(account.locked_until) > now) {
        return null;
      }

      const passwordOk = await bcrypt.compare(password, account.password_hash);
      if (!passwordOk) {
        const currentFailed = account.failed_attempts || 0;
        const nextFailed = currentFailed + 1;
        const willLock = nextFailed >= this.maxFailedAttempts;
        const lockedUntil = willLock
          ? new Date(now.getTime() + this.lockMinutes * 60 * 1000).toISOString()
          : null;

        await client.query(
          `
            UPDATE auth_users
            SET failed_attempts = $2,
                locked_until = $3::timestamptz
            WHERE username = $1
          `,
          [username, nextFailed, lockedUntil]
        );

        if (willLock && currentFailed < this.maxFailedAttempts) {
          await triggerLockoutAlert(username);
        }

        return null;
      }

      await client.query(
        `
          UPDATE auth_users
          SET failed_attempts = 0,
              locked_until = NULL,
              last_login_at = NOW()
          WHERE username = $1
        `,
        [username]
      );

      return {
        username: account.username,
        role: account.role
      };
    } finally {
      client.release();
    }
  }
}

const providerName = process.env.AUTH_PROVIDER || 'env';

const authProvider = (() => {
  if (providerName === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('AUTH_PROVIDER=postgres requires DATABASE_URL');
    }
    return new PostgresAuthProvider();
  }
  return new EnvAuthProvider();
})();

module.exports = {
  authProvider,
  authProviderName: providerName
};
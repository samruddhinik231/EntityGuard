const { Pool } = require('pg');
const { runMigrationsIfNeeded } = require('./migrationRunner');

const initialData = {
  alerts: [],
  cases: [],
  users: []
};

class PostgresStore {
  constructor() {
    const sslEnabled = process.env.PG_SSL === 'true';
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false
    });
    this._initialized = false;
    this._writeQueue = Promise.resolve();
  }

  async init() {
    if (this._initialized) {
      return;
    }

    await runMigrationsIfNeeded();
    this._initialized = true;
  }

  async read() {
    await this.init();
    const client = await this.pool.connect();
    try {
      return await this._readWithClient(client);
    } finally {
      client.release();
    }
  }

  async write(nextData) {
    this._writeQueue = this._writeQueue.then(async () => {
      await this.init();
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const current = await this._readWithClient(client);
        await this._replaceWithClient(client, current, nextData);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    return this._writeQueue;
  }

  async update(updater) {
    this._writeQueue = this._writeQueue.then(async () => {
      await this.init();
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const current = await this._readWithClient(client);
        const updated = await updater(current);
        await this._replaceWithClient(client, current, updated);
        await client.query('COMMIT');
        return updated;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    return this._writeQueue;
  }

  async _readWithClient(client) {
    const usersResult = await client.query('SELECT id, username, risk_score, department, last_active FROM users');
    const alertsResult = await client.query('SELECT id, type, severity, username, timestamp, raw_log FROM alerts');
    const casesResult = await client.query('SELECT id, title, status, severity, assignee, created_at FROM cases');

    return {
      alerts: alertsResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        user: row.username,
        timestamp: new Date(row.timestamp).toISOString(),
        rawLog: row.raw_log || undefined
      })),
      cases: casesResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        severity: row.severity,
        assignee: row.assignee,
        createdAt: new Date(row.created_at).toISOString()
      })),
      users: usersResult.rows.map((row) => ({
        id: row.id,
        username: row.username,
        riskScore: row.risk_score,
        department: row.department,
        lastActive: new Date(row.last_active).toISOString()
      }))
    };
  }

  async _replaceWithClient(client, currentData, nextData) {
    const current = {
      alerts: Array.isArray(currentData?.alerts) ? currentData.alerts : initialData.alerts,
      cases: Array.isArray(currentData?.cases) ? currentData.cases : initialData.cases,
      users: Array.isArray(currentData?.users) ? currentData.users : initialData.users
    };

    const normalized = {
      alerts: Array.isArray(nextData.alerts) ? nextData.alerts : initialData.alerts,
      cases: Array.isArray(nextData.cases) ? nextData.cases : initialData.cases,
      users: Array.isArray(nextData.users) ? nextData.users : initialData.users
    };

    await this._syncUsers(client, current.users, normalized.users);
    await this._syncAlerts(client, current.alerts, normalized.alerts);
    await this._syncCases(client, current.cases, normalized.cases);
  }

  async _syncUsers(client, currentUsers, nextUsers) {
    const nextById = new Map(nextUsers.map((item) => [item.id, item]));

    for (const existing of currentUsers) {
      if (!nextById.has(existing.id)) {
        await client.query('DELETE FROM users WHERE id = $1', [existing.id]);
      }
    }

    for (const user of nextUsers) {
      await client.query(
        `
          INSERT INTO users (id, username, risk_score, department, last_active)
          VALUES ($1, $2, $3, $4, $5::timestamptz)
          ON CONFLICT (id)
          DO UPDATE SET
            username = EXCLUDED.username,
            risk_score = EXCLUDED.risk_score,
            department = EXCLUDED.department,
            last_active = EXCLUDED.last_active
        `,
        [user.id, user.username, user.riskScore, user.department, user.lastActive]
      );
    }
  }

  async _syncAlerts(client, currentAlerts, nextAlerts) {
    const nextById = new Map(nextAlerts.map((item) => [item.id, item]));

    for (const existing of currentAlerts) {
      if (!nextById.has(existing.id)) {
        await client.query('DELETE FROM alerts WHERE id = $1', [existing.id]);
      }
    }

    for (const alert of nextAlerts) {
      await client.query(
        `
          INSERT INTO alerts (id, type, severity, username, timestamp, raw_log)
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            type = EXCLUDED.type,
            severity = EXCLUDED.severity,
            username = EXCLUDED.username,
            timestamp = EXCLUDED.timestamp,
            raw_log = EXCLUDED.raw_log
        `,
        [
          alert.id,
          alert.type,
          alert.severity,
          alert.user,
          alert.timestamp,
          alert.rawLog ? JSON.stringify(alert.rawLog) : null
        ]
      );
    }
  }

  async _syncCases(client, currentCases, nextCases) {
    const nextById = new Map(nextCases.map((item) => [item.id, item]));

    for (const existing of currentCases) {
      if (!nextById.has(existing.id)) {
        await client.query('DELETE FROM cases WHERE id = $1', [existing.id]);
      }
    }

    for (const investigationCase of nextCases) {
      await client.query(
        `
          INSERT INTO cases (id, title, status, severity, assignee, created_at)
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
          ON CONFLICT (id)
          DO UPDATE SET
            title = EXCLUDED.title,
            status = EXCLUDED.status,
            severity = EXCLUDED.severity,
            assignee = EXCLUDED.assignee,
            created_at = EXCLUDED.created_at
        `,
        [
          investigationCase.id,
          investigationCase.title,
          investigationCase.status,
          investigationCase.severity,
          investigationCase.assignee,
          investigationCase.createdAt
        ]
      );
    }
  }
}

module.exports = PostgresStore;
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

let migrationPromise = null;

const shouldRunMigrations = () => {
  if (process.env.MIGRATIONS_ENABLED === 'false') {
    return false;
  }

  const usesPostgresPersistence = process.env.PERSISTENCE_DRIVER === 'postgres';
  const usesPostgresAuth = process.env.AUTH_PROVIDER === 'postgres';
  return Boolean(process.env.DATABASE_URL) && (usesPostgresPersistence || usesPostgresAuth);
};

const getPool = () => {
  const sslEnabled = process.env.PG_SSL === 'true';
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  });
};

const migrationsDir = path.join(__dirname, '..', 'migrations');

const getSqlFiles = async () => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const fileChecksum = (content) => crypto.createHash('sha256').update(content).digest('hex');

const runMigrationsInternal = async () => {
  if (!shouldRunMigrations()) {
    return { skipped: true, applied: [] };
  }

  const pool = getPool();
  const client = await pool.connect();
  const applied = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = await getSqlFiles();

    for (const fileName of files) {
      const fullPath = path.join(migrationsDir, fileName);
      const sql = await fs.readFile(fullPath, 'utf-8');
      const checksum = fileChecksum(sql);

      const existing = await client.query(
        'SELECT version, checksum FROM schema_migrations WHERE version = $1',
        [fileName]
      );

      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (row.checksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${fileName}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [fileName, checksum]
        );
        await client.query('COMMIT');
        applied.push(fileName);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return { skipped: false, applied };
  } finally {
    client.release();
    await pool.end();
  }
};

const runMigrationsIfNeeded = async () => {
  if (!migrationPromise) {
    migrationPromise = runMigrationsInternal().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
};

module.exports = {
  runMigrationsIfNeeded
};
require('dotenv').config();

const { runMigrationsIfNeeded } = require('../lib/migrationRunner');

const main = async () => {
  try {
    const result = await runMigrationsIfNeeded();
    if (result.skipped) {
      console.log('Migrations skipped (no postgres mode enabled or MIGRATIONS_ENABLED=false).');
      return;
    }

    if (result.applied.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Applied migrations: ${result.applied.join(', ')}`);
  } catch (error) {
    console.error('Migration run failed:', error);
    process.exit(1);
  }
};

main();

const fileStore = require('./dataStore');
const PostgresStore = require('./postgresStore');

const usePostgres = Boolean(process.env.DATABASE_URL) || process.env.PERSISTENCE_DRIVER === 'postgres';

if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('PERSISTENCE_DRIVER=postgres requires DATABASE_URL');
}

const selectedStore = usePostgres ? new PostgresStore() : fileStore;

module.exports = {
  store: selectedStore,
  persistenceDriver: usePostgres ? 'postgres' : 'file'
};
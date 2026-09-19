const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = process.env.DATA_STORE_FILE || path.join(DATA_DIR, 'store.json');

const initialData = {
  alerts: [],
  cases: [],
  users: []
};

class DataStore {
  constructor() {
    this._writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
      await fs.access(DATA_FILE);
    } catch {
      await this._writeFile(initialData);
    }
  }

  async read() {
    await this.init();
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      users: Array.isArray(parsed.users) ? parsed.users : []
    };
  }

  async write(nextData) {
    this._writeQueue = this._writeQueue.then(() => this._writeFile(nextData));
    return this._writeQueue;
  }

  async update(updater) {
    const current = await this.read();
    const updated = await updater(current);
    await this.write(updated);
    return updated;
  }

  async _writeFile(data) {
    const tempPath = `${DATA_FILE}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, DATA_FILE);
  }
}

module.exports = new DataStore();
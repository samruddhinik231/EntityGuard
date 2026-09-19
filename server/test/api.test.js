const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs/promises');
const request = require('supertest');

process.env.DATA_STORE_FILE = path.join(__dirname, 'test-store.json');
process.env.JWT_SECRET = 'test-secret';
process.env.AUTH_PROVIDER = 'env';
process.env.AUTH_USERS_JSON = JSON.stringify([
  { username: 'admin', passwordHash: '$2b$10$oTYkCCH9YobRMHRt.IO.huadmNo2lFzATouATY3/y.l10mejimUQ2', role: 'admin' },
  { username: 'analyst', passwordHash: '$2b$10$OXC/cYgi00PZJ3lNVrvnt.Xlx6.3Lww4gV9WJRXS5HhpkytkUHB92', role: 'analyst' },
  { username: 'connector', passwordHash: '$2b$10$Lup1kphkO2XQ7tpdieZJzOvPocJBuDm5K.JUU9AyUTH/qkk/iqbMW', role: 'connector' }
]);

const { app } = require('../index');

const resetStore = async () => {
  await fs.writeFile(process.env.DATA_STORE_FILE, JSON.stringify({ alerts: [], cases: [], users: [] }, null, 2), 'utf-8');
};

const login = async (username, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  assert.equal(res.statusCode, 200);
  return res.body.token;
};

test.beforeEach(async () => {
  await resetStore();
});

test('rejects case creation without token', async () => {
  const res = await request(app)
    .post('/api/v1/cases')
    .send({ title: 'Unauthorized attempt', severity: 'High', assignee: 'analyst' });

  assert.equal(res.statusCode, 401);
});

test('allows analyst to create case with token', async () => {
  const token = await login('analyst', 'analyst123');

  const createRes = await request(app)
    .post('/api/v1/cases')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Real incident workflow', severity: 'High', assignee: 'analyst', status: 'Open' });

  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.assignee, 'analyst');

  const listRes = await request(app).get('/api/v1/cases');
  assert.equal(listRes.statusCode, 401);

  const authorizedListRes = await request(app)
    .get('/api/v1/cases')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(authorizedListRes.statusCode, 200);
  assert.equal(authorizedListRes.body.length, 1);
});

test('connector can ingest anomalous log and create alert', async () => {
  const token = await login('connector', 'connector123');

  const ingestRes = await request(app)
    .post('/api/v1/logs/ingest')
    .set('Authorization', `Bearer ${token}`)
    .send({ source: 'ActiveDirectory', action: 'login_failed', user: 'jdoe', count: 10 });

  assert.equal(ingestRes.statusCode, 200);
  assert.equal(ingestRes.body.anomalous, true);

  const alertsRes = await request(app).get('/api/v1/alerts');
  assert.equal(alertsRes.statusCode, 401);

  const analystToken = await login('analyst', 'analyst123');
  const analystAlertsRes = await request(app)
    .get('/api/v1/alerts')
    .set('Authorization', `Bearer ${analystToken}`);

  assert.equal(analystAlertsRes.statusCode, 200);
  assert.equal(analystAlertsRes.body.length, 1);
  assert.equal(analystAlertsRes.body[0].user, 'jdoe');
});

test('cookie session from login authorizes protected endpoints', async () => {
  const agent = request.agent(app);

  const loginRes = await agent
    .post('/api/v1/auth/login')
    .send({ username: 'analyst', password: 'analyst123' });

  assert.equal(loginRes.statusCode, 200);

  const meRes = await agent.get('/api/v1/auth/me');
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.body.username, 'analyst');
  assert.equal(meRes.body.role, 'analyst');

  const createRes = await agent
    .post('/api/v1/cases')
    .send({ title: 'Cookie protected action', severity: 'High', assignee: 'analyst', status: 'Open' });

  assert.equal(createRes.statusCode, 201);

  const logoutRes = await agent.post('/api/v1/auth/logout');
  assert.equal(logoutRes.statusCode, 200);

  const meAfterLogoutRes = await agent.get('/api/v1/auth/me');
  assert.equal(meAfterLogoutRes.statusCode, 401);
});

test('login rejects wrong password with hashed accounts', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'analyst', password: 'not-the-right-password' });

  assert.equal(loginRes.statusCode, 401);
});

test('connector role cannot read analyst dashboards', async () => {
  const connectorToken = await login('connector', 'connector123');

  const usersRes = await request(app)
    .get('/api/v1/users')
    .set('Authorization', `Bearer ${connectorToken}`);

  assert.equal(usersRes.statusCode, 403);
});

test('repeated failed logins generate lockout alert', async () => {
  const adminToken = await login('admin', 'admin123');

  // Trigger max allowed failures directly (assuming default is 5)
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/v1/auth/login').send({ username: 'connector', password: 'wrongpassword' });
  }

  // Next one is 401 rate-limit or 401 locked depending on implementation timings
  // Let's verify the alert was created
  const alertsRes = await request(app)
    .get('/api/v1/alerts')
    .set('Authorization', `Bearer ${adminToken}`);

  const lockAlerts = alertsRes.body.filter(a => a.type === 'Account Lockout' && a.user === 'connector');
  assert.equal(lockAlerts.length >= 1, true, 'Lockout alert was not generated');
});

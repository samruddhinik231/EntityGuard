const { randomUUID } = require('crypto');
const { store } = require('./store');

const riskWeightBySeverity = {
  low: 5,
  medium: 10,
  high: 25,
  critical: 40
};

const sortByTimestampDesc = (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
const sortByCreatedDesc = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const recalculateRiskScores = (users, alerts) => {
  const nextUsers = users.map((user) => ({ ...user, riskScore: 10 }));

  for (const alert of alerts) {
    const idx = nextUsers.findIndex((u) => u.username === alert.user);
    if (idx >= 0) {
      const increment = riskWeightBySeverity[alert.severity] || 0;
      nextUsers[idx].riskScore = Math.min(100, nextUsers[idx].riskScore + increment);
    }
  }

  return nextUsers;
};

const computeGlobalScore = (users) => {
  if (users.length === 0) {
    return 0;
  }

  const sorted = users.map((u) => u.riskScore).sort((a, b) => b - a);
  const topCount = Math.min(3, sorted.length);
  const sum = sorted.slice(0, topCount).reduce((acc, value) => acc + value, 0);
  return Math.round(sum / topCount);
};

const upsertUserFromActivity = (users, username) => {
  if (!username) {
    return users;
  }

  const existing = users.find((u) => u.username === username);
  if (existing) {
    return users.map((u) => (
      u.username === username
        ? { ...u, lastActive: new Date().toISOString() }
        : u
    ));
  }

  return [
    {
      id: randomUUID(),
      username,
      department: 'Unknown',
      riskScore: 10,
      lastActive: new Date().toISOString()
    },
    ...users
  ];
};

const createSystemAlert = async (type, severity, username, rawLog = undefined) => {
  let createdAlert = null;
  const updatedData = await store.update(async (current) => {
    const nextUsers = upsertUserFromActivity(current.users, username);

    createdAlert = {
      id: randomUUID(),
      type,
      severity,
      user: username,
      timestamp: new Date().toISOString(),
      rawLog
    };

    const nextAlerts = [createdAlert, ...current.alerts].sort(sortByTimestampDesc);
    const scoredUsers = recalculateRiskScores(nextUsers, nextAlerts);

    return {
      ...current,
      alerts: nextAlerts,
      users: scoredUsers
    };
  });

  return { updatedData, createdAlert };
};

module.exports = {
  createSystemAlert,
  recalculateRiskScores,
  computeGlobalScore,
  upsertUserFromActivity,
  sortByTimestampDesc,
  sortByCreatedDesc
};
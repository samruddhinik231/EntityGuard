const express = require('express');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { store } = require('../lib/store');
const { authProvider } = require('../lib/authProvider');
const { logAuditEvent } = require('../lib/auditLogger');
const { createSystemAlert, recalculateRiskScores, computeGlobalScore, upsertUserFromActivity, sortByTimestampDesc, sortByCreatedDesc } = require('../lib/alertService');
const { setIo, emitLiveState } = require('../lib/liveSocket');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '8h';
const SESSION_COOKIE_NAME = 'ueba_session';
const isProduction = process.env.NODE_ENV === 'production';
const authRateLimitWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const authRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);

if (isProduction && JWT_SECRET === 'change-this-in-production') {
  throw new Error('JWT_SECRET must be set to a strong value in production');
}

const authLoginLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  max: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again later.' }
});

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);

const loginSchema = z.object({
  username: z.string().trim().min(2).max(80),
  password: z.string().min(6).max(200)
});

const alertCreateSchema = z.object({
  type: z.string().trim().min(3).max(150),
  severity: severitySchema.default('medium'),
  user: z.string().trim().min(2).max(80).default('system')
});

const caseCreateSchema = z.object({
  title: z.string().trim().min(5).max(180),
  status: z.enum(['Open', 'Investigating', 'Contained', 'Resolved']).default('Open'),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  assignee: z.string().trim().min(2).max(80).default('Unassigned')
});

const caseUpdateSchema = z.object({
  status: z.enum(['Open', 'Investigating', 'Contained', 'Resolved']).optional(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  assignee: z.string().trim().min(2).max(80).optional()
});

const ingestLogSchema = z.object({
  source: z.string().trim().min(2).max(80),
  action: z.string().trim().min(2).max(120),
  user: z.string().trim().min(2).max(80).optional(),
  count: z.number().int().nonnegative().optional(),
  bytes: z.number().int().nonnegative().optional(),
  location: z.string().trim().max(120).optional(),
  timestamp: z.string().datetime({ offset: true }).optional()
}).passthrough();

const parseOrReject = (schema, payload, res) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
    return null;
  }
  return parsed.data;
};

const getSessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
});

const requireAuth = (allowedRoles = []) => (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] || null;
  const token = bearerToken || cookieToken;

  if (!token) {
    logAuditEvent({
      action: 'auth.check',
      outcome: 'denied',
      reason: 'missing_token',
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;

    if (allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
      logAuditEvent({
        action: 'auth.check',
        outcome: 'denied',
        actor: payload.sub,
        role: payload.role,
        reason: 'role_forbidden',
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        metadata: { allowedRoles }
      });
      return res.status(403).json({ error: 'Forbidden for role' });
    }

    return next();
  } catch {
    logAuditEvent({
      action: 'auth.check',
      outcome: 'denied',
      reason: 'invalid_or_expired_token',
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// === AUTH ===
router.post('/auth/login', authLoginLimiter, async (req, res) => {
  const payload = parseOrReject(loginSchema, req.body, res);
  if (!payload) {
    return;
  }

  const user = await authProvider.authenticate(payload.username, payload.password);
  if (!user) {
    logAuditEvent({
      action: 'auth.login',
      outcome: 'denied',
      actor: payload.username,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      reason: 'invalid_credentials'
    });
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    {
      sub: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  logAuditEvent({
    action: 'auth.login',
    outcome: 'success',
    actor: user.username,
    role: user.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  return res.status(200).json({
    role: user.role,
    username: user.username,
    expiresIn: TOKEN_TTL,
    token
  });
});

router.post('/auth/logout', (req, res) => {
  const actor = req.auth?.sub || 'anonymous';

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  });

  logAuditEvent({
    action: 'auth.logout',
    outcome: 'success',
    actor,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  return res.status(200).json({ status: 'logged_out' });
});

router.get('/auth/me', requireAuth(), (req, res) => {
  logAuditEvent({
    action: 'auth.me',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  return res.status(200).json({
    username: req.auth.sub,
    role: req.auth.role
  });
});

// === LOG INGESTION (CONNECTOR ENDPOINT) ===
router.post('/logs/ingest', requireAuth(['connector', 'admin']), async (req, res) => {
  const log = parseOrReject(ingestLogSchema, req.body, res);
  if (!log) {
    return;
  }

  let isAnomalous = false;
  let severity = 'low';
  let type = '';

  if (log.source === 'ActiveDirectory' && log.action === 'login_failed' && (log.count || 0) > 5) {
    isAnomalous = true;
    severity = 'high';
    type = 'Multiple Failed Logins (Brute Force)';
  } else if (log.source === 'Firewall' && log.action === 'large_data_transfer' && (log.bytes || 0) > 5000000) {
    isAnomalous = true;
    severity = 'critical';
    type = 'Possible Data Exfiltration';
  } else if (log.source === 'VPN' && log.action === 'login' && log.location === 'Outside Expected Country') {
    isAnomalous = true;
    severity = 'medium';
    type = 'Impossible Travel / VPN Login Anomaly';
  } else if (log.source === 'Endpoint' && log.action === 'privilege_escalation') {
    isAnomalous = true;
    severity = 'critical';
    type = 'Privilege Escalation Detected';
  }

  let emittedAlert = null;
  let finalUsers = [];

  if (isAnomalous) {
    const { updatedData, createdAlert } = await createSystemAlert(
      type,
      severity,
      log.user || 'system',
      log
    );
    emittedAlert = createdAlert;
    finalUsers = updatedData.users;
  } else {
    // Non-anomalous: still upsert user activity
    const updated = await store.update(async (current) => {
      const nextUsers = upsertUserFromActivity(current.users, log.user);
      return { ...current, users: nextUsers };
    });
    finalUsers = updated.users;
  }

  emitLiveState(finalUsers, computeGlobalScore(finalUsers));
  if (emittedAlert) {
    const { emitNewAlert } = require('../lib/liveSocket');
    emitNewAlert(emittedAlert);
  }

  res.status(200).json({ status: 'Received', anomalous: isAnomalous });
});

// === ALERTS ===
router.get('/alerts', requireAuth(['analyst', 'admin']), async (req, res) => {
  const state = await store.read();
  logAuditEvent({
    action: 'alerts.read',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });
  res.json([...state.alerts].sort(sortByTimestampDesc));
});

router.post('/alerts', requireAuth(['analyst', 'admin']), async (req, res) => {
  const payload = parseOrReject(alertCreateSchema, req.body, res);
  if (!payload) {
    return;
  }

  const { updatedData, createdAlert } = await createSystemAlert(
    payload.type,
    payload.severity,
    payload.user
  );

  emitLiveState(updatedData.users, computeGlobalScore(updatedData.users));
  const { emitNewAlert } = require('../lib/liveSocket');
  emitNewAlert(createdAlert);

  res.status(201).json(createdAlert);
});

// === CASES ===
router.get('/cases', requireAuth(['analyst', 'admin']), async (req, res) => {
  const state = await store.read();
  logAuditEvent({
    action: 'cases.read',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  const filteredCases = req.auth.role === 'admin' 
    ? state.cases 
    : state.cases.filter(c => c.assignee === req.auth.sub);

  res.json([...filteredCases].sort(sortByCreatedDesc));
});

router.post('/cases', requireAuth(['analyst', 'admin']), async (req, res) => {
  const payload = parseOrReject(caseCreateSchema, req.body, res);
  if (!payload) {
    return;
  }

  const newCase = {
    id: `CAS-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
    title: payload.title,
    status: payload.status,
    severity: payload.severity,
    assignee: payload.assignee,
    createdAt: new Date().toISOString()
  };

  await store.update(async (current) => ({
    ...current,
    cases: [newCase, ...current.cases].sort(sortByCreatedDesc)
  }));

  res.status(201).json(newCase);
});

router.patch('/cases/:id', requireAuth(['analyst', 'admin']), async (req, res) => {
  const payload = parseOrReject(caseUpdateSchema, req.body, res);
  if (!payload) return;

  const state = await store.read();
  const caseIndex = state.cases.findIndex(c => c.id === req.params.id);
  
  if (caseIndex === -1) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const existingCase = state.cases[caseIndex];
  
  // Basic RBAC check for updating
  if (req.auth.role !== 'admin' && existingCase.assignee !== req.auth.sub) {
    return res.status(403).json({ error: 'Forbidden: You can only update your assigned cases.' });
  }

  const updatedCase = { ...existingCase, ...payload, updatedAt: new Date().toISOString() };

  await store.update(async (current) => {
    const nextCases = [...current.cases];
    nextCases[caseIndex] = updatedCase;
    return { ...current, cases: nextCases };
  });

  logAuditEvent({
    action: 'cases.update',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    target: req.params.id
  });

  res.json(updatedCase);
});

// === USERS ===
router.get('/users', requireAuth(['analyst', 'admin']), async (req, res) => {
  const state = await store.read();
  logAuditEvent({
    action: 'users.read',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });
  res.json(state.users);
});

router.get('/stats/global', requireAuth(['analyst', 'admin']), async (req, res) => {
  const state = await store.read();
  logAuditEvent({
    action: 'stats.global.read',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });
  res.json({ score: computeGlobalScore(state.users) });
});

router.get('/users/:username', requireAuth(['analyst', 'admin']), async (req, res) => {
  const state = await store.read();
  const user = state.users.find((u) => u.username === req.params.username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userAlerts = state.alerts.filter((a) => a.user === user.username);
  logAuditEvent({
    action: 'users.profile.read',
    outcome: 'success',
    actor: req.auth.sub,
    role: req.auth.role,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    metadata: { targetUser: req.params.username }
  });
  res.json({ ...user, alerts: userAlerts });
});

module.exports = { router, setIo };

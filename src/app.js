'use strict';
// Patient-records API for the VLE-9 DevSecOps lab.
// All patient data below is SYNTHETIC. No real PHI is stored or processed.
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const client = require('prom-client');

// ---------- metrics (Prometheus) ----------
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequests = new client.Counter({
  name: 'http_requests_total', help: 'HTTP requests by method, route and status',
  labelNames: ['method', 'route', 'status'], registers: [register],
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds', help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'], buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1], registers: [register],
});
const failedLogins = new client.Counter({
  name: 'failed_login_total', help: 'Failed login attempts', labelNames: ['reason'], registers: [register],
});
const successfulLogins = new client.Counter({
  name: 'successful_login_total', help: 'Successful logins', registers: [register],
});

// ---------- synthetic data ----------
const CONDITIONS = ['Hypertension', 'Diabetes Type 2', 'Asthma', 'Migraine', 'Healthy'];
const patients = new Map([
  ['P1001', { id: 'P1001', name: 'Synthetic Patient A', age: 54, bloodGroup: 'O+', condition: 'Hypertension', insuranceId: 'INS-XXXX-4821' }],
  ['P1002', { id: 'P1002', name: 'Synthetic Patient B', age: 37, bloodGroup: 'A-', condition: 'Asthma', insuranceId: 'INS-XXXX-1290' }],
  ['P1003', { id: 'P1003', name: 'Synthetic Patient C', age: 61, bloodGroup: 'B+', condition: 'Diabetes Type 2', insuranceId: 'INS-XXXX-7734' }],
]);

// ---------- validation ----------
const ID_RE = /^P\d{4}$/;
const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,59}$/;
const USER_RE = /^[a-z0-9._-]{3,32}$/i;
const PATIENT_FIELDS = new Set(['name', 'age', 'condition']);

function validatePatient(body) {
  const errors = [];
  for (const k of Object.keys(body || {})) if (!PATIENT_FIELDS.has(k)) errors.push(`unexpected field: ${k}`);
  if (typeof body?.name !== 'string' || !NAME_RE.test(body.name)) errors.push('name: 2-60 letters, spaces . \' -');
  if (!Number.isInteger(body?.age) || body.age < 0 || body.age > 130) errors.push('age: integer 0-130');
  if (!CONDITIONS.includes(body?.condition)) errors.push(`condition: one of ${CONDITIONS.join(', ')}`);
  return errors;
}

// ---------- auth: HMAC-signed, expiring tokens; secrets only from env ----------
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));
const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

function createApp(env = process.env) {
  for (const k of ['AUTH_USERNAME', 'AUTH_PASSWORD', 'SESSION_SECRET']) {
    if (!env[k]) throw new Error(`missing required env var ${k} (inject it from a Kubernetes Secret)`);
  }
  const issueToken = (user) => {
    const payload = Buffer.from(JSON.stringify({ sub: user, exp: Date.now() + 15 * 60 * 1000 })).toString('base64url');
    return `${payload}.${sign(payload, env.SESSION_SECRET)}`;
  };
  const verifyToken = (token) => {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig || !safeEqual(sig, sign(payload, env.SESSION_SECRET))) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return claims.exp > Date.now() ? claims : null;
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  // PHI must never be stored by browsers or proxies (fixes ZAP 10049 "Storable and Cacheable Content")
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const labels = { method: req.method, route: req.route ? req.baseUrl + req.route.path : 'unmatched', status: res.statusCode };
      httpRequests.inc(labels);
      end(labels);
    });
    next();
  });

  const requireAuth = (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    const claims = m && verifyToken(m[1]);
    if (!claims) return res.status(401).json({ error: 'unauthorized' });
    req.user = claims.sub;
    next();
  };

  app.get('/', (req, res) => res.json({ service: 'healthcare-patient-api', data: 'synthetic only', endpoints: ['/health', '/login', '/api/patients', '/metrics'] }));
  app.get('/health', (req, res) => res.json({ status: 'ok', dbCredentialLoaded: Boolean(env.DB_PASSWORD) }));
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !USER_RE.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      failedLogins.inc({ reason: 'invalid_input' });
      return res.status(400).json({ error: 'invalid input' });
    }
    // evaluate both comparisons (no short-circuit) so timing does not reveal which part was wrong
    const userOk = safeEqual(username, env.AUTH_USERNAME);
    const passOk = safeEqual(password, env.AUTH_PASSWORD);
    if (!(userOk && passOk)) {
      failedLogins.inc({ reason: 'bad_credentials' });
      console.log(JSON.stringify({ event: 'login_failed', ip: req.ip, at: new Date().toISOString() }));
      return res.status(401).json({ error: 'invalid credentials' });
    }
    successfulLogins.inc();
    res.json({ token: issueToken(username), expiresIn: 900 });
  });

  app.get('/api/patients', requireAuth, (req, res) => res.json([...patients.values()]));
  app.get('/api/patients/:id', requireAuth, (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'id must match P0000' });
    const p = patients.get(req.params.id);
    return p ? res.json(p) : res.status(404).json({ error: 'not found' });
  });
  app.post('/api/patients', requireAuth, (req, res) => {
    const errors = validatePatient(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const id = `P${1000 + patients.size + 1}`;
    const p = { id, ...req.body, bloodGroup: 'unknown', insuranceId: 'pending' };
    patients.set(id, p);
    res.status(201).json(p);
  });

  app.use((req, res) => res.status(404).json({ error: 'not found' }));
  // never leak stack traces
  app.use((err, req, res, next) => res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.status < 500 ? 'bad request' : 'internal error' }));
  return app;
}

module.exports = { createApp, validatePatient };

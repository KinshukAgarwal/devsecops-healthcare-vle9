'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createApp, validatePatient } = require('../src/app');

// throwaway test-only values, not real secrets
const env = { AUTH_USERNAME: 'dr.test', AUTH_PASSWORD: 'test-password-123', SESSION_SECRET: 'test-session-secret' };

test('validatePatient rejects bad input and extra fields', () => {
  assert.deepStrictEqual(validatePatient({ name: 'Jane Doe', age: 30, condition: 'Asthma' }), []);
  assert.ok(validatePatient({ name: '<script>', age: 30, condition: 'Asthma' }).length);
  assert.ok(validatePatient({ name: 'Jane', age: 200, condition: 'Asthma' }).length);
  assert.ok(validatePatient({ name: 'Jane', age: 30, condition: 'Asthma', isAdmin: true }).length);
});

test('app refuses to start without secrets from env', () => {
  assert.throws(() => createApp({}), /missing required env var/);
});

test('login, auth, validation and metrics end to end', async (t) => {
  const server = createApp(env).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  assert.strictEqual((await fetch(`${base}/api/patients`)).status, 401);
  assert.strictEqual((await post('/login', { username: 'dr.test', password: 'wrong-password' })).status, 401);
  assert.strictEqual((await post('/login', { username: '../etc', password: 'x' })).status, 400);

  const res = await post('/login', { username: 'dr.test', password: 'test-password-123' });
  assert.strictEqual(res.status, 200);
  const auth = { authorization: `Bearer ${(await res.json()).token}` };

  const list = await fetch(`${base}/api/patients`, { headers: auth });
  assert.strictEqual(list.status, 200);
  assert.ok((await list.json()).length >= 3);
  assert.strictEqual((await fetch(`${base}/api/patients/1;DROP`, { headers: auth })).status, 400);
  assert.strictEqual((await post('/api/patients', { name: 'New Synthetic', age: 40, condition: 'Healthy' }, auth)).status, 201);
  assert.strictEqual((await post('/api/patients', { name: 'X', age: -1 }, auth)).status, 400);

  const headers = (await fetch(`${base}/health`)).headers;
  assert.ok(headers.get('x-content-type-options'), 'helmet headers present');
  assert.strictEqual(headers.get('x-powered-by'), null);
  assert.strictEqual(headers.get('cache-control'), 'no-store');

  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /failed_login_total\{reason="bad_credentials"\} 1/);
  assert.match(metrics, /http_requests_total\{method="GET",route="\/api\/patients",status="401"\} 1/);
});

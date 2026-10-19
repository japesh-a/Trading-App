import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { googleClientIdProblem, passwordSignupEnabled } from './auth-service.mjs';

const clientId = 'test-client.apps.googleusercontent.com';
const pilot = 'https://pilot.example.org';

async function fixture(env = {}) {
  const time = { now: Date.parse('2026-09-25T12:00:00Z') };
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => time.now, env,
    googleVerifier: async credential => {
      if (credential === 'bad') throw Error('Token used too late');
      return { sub: 'sub-' + credential, email: credential + '@example.com', email_verified: true, name: 'Pilot ' + credential };
    } });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  return { call, db, time, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
const cookieOf = response => ({ Origin: pilot, Cookie: response.headers.get('set-cookie').split(';')[0] });

test('client id checks reject secrets and malformed values', () => {
  assert.equal(googleClientIdProblem(''), '');
  assert.equal(googleClientIdProblem(clientId), '');
  assert.match(googleClientIdProblem('GOCSPX-abcdef'), /apps\.googleusercontent\.com/);
  assert.match(googleClientIdProblem('a b.apps.googleusercontent.com'), /whitespace/);
  assert.equal(passwordSignupEnabled({}), true);
  assert.equal(passwordSignupEnabled({ WICKLUME_PASSWORD_SIGNUP: 'false' }), false);
});

test('a malformed GOOGLE_CLIENT_ID is not advertised and Google sign in stays off', async () => {
  const warn = console.warn; console.warn = () => {};
  const f = await fixture({ GOOGLE_CLIENT_ID: 'GOCSPX-not-a-client-id', WICKLUME_ALLOWED_ORIGIN: pilot });
  console.warn = warn;
  try {
    assert.equal((await f.call('/config')).data.googleClientId, '');
    assert.equal((await f.call('/auth/google', { credential: 'x' }, { Origin: pilot })).status, 503);
  } finally { await f.close(); }
});

test('Google sign in honours the allowed-origin list, rejects bad tokens, and one Google user keeps one account', async () => {
  const f = await fixture({ GOOGLE_CLIENT_ID: clientId, WICKLUME_ALLOWED_ORIGIN: pilot });
  try {
    assert.equal((await f.call('/auth/google', { credential: 'ann' }, { Origin: 'https://other.example.org' })).status, 403);
    assert.equal((await f.call('/auth/google', { credential: 'bad' }, { Origin: pilot })).status, 401, 'expired or invalid tokens');
    assert.equal((await f.call('/auth/google', { credential: 'x'.repeat(9000) }, { Origin: pilot })).status, 400);
    const first = await f.call('/auth/google', { credential: 'ann' }, { Origin: pilot });
    const second = await f.call('/auth/google', { credential: 'ann' }, { Origin: pilot });
    assert.equal(first.status, 200);
    assert.equal(second.data.account.id, first.data.account.id);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM accounts').get().n, 1);
    assert.equal((await f.call('/config')).data.googleVerifiesAge, false, 'Google identity is not an age check');
  } finally { await f.close(); }
});

test('sign out ends the session; sign out everywhere ends every device', async () => {
  const f = await fixture({ GOOGLE_CLIENT_ID: clientId, WICKLUME_ALLOWED_ORIGIN: pilot });
  try {
    const phone = await f.call('/auth/google', { credential: 'ann' }, { Origin: pilot });
    const laptop = await f.call('/auth/google', { credential: 'ann' }, { Origin: pilot });
    assert.equal((await f.call('/auth/me', undefined, cookieOf(phone))).data.account.email, 'ann@example.com');
    await f.call('/auth/logout', {}, cookieOf(phone));
    assert.equal((await f.call('/auth/me', undefined, cookieOf(phone))).status, 401);
    assert.equal((await f.call('/auth/me', undefined, cookieOf(laptop))).status, 200, 'plain sign out keeps other devices');
    assert.equal((await f.call('/auth/logout-all', {})).status, 401, 'needs a login');
    const out = await f.call('/auth/logout-all', {}, cookieOf(laptop));
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await f.call('/auth/me', undefined, cookieOf(laptop))).status, 401);
  } finally { await f.close(); }
});

test('login sessions expire after seven days', async () => {
  const f = await fixture({ GOOGLE_CLIENT_ID: clientId, WICKLUME_ALLOWED_ORIGIN: pilot });
  try {
    const signedIn = await f.call('/auth/google', { credential: 'ann' }, { Origin: pilot });
    f.time.now += 6 * 86400000;
    assert.equal((await f.call('/auth/me', undefined, cookieOf(signedIn))).status, 200);
    f.time.now += 2 * 86400000;
    assert.equal((await f.call('/auth/me', undefined, cookieOf(signedIn))).status, 401);
    assert.equal((await f.call('/auth/google', { credential: 'ann' }, { Origin: pilot })).status, 200, 'signing in again restores the same account');
  } finally { await f.close(); }
});

test('Google-only pilot closes email sign up but keeps Google sign in and existing logins', async () => {
  const open = await fixture({ WICKLUME_ALLOWED_ORIGIN: pilot });
  const body = { email: 'old@example.com', password: 'a-long-test-password', displayName: 'Old' };
  try {
    assert.equal((await open.call('/auth/register', body)).status, 201);
  } finally { await open.close(); }
  const closed = await fixture({ GOOGLE_CLIENT_ID: clientId, WICKLUME_ALLOWED_ORIGIN: pilot, WICKLUME_PASSWORD_SIGNUP: 'false' });
  try {
    assert.equal((await closed.call('/auth/register', body)).status, 403);
    assert.equal(closed.db.prepare('SELECT count(*) AS n FROM accounts').get().n, 0);
    assert.equal((await closed.call('/config')).data.passwordSignup, false);
    assert.equal((await closed.call('/auth/google', { credential: 'ann' }, { Origin: pilot })).status, 200);
  } finally { await closed.close(); }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { contentSecurityPolicy, legacyProgressEnabled, mayRecordVerified } from './security.mjs';

async function fixture(env = {}) {
  const now = Date.parse('2026-09-25T12:00:00Z'), day = '2026-09-25', midnight = Date.parse(day + 'T00:00:00Z') / 1000;
  const candles = Array.from({ length: 144 }, (_, i) => ({ time: midnight - 36 * 3600 + i * 900, open: 100, high: 103, low: 98, close: 102, volume: 1 }));
  const challenge = { id: day + '-BTC-15m', day, marketDate: '2026-09-24', instrument: 'BTC', interval: 900,
    history: candles.slice(0, 48), future: candles.slice(48), source: 'Test provider', demo: false, selection: 'Fixed UTC session' };
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => now, env,
    challengeProvider: async () => challenge,
    quoteProvider: async () => ({ price: 100, time: now / 1000, source: 'Quote fixture', demo: false }),
    marketProvider: async () => ({ candles: [{ time: Math.floor(now / 60000) * 60, open: 100, high: 101, low: 99, close: 100, volume: 1 }], price: 100, time: now / 1000, source: 'Market fixture', demo: false, interval: 60 }) });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, auth = {}, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}), ...(auth.cookie ? { Cookie: auth.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  const guest = async () => ({ token: (await call('/session', {})).data.token });
  const account = async email => {
    const response = await call('/auth/register', { email, password: 'a-long-test-password', displayName: 'Tester' });
    return { cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  return { call, db, guest, account, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
const decision = { challengeId: '2026-09-25-BTC-15m', order: { side: 'buy', entry: 102, stopLoss: 97, takeProfit: 110, quantity: 10 },
  reasoning: 'I will invalidate below the range low and size the risk first.', displayName: 'Alex' };
const paperOrder = { symbol: 'BTC', order: { side: 'buy', entry: 100, stopLoss: 95, takeProfit: 110, quantity: 1 } };

test('guest sessions cannot create verified daily results or paper rankings', async () => {
  const f = await fixture();
  try {
    const guest = await f.guest();
    assert.equal((await f.call('/daily/submit', decision, guest)).status, 403);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trading_daily_results').get().n, 0);
    const paper = await f.call('/paper/open', paperOrder, guest);
    assert.equal(paper.status, 200);
    assert.equal(paper.data.trade.serverVerified, false);
    assert.equal(paper.data.trade.ranked, false);
    assert.equal((await f.call('/config')).data.verifiedRequiresAccount, true);
    const owner = await f.account('owner@example.com');
    const verified = await f.call('/daily/submit', decision, owner);
    assert.equal(verified.status, 200);
    assert.equal(verified.data.trade.serverVerified, true);
    const board = await f.call('/leaderboard?mode=daily', undefined, guest);
    assert.equal(board.data.entries.length, 1, 'Only account results are ranked');
  } finally { await f.close(); }
});

test('operators can opt anonymous sessions back in explicitly', () => {
  assert.equal(mayRecordVerified({ id: 'x' }, {}), false);
  assert.equal(mayRecordVerified({ id: 'x', account_id: 'a' }, {}), true);
  assert.equal(mayRecordVerified({ id: 'x' }, { WICKLUME_ANONYMOUS_VERIFIED: 'true' }), true);
});

test('browser-edited scores are ignored and duplicate or concurrent submissions are rejected', async () => {
  const f = await fixture();
  try {
    const owner = await f.account('owner@example.com');
    const results = await Promise.all(Array.from({ length: 6 }, () => f.call('/daily/submit', { ...decision, pnl: 999999, trade: { pnl: 999999, serverVerified: true } }, owner)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert(results.filter(r => r.status !== 200).every(r => r.status === 409));
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trading_daily_results').get().n, 1);
    const kept = results.find(r => r.status === 200).data.trade;
    assert.notEqual(kept.pnl, 999999);
    assert.throws(() => f.db.prepare('INSERT INTO trading_daily_results VALUES(?,?,?,?)').run(f.db.prepare('SELECT session_id FROM trading_daily_results').get().session_id, '2026-09-25', 'other-trade', '{}'), /UNIQUE/);
  } finally { await f.close(); }
});

test('one account cannot read or use another account\'s records', async () => {
  const f = await fixture();
  try {
    const alice = await f.account('alice@example.com'), bob = await f.account('bob@example.com');
    const done = await f.call('/daily/submit', decision, alice);
    assert.equal((await f.call('/daily/result', undefined, bob)).status, 404);
    assert.equal((await f.call('/journal', undefined, bob)).data.trades.length, 0);
    assert.equal((await f.call('/journal', undefined, alice)).data.trades[0].id, done.data.trade.id);
    assert.equal((await f.call('/progress', undefined, bob)).data.attempts, 0);
    assert.equal((await f.call('/journal', undefined, { cookie: 'wicklume_account=forged' })).status, 401);
    assert.equal((await f.call('/journal')).status, 401);
  } finally { await f.close(); }
});

test('cross-site state changes are refused and audit records stay private and free of secrets', async () => {
  const f = await fixture();
  try {
    const owner = await f.account('owner@example.com');
    assert.equal((await f.call('/profile', { displayName: 'Mallory' }, owner, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await f.call('/profile', { displayName: 'Mallory' }, owner, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await f.call('/profile', { displayName: 'Mallory' }, owner, { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
    await f.call('/auth/login', { email: 'owner@example.com', password: 'wrong-password-here' });
    const rows = f.db.prepare('SELECT * FROM audit_log').all();
    assert(rows.some(row => row.event === 'POST /auth/login' && row.detail === '401'));
    assert(rows.some(row => row.event === 'POST /auth/register'));
    assert(rows.every(row => row.ip_hash === null || row.ip_hash.length === 16));
    assert(!JSON.stringify(rows).includes('wrong-password-here') && !JSON.stringify(rows).includes('a-long-test-password'));
    assert.equal((await f.call('/audit', undefined, owner)).status, 404, 'No route exposes the audit log');
  } finally { await f.close(); }
});

test('rate limits throttle repeated requests', async () => {
  const f = await fixture();
  try {
    const guest = await f.guest();
    const statuses = [];
    for (let i = 0; i < 190; i++) statuses.push((await f.call('/progress', undefined, guest)).status);
    assert(statuses.includes(429));
  } finally { await f.close(); }
});

test('security headers allow Google sign-in and legacy progress endpoints are retired in production', async () => {
  const policy = contentSecurityPolicy();
  assert(policy.includes('https://accounts.google.com/gsi/client') && policy.includes("frame-ancestors 'none'") && policy.includes("object-src 'none'"));
  assert.equal(legacyProgressEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(legacyProgressEnabled({ NODE_ENV: 'production', WICKLUME_LEGACY_PROGRESS: 'true' }), true);
  assert.equal(legacyProgressEnabled({}), true);
  const port = 5191, base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', WICKLUME_PERSISTENT_DISK: 'true', WICKLUME_PORT: String(port), WICKLUME_DB: ':memory:' } });
  try {
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) { try { ready = (await fetch(base + '/healthz')).ok; } catch { await delay(100); } }
    assert(ready, 'Server did not start');
    for (const route of ['/api/progress', '/api/answer', '/api/decision']) {
      const response = await fetch(base + route, route === '/api/progress' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 410, route);
    }
    const page = await fetch(base + '/');
    assert(page.headers.get('content-security-policy').includes('accounts.google.com'));
    assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    assert(page.headers.get('strict-transport-security'));
  } finally { child.kill(); }
});

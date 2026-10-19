import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios } from './scenario-bank.mjs';
import { chooseScenario, allocateScenario, RECENT_DAYS } from './scenario-allocation.mjs';
import { runMigrations } from './migrations.mjs';

const { scenarios } = await loadScenarios();
const pool = scenarios; // valid synthetic samples stand in for an approved pool

async function fixture({ file = ':memory:', poolOption = pool, time = { now: Date.parse('2026-10-01T12:00:00Z') } } = {}) {
  const db = new DatabaseSync(file);
  const service = createTradingService(db, { clock: () => time.now, env: {}, scenarioPool: async () => poolOption });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  let n = 0;
  const signUp = async (name = 'Ann') => {
    const email = `${name.toLowerCase()}${++n}@example.com`;
    const response = await call('/auth/register', { email, password: 'correct horse battery', displayName: name });
    return { cookie: { Cookie: response.headers.get('set-cookie').split(';')[0] }, id: response.data.account.id, email };
  };
  const login = async email => (await call('/auth/login', { email, password: 'correct horse battery' })).headers.get('set-cookie');
  return { call, db, time, signUp, login, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('guests cannot receive a saved assignment; an empty pool gives 503', async () => {
  const f = await fixture({ poolOption: [] });
  try {
    const guest = await f.call('/session', {});
    assert.equal((await f.call('/scenario/today', undefined, { Authorization: 'Bearer ' + guest.data.token })).status, 401);
    const user = await f.signUp();
    assert.equal((await f.call('/scenario/today', undefined, user.cookie)).status, 503);
  } finally { await f.close(); }
});

test('same account and day always gets the same assignment, with an opaque id and no answers', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const first = await f.call('/scenario/today', undefined, user.cookie);
    assert.equal(first.status, 200);
    const again = await f.call('/scenario/today', undefined, user.cookie);
    assert.deepEqual(again.data, first.data);
    assert.match(first.data.assignmentId, /^sc_[\w-]{16}$/);
    const text = JSON.stringify(first.data);
    for (const s of pool) assert.ok(!text.includes(s.id), 'internal id leaked');
    for (const key of ['family', 'outcomeBars', 'outcomeLabel', 'teachingNotes', 'provenance', 'id']) assert.ok(!(key in first.data), key);
    // A second sign-in (another device) sees the same scenario.
    const cookie = { Cookie: (await f.login(user.email)).split(';')[0] };
    assert.deepEqual((await f.call('/scenario/today', undefined, cookie)).data, first.data);
  } finally { await f.close(); }
});

test('concurrent duplicate requests produce one stored assignment', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const results = await Promise.all(Array.from({ length: 12 }, () => f.call('/scenario/today', undefined, user.cookie)));
    assert.equal(new Set(results.map(r => r.data.assignmentId)).size, 1);
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_assignments').get().c, 1);
  } finally { await f.close(); }
});

test('clients cannot choose or reroll: query, body and headers are ignored', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const first = await f.call('/scenario/today', undefined, user.cookie);
    const assigned = f.db.prepare('SELECT scenario_id FROM scenario_assignments').get().scenario_id;
    const other = pool.find(s => s.id !== assigned);
    for (const route of [`/scenario/today?scenario=${other.id}&reroll=1&seed=7`, `/scenario/today?id=${other.id}`])
      assert.deepEqual((await f.call(route, undefined, { ...user.cookie, 'X-Scenario': other.id })).data, first.data);
    for (const route of ['/scenario/today', '/scenario/reroll', '/scenario/choose']) {
      const posted = await f.call(route, { scenario: other.id, reroll: true }, user.cookie);
      assert.ok(posted.status >= 400, route);
    }
    assert.equal(f.db.prepare('SELECT scenario_id FROM scenario_assignments').get().scenario_id, assigned);
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_assignments').get().c, 1);
  } finally { await f.close(); }
});

test('allocation survives a server restart and is recorded per day', async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'wick-alloc-')), 'a.db');
  const time = { now: Date.parse('2026-10-01T12:00:00Z') };
  let f = await fixture({ file, time });
  const user = await f.signUp();
  const first = await f.call('/scenario/today', undefined, user.cookie);
  await f.close();
  f = await fixture({ file, time });
  try {
    const cookie = { Cookie: (await f.login(user.email)).split(';')[0] };
    assert.deepEqual((await f.call('/scenario/today', undefined, cookie)).data, first.data);
    f.time.now += 24 * 3600 * 1000;
    const next = await f.call('/scenario/today', undefined, cookie);
    assert.equal(next.status, 200);
    assert.notEqual(next.data.assignmentId, first.data.assignmentId);
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_assignments').get().c, 2);
  } finally { await f.close(); }
});

test('recent scenarios are not repeated while unseen ones remain', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const seen = [];
  for (let d = 1; d <= pool.length; d++) {
    const a = allocateScenario({ db, accountId: 'acct', day: `2026-10-${String(d).padStart(2, '0')}`, pool });
    assert.ok(!seen.includes(a.scenario_id), 'repeat before the pool was exhausted');
    seen.push(a.scenario_id);
  }
  // Pool exhausted: the least recently used is reused, never the most recent.
  const next = allocateScenario({ db, accountId: 'acct', day: '2026-11-30', pool });
  assert.equal(next.scenario_id, seen[0]);
  assert.ok(RECENT_DAYS > 0);
});

test('difficulty is spread fairly and different users can get different scenarios', () => {
  const history = [{ day: 'd1', scenario_id: 'x', difficulty: 'beginner' }, { day: 'd2', scenario_id: 'y', difficulty: 'beginner' }];
  const fake = [{ id: 'a', difficulty: 'beginner' }, { id: 'b', difficulty: 'advanced' }];
  for (let i = 0; i < 10; i++) assert.equal(chooseScenario(fake, history).id, 'b');
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const picks = new Set();
  for (let i = 0; i < 40; i++) picks.add(allocateScenario({ db, accountId: 'u' + i, day: '2026-10-01', pool }).scenario_id);
  assert.ok(picks.size > 1, 'all users received the same scenario');
  const ids = db.prepare('SELECT public_id FROM scenario_assignments').all().map(r => r.public_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('account deletion erases assignments and export lists them without internal ids', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.call('/scenario/today', undefined, user.cookie);
    const exported = await f.call('/privacy/export', undefined, user.cookie);
    assert.equal(exported.data.scenarioAssignments.length, 1);
    assert.ok(!JSON.stringify(exported.data.scenarioAssignments).includes('scenario_id'));
    const del = await f.call('/privacy/delete', { confirm: 'DELETE' }, user.cookie);
    assert.ok(del.status < 400, JSON.stringify(del.data));
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_assignments').get().c, 0);
  } finally { await f.close(); }
});

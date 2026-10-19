import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios } from './scenario-bank.mjs';
import { lessons } from './curriculum.mjs';
import { recordActivity, streakReport, streakMigration } from './streak.mjs';

const { scenarios: pool } = await loadScenarios();
const right = question => (3 - question % 3) % 3;
const DAY = 86400000;

async function fixture(start = '2026-10-05T12:00:00Z') {
  const time = { now: Date.parse(start) };
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => time.now, env: {}, scenarioPool: async () => pool });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  let n = 0;
  const signUp = async () => {
    const response = await call('/auth/register', { email: `streak${++n}@example.com`, password: 'correct horse battery', displayName: 'Sam' });
    return { cookie: { Cookie: response.headers.get('set-cookie').split(';')[0] }, id: response.data.account.id };
  };
  const lesson = async (user, id, pick = right) => { for (let q = 0; q < lessons[id].questions.length; q++) await call('/answer', { id, question: q, answer: pick(q) }, user.cookie); };
  const streak = async user => (await call('/streak', undefined, user.cookie)).data;
  return { call, db, time, signUp, lesson, streak, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('streak needs an account', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/streak')).status, 401);
    const guest = await f.call('/session', {});
    assert.equal((await f.call('/streak', undefined, { Authorization: 'Bearer ' + guest.data.token })).status, 401);
  } finally { await f.close(); }
});

test('a partly answered lesson does not count; a completed lesson quiz does, even answered badly', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    for (let q = 0; q < 3; q++) await f.call('/answer', { id: 0, question: q, answer: right(q) }, user.cookie);
    assert.equal((await f.streak(user)).current, 0);
    // Finish lesson 0 with every remaining answer wrong: accuracy never affects the streak.
    for (let q = 3; q < lessons[0].questions.length; q++) await f.call('/answer', { id: 0, question: q, answer: (right(q) + 1) % 3 }, user.cookie);
    const report = await f.streak(user);
    assert.equal(report.current, 1);
    assert.equal(report.activeToday, true);
    assert.deepEqual(report.week.find(d => d.today).activities, ['lesson_quiz']);
  } finally { await f.close(); }
});

test('several activities in one day combine into one streak day', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.lesson(user, 0); await f.lesson(user, 1);
    const report = await f.streak(user);
    assert.equal(report.current, 1);
    assert.equal(report.totalDays, 1);
    assert.equal(f.db.prepare('SELECT count(*) c FROM activity_events WHERE account_id=?').get(user.id).c, 2);
  } finally { await f.close(); }
});

test('consecutive UTC days build the streak, a missed day resets it and the best is kept', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    for (let i = 0; i < 3; i++) { await f.lesson(user, i); f.time.now += DAY; }
    // Today (day 4) is still open: the streak of 3 is intact.
    assert.deepEqual([(await f.streak(user)).current, (await f.streak(user)).activeToday], [3, false]);
    f.time.now += DAY; // a whole day passes with nothing completed
    const reset = await f.streak(user);
    assert.deepEqual([reset.current, reset.best], [0, 3]);
    await f.lesson(user, 3);
    const again = await f.streak(user);
    assert.deepEqual([again.current, again.best], [1, 3]);
    assert.match(again.note, /midnight UTC/);
    assert.ok(Date.parse(again.resetsAt) > f.time.now && Date.parse(again.resetsAt) - f.time.now <= DAY);
  } finally { await f.close(); }
});

test('weekly history lists Monday to Sunday with the days that were active', async () => {
  const f = await fixture('2026-10-05T12:00:00Z'); // a Monday
  try {
    const user = await f.signUp();
    await f.lesson(user, 0); f.time.now += 2 * DAY; // Wednesday
    await f.lesson(user, 1);
    const { week } = await f.streak(user);
    assert.deepEqual(week.map(d => d.day), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    assert.deepEqual(week.map(d => d.active), [true, false, true, false, false, false, false]);
    assert.equal(week[2].today, true);
  } finally { await f.close(); }
});

test('a daily challenge committed with reasoning counts whether it wins or loses, and is stored once', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const assigned = (await f.call('/scenario/today', undefined, user.cookie)).data;
    assert.equal((await f.streak(user)).current, 0, 'viewing a challenge is not enough');
    const plan = { assignmentId: assigned.assignmentId, decision: 'none', reasoning: { observation: 'Price is chopping sideways with no clear structure on this chart.', invalidation: 'A clean break and hold outside the range would change my mind.', noTradeReason: 'unclear_structure' } };
    assert.equal((await f.call('/scenario/commit', plan, user.cookie)).status, 201);
    assert.equal((await f.call('/scenario/commit', plan, user.cookie)).status, 200);
    const report = await f.streak(user);
    assert.equal(report.current, 1);
    assert.deepEqual(report.week.find(d => d.today).activities, ['challenge']);
    assert.equal(f.db.prepare("SELECT count(*) c FROM activity_events WHERE account_id=? AND kind='challenge'").get(user.id).c, 1);
  } finally { await f.close(); }
});

test('the daily coach counts once both questions are answered; the reflection is optional', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    for (let id = 0; id < 21; id++) { f.time.now += 61000; await f.lesson(user, id); }
    f.time.now += DAY;
    const today = (await f.call('/coach/today', undefined, user.cookie)).data;
    assert.equal((await f.streak(user)).activeToday, false);
    await f.call('/coach/answer', { item: 0, answer: 0 }, user.cookie);
    assert.equal((await f.streak(user)).activeToday, false, 'one question is not a completed set');
    await f.call('/coach/answer', { item: 1, answer: 0 }, user.cookie);
    const report = await f.streak(user);
    assert.equal(report.activeToday, true);
    assert.ok(report.week.find(d => d.today).activities.includes('coach_set'));
    assert.equal(today.items[2].optional, true);
  } finally { await f.close(); }
});

test('paper trades, bare logins and failed requests do not count', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.call('/answer', { id: 0, question: 5, answer: 0 }, user.cookie); // out of order: refused
    await f.call('/journal', undefined, user.cookie);
    assert.equal((await f.streak(user)).current, 0);
    assert.equal(recordActivity(f.db, user.id, '2026-10-05', 'bogus'), false);
    assert.equal(recordActivity(f.db, user.id, 'yesterday', 'lesson_quiz'), false);
  } finally { await f.close(); }
});

test('accounts are isolated, and the streak is the same on a second sign-in', async () => {
  const f = await fixture();
  try {
    const a = await f.signUp(), b = await f.signUp();
    await f.lesson(a, 0);
    assert.equal((await f.streak(a)).current, 1);
    assert.equal((await f.streak(b)).current, 0);
    const second = await f.call('/auth/login', { email: 'streak1@example.com', password: 'correct horse battery' });
    const cookie = { Cookie: second.headers.get('set-cookie').split(';')[0] };
    assert.equal((await f.call('/streak', undefined, cookie)).data.current, 1);
  } finally { await f.close(); }
});

test('existing saved days become history on migration', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE accounts (id TEXT, session_id TEXT); CREATE TABLE trading_learning (session_id TEXT PRIMARY KEY, value TEXT);');
  db.prepare('INSERT INTO accounts VALUES(?,?)').run('acc1', 's1');
  db.prepare('INSERT INTO trading_learning VALUES(?,?)').run('s1', JSON.stringify({ days: ['2026-10-03', '2026-10-04', '2026-10-05', 'not-a-day'] }));
  streakMigration(db); streakMigration(db);
  const report = streakReport(db, 'acc1', '2026-10-05');
  assert.deepEqual([report.current, report.best, report.totalDays], [3, 3, 3]);
  db.close();
});

test('no paid rescue or guilt-based messaging in the streak API', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const text = JSON.stringify(await f.streak(user)).toLowerCase();
    for (const word of ['freeze', 'rescue', 'buy', 'pay', 'lose your', "don't break", 'hurry']) assert.ok(!text.includes(word), word);
    assert.ok(text.includes('profit'), 'rules say profit does not matter');
  } finally { await f.close(); }
});

test('streak events are exported and erased with the account', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.lesson(user, 0);
    const exported = (await f.call('/privacy/export', undefined, user.cookie)).data;
    assert.ok(exported.activityHistory.some(e => e.kind === 'lesson_quiz'));
    const deleted = await f.call('/privacy/delete', { confirm: 'DELETE' }, user.cookie);
    assert.ok([200, 202].includes(deleted.status), JSON.stringify(deleted.data));
    assert.equal(f.db.prepare('SELECT count(*) c FROM activity_events WHERE account_id=?').get(user.id).c, 0);
  } finally { await f.close(); }
});

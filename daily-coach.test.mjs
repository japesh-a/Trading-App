import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { lessons } from './curriculum.mjs';
import { requestDeletion } from './privacy.mjs';

const right = question => (3 - question % 3) % 3, wrong = question => (right(question) + 1) % 3;
const DAY = 86400000;

async function fixture() {
  const time = { now: Date.parse('2026-10-01T12:00:00Z') };
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => time.now, env: {} });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  let n = 0;
  const signUp = async () => {
    const response = await call('/auth/register', { email: `coach${++n}@example.com`, password: 'correct horse battery', displayName: 'Cam' });
    return { cookie: { Cookie: response.headers.get('set-cookie').split(';')[0] }, id: response.data.account.id };
  };
  const finish = async (user, count = 21, pick = right) => {
    for (let id = 0; id < count; id++) { time.now += 61000; for (let q = 0; q < lessons[id].questions.length; q++) await call('/answer', { id, question: q, answer: pick(q) }, user.cookie); }
  };
  return { call, db, time, signUp, finish, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('guests and learners who have not finished the course cannot open the coach', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/coach/today')).status, 401);
    const guest = await f.call('/session', {});
    assert.equal((await f.call('/coach/today', undefined, { Authorization: 'Bearer ' + guest.data.token })).status, 401);
    const user = await f.signUp();
    await f.finish(user, 5);
    assert.equal((await f.call('/coach/today', undefined, user.cookie)).status, 403);
  } finally { await f.close(); }
});

test('three items a day: weak topic, spaced review and an unscored reflection, linked to the curriculum', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.finish(user);
    const today = (await f.call('/coach/today', undefined, user.cookie)).data;
    assert.equal(today.total, 3);
    assert.deepEqual(today.items.map(i => i.kind), ['weak', 'spaced', 'reflection']);
    assert.equal(today.minutes, '3-5');
    for (const item of today.items.slice(0, 2)) {
      assert.equal(item.options.length, 3);
      assert.ok(item.link.lesson >= 0 && item.link.slide >= 0 && item.link.title);
      assert.equal(item.result, undefined, 'no answer revealed before answering');
    }
    assert.notEqual(today.items[0].lesson, today.items[1].lesson);
    assert.equal(today.items[2].basis, 'generic-historical-example', 'no trade history -> generic example');
    assert.match(today.items[2].prompt, /Illustrative/);
    assert.ok(JSON.stringify(today).indexOf('"correct"') === -1);
  } finally { await f.close(); }
});

test('the weak-topic item follows F29 concept evidence', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.finish(user, 21, q => (q === 4 || q === 5) ? wrong(q) : right(q));
    const today = (await f.call('/coach/today', undefined, user.cookie)).data;
    const weak = today.items[0];
    assert.equal(weak.reason.startsWith('You missed 2'), true, weak.reason);
    assert.equal(Math.floor(weak.question / 4), 1, 'a question from the weak section');
  } finally { await f.close(); }
});

test('answers are saved: resume returns them, objective items accept one answer, reflection is stored but unscored', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.finish(user);
    const first = (await f.call('/coach/today', undefined, user.cookie)).data;
    const item = first.items[0];
    const r = await f.call('/coach/answer', { item: 0, answer: right(item.question) }, user.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.data.items[0].result.correct, true);
    assert.match(r.data.items[0].result.explanation, /correct answer/);
    assert.equal((await f.call('/coach/answer', { item: 0, answer: wrong(item.question) }, user.cookie)).status, 409);
    assert.equal((await f.call('/coach/answer', { item: 1, answer: 9 }, user.cookie)).status, 400);
    assert.equal((await f.call('/coach/answer', { item: 2, text: '' }, user.cookie)).status, 400);
    assert.equal((await f.call('/coach/answer', { item: 2, text: 'x'.repeat(601) }, user.cookie)).status, 400);
    assert.equal((await f.call('/coach/answer', { item: 3, answer: 0 }, user.cookie)).status, 400);
    const saved = await f.call('/coach/answer', { item: 2, text: 'I would set a stop first.' }, user.cookie);
    assert.equal(saved.data.items[2].text, 'I would set a stop first.');
    assert.equal(saved.data.items[2].result, undefined, 'reflection has no score');
    // Resume later the same day: same questions, saved answers.
    f.time.now += 3600000;
    const resumed = (await f.call('/coach/today', undefined, user.cookie)).data;
    assert.deepEqual(resumed.items.map(i => i.question), first.items.map(i => i.question));
    assert.equal(resumed.done, 2);
    assert.equal(resumed.items[2].text, 'I would set a stop first.');
    await f.call('/coach/answer', { item: 1, answer: 0 }, user.cookie);
    assert.equal((await f.call('/coach/today', undefined, user.cookie)).data.complete, true);
  } finally { await f.close(); }
});

test('recent questions are not repeated on following days', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.finish(user);
    const asked = new Set();
    for (let day = 0; day < 5; day++) {
      const today = (await f.call('/coach/today', undefined, user.cookie)).data;
      for (const item of today.items.slice(0, 2)) {
        const id = `${item.lesson}.${item.question}`;
        assert.ok(!asked.has(id), `day ${day} repeated ${id}`);
        asked.add(id);
      }
      f.time.now += DAY;
    }
  } finally { await f.close(); }
});

test('concurrent opens create one session; accounts are isolated', async () => {
  const f = await fixture();
  try {
    const a = await f.signUp(), b = await f.signUp();
    await f.finish(a); await f.finish(b);
    const results = await Promise.all(Array.from({ length: 8 }, () => f.call('/coach/today', undefined, a.cookie)));
    assert.equal(new Set(results.map(r => JSON.stringify(r.data.items.map(i => i.question)))).size, 1);
    assert.equal(f.db.prepare('SELECT count(*) c FROM daily_coach_sessions WHERE account_id=?').get(a.id).c, 1);
    await f.call('/coach/answer', { item: 2, text: 'private note' }, a.cookie);
    const other = (await f.call('/coach/today', undefined, b.cookie)).data;
    assert.equal(other.items[2].text, null);
  } finally { await f.close(); }
});

test('reflection refers to recent practice when there is one', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.finish(user);
    f.db.prepare("INSERT INTO scenario_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(user.id, '2026-09-30', 'a1', 's1', 1, 'r', 'f', 'h', '{}', '{}', f.time.now);
    const today = (await f.call('/coach/today', undefined, user.cookie)).data;
    assert.equal(today.items[2].basis, 'recent-practice');
    assert.match(today.items[2].prompt, /2026-09-30/);
  } finally { await f.close(); }
});

test('coach data is in the export and erased with the account', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.finish(user);
    await f.call('/coach/today', undefined, user.cookie);
    await f.call('/coach/answer', { item: 2, text: 'my note' }, user.cookie);
    const exported = JSON.stringify((await f.call('/privacy/export', undefined, user.cookie)).data);
    assert.match(exported, /my note/);
    requestDeletion(f.db, user.id, f.time.now);
    assert.equal(f.db.prepare('SELECT count(*) c FROM daily_coach_sessions WHERE account_id=?').get(user.id).c, 0);
  } finally { await f.close(); }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { lessons } from './curriculum.mjs';
import { conceptEvidence, conceptId, revisionSuggestions, weakTopicForCoach, revisionThreshold } from './revision.mjs';

const right = question => (3 - question % 3) % 3, wrong = question => (right(question) + 1) % 3;

async function fixture(env = {}) {
  let now = Date.parse('2026-10-01T12:00:00Z');
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => now, env: { WICKLUME_ANONYMOUS_VERIFIED: 'true', ...env } });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, token) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const token = (await call('/session', {})).data.token;
  const answer = (id, question, pick) => { now += 61000; return call('/answer', { id, question, answer: pick }, token); };
  return { call, token, answer, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('concepts have stable lesson/section IDs and wrong answers record the misconception', () => {
  assert.equal(conceptId(3, 0), 'L3.S0');
  assert.equal(conceptId(3, 5), 'L3.S1');
  assert.equal(conceptId(3, 9), 'L3.S2');
  const evidence = conceptEvidence({ answers: { 0: [wrong(0), wrong(1)] } }, lessons);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].errors.length, 2);
  assert.ok(lessons[0].questions[0].slice(2).includes(evidence[0].errors[0].misconception), 'misconception is the wrong option picked');
});

test('one error does not trigger; two independent errors on a concept do, privately, with a recap and 2-3 different questions', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/revision')).status, 401);
    await f.answer(0, 0, wrong(0));
    let report = (await f.call('/revision', undefined, f.token)).data;
    assert.equal(report.suggestions.length, 0);
    await f.answer(0, 1, wrong(1));
    report = (await f.call('/revision', undefined, f.token)).data;
    assert.equal(report.suggestions.length, 1, 'available mid-course without completing lessons');
    const [s] = report.suggestions;
    assert.equal(s.concept, 'L0.S0');
    assert.equal(s.evidence.errors, 2);
    assert.deepEqual(s.evidence.questions, [0, 1]);
    assert.deepEqual(s.link, { lesson: 0, slide: 0 });
    assert.ok(s.recap.text.length > 0);
    assert.ok(s.practice.length >= 2 && s.practice.length <= 3);
    assert.ok(s.practice.every(item => !s.evidence.questions.includes(item.question)), 'different questions');
    assert.match(s.explanation, /private/);
    const other = (await f.call('/session', {})).data.token;
    assert.equal((await f.call('/revision', undefined, other)).data.suggestions.length, 0);
  } finally { await f.close(); }
});

test('retries and duplicate submissions are not new evidence; practice answers never change evidence', async () => {
  const f = await fixture();
  try {
    await f.answer(0, 0, wrong(0));
    assert.equal((await f.answer(0, 0, wrong(0))).status, 409, 'duplicate refused');
    assert.equal((await f.call('/revision', undefined, f.token)).data.suggestions.length, 0);
    const check = await f.call('/revision/check', { lesson: 0, question: 5, answer: wrong(5) }, f.token);
    assert.equal(check.data.correct, false);
    assert.equal(check.data.countsAsEvidence, false);
    assert.equal((await f.call('/revision', undefined, f.token)).data.suggestions.length, 0);
    assert.equal((await f.call('/progress', undefined, f.token)).data.attempts, 1);
    assert.equal((await f.call('/revision/check', { lesson: 0, question: 99, answer: 0 }, f.token)).status, 400);
    assert.equal((await f.call('/revision/check', { lesson: 0, question: 0, answer: 0 })).status, 401);
  } finally { await f.close(); }
});

test('errors in different concepts do not combine, and the threshold is configurable', async () => {
  const f = await fixture({ WICKLUME_REVISION_ERRORS: '3' });
  try {
    await f.answer(0, 0, wrong(0)); await f.answer(0, 1, wrong(1)); await f.answer(0, 2, right(2)); await f.answer(0, 3, right(3));
    await f.answer(0, 4, wrong(4));
    assert.equal((await f.call('/revision', undefined, f.token)).data.suggestions.length, 0, 'two errors do not meet a threshold of 3');
    await f.answer(0, 5, right(5)); await f.answer(0, 6, right(6)); await f.answer(0, 7, right(7));
    await f.answer(0, 8, wrong(8)); await f.answer(0, 9, wrong(9));
    assert.equal((await f.call('/revision', undefined, f.token)).data.suggestions.length, 0, 'S0:2, S1:1, S2:2 never reach 3');
  } finally { await f.close(); }
  assert.equal(revisionThreshold({ WICKLUME_REVISION_ERRORS: 'abc' }), 2);
  assert.equal(revisionThreshold({}), 2);
  const progress = { answers: { 0: [wrong(0), wrong(1)], 1: [wrong(0)] } };
  assert.equal(revisionSuggestions(progress, lessons).suggestions.length, 1);
});

test('users can request help with a topic and the coach weak-topic slot reuses the same evidence', () => {
  const none = { answers: {} };
  const requested = revisionSuggestions(none, lessons, { topic: { lesson: 2, section: 1 } });
  assert.equal(requested.suggestions.length, 1);
  assert.equal(requested.suggestions[0].reason, 'requested');
  assert.equal(requested.suggestions[0].concept, 'L2.S1');
  assert.equal(revisionSuggestions(none, lessons, { topic: { lesson: 999, section: 0 } }).suggestions.length, 0);
  assert.equal(weakTopicForCoach(none, lessons), null);
  assert.equal(weakTopicForCoach({ answers: { 4: [wrong(0), wrong(1)] } }, lessons).concept, 'L4.S0');
  assert.equal(weakTopicForCoach(none, lessons, { topic: { lesson: 2, section: 1 } }), null, 'a request is not an automatic trigger');
});

test('free-text notes cannot trigger revision', () => {
  const progress = { answers: {}, notes: { 0: 'I am confused about everything' } };
  assert.equal(revisionSuggestions(progress, lessons).suggestions.length, 0);
});

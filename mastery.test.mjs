import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { lessons } from './curriculum.mjs';
import { masteryReport, recordGraduation, requiredComplete, REQUIRED_LESSONS } from './mastery.mjs';

const right = question => (3 - question % 3) % 3, wrong = question => (right(question) + 1) % 3;

async function fixture() {
  let now = Date.parse('2026-10-01T12:00:00Z');
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => now, env: { WICKLUME_ANONYMOUS_VERIFIED: 'true' } });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, token) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const token = (await call('/session', {})).data.token;
  const answerLesson = async (id, pick = right) => { let last; now += 61000; for (let q = 0; q < lessons[id].questions.length; q++) last = await call('/answer', { id, question: q, answer: pick(q) }, token); return last; };
  return { call, token, answerLesson, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('the required curriculum is 21 lessons and the server confirms completion', async () => {
  const f = await fixture();
  try {
    assert.ok(lessons.length >= REQUIRED_LESSONS);
    assert.equal((await f.call('/mastery')).status, 401);
    for (let id = 0; id < REQUIRED_LESSONS - 1; id++) await f.answerLesson(id);
    let report = (await f.call('/mastery', undefined, f.token)).data;
    assert.equal(report.required.completed, 20);
    assert.equal(report.dailyReviewUnlocked, false);
    assert.equal(report.graduation, null);
    const last = await f.answerLesson(REQUIRED_LESSONS - 1);
    assert.equal(last.data.graduatedNow, true);
    report = (await f.call('/mastery', undefined, f.token)).data;
    assert.equal(report.dailyReviewUnlocked, true);
    assert.equal(report.graduation.requiredLessons, 21);
    assert.equal(report.evidence.accuracy, 100);
    assert.equal(report.revision.recommended, false);
    // Optional lessons beyond the required set neither relock nor re-graduate.
    for (let id = REQUIRED_LESSONS; id < lessons.length; id++) await f.answerLesson(id, wrong);
    const again = (await f.call('/mastery', undefined, f.token)).data;
    assert.equal(again.dailyReviewUnlocked, true);
    assert.deepEqual(again.graduation, report.graduation);
  } finally { await f.close(); }
});

test('completion is distinct from mastery: guessing wrong still completes, with weak areas and revision recommended', async () => {
  const f = await fixture();
  try {
    for (let id = 0; id < REQUIRED_LESSONS; id++) await f.answerLesson(id, wrong);
    const report = (await f.call('/mastery', undefined, f.token)).data;
    assert.equal(report.required.complete, true);
    assert.equal(report.dailyReviewUnlocked, true, 'unlock is based on completion, as before');
    assert.equal(report.evidence.accuracy, 0);
    assert.equal(report.evidence.basis, 'first answers only');
    assert.match(report.mastery.note, /not trading ability or profit/);
    assert.equal(report.mastery.weakSkills.length, 5);
    assert.equal(report.revision.recommended, true);
    assert.ok(report.revision.lessons.length > 0 && report.revision.lessons.every(item => item.accuracy < 75 && Number.isInteger(item.lesson)));
    assert.equal(report.graduation.firstAnswerAccuracy, 0);
  } finally { await f.close(); }
});

test('first-answer evidence is not changed by later behaviour and sessions are isolated', async () => {
  const f = await fixture();
  try {
    await f.answerLesson(0, wrong);
    assert.equal((await f.call('/answer', { id: 0, question: 0, answer: right(0) }, f.token)).status, 409, 'cannot re-answer to improve evidence');
    const other = (await f.call('/session', {})).data.token;
    assert.equal((await f.call('/mastery', undefined, other)).data.evidence.answered, 0);
    assert.equal((await f.call('/mastery', undefined, f.token)).data.evidence.accuracy, 0);
  } finally { await f.close(); }
});

test('adding optional lessons to the course does not relock a graduate (unit)', () => {
  const course = n => Array.from({ length: n }, (_, i) => ({ title: 'L' + i, questions: Array.from({ length: 10 }, () => []) }));
  const progress = { completed: Array.from({ length: 21 }, (_, i) => i), answers: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i, Array.from({ length: 10 }, (_, q) => right(q))])) };
  assert.equal(requiredComplete(progress, course(21)), true);
  assert.equal(recordGraduation(progress, course(21), 0), true);
  assert.equal(recordGraduation(progress, course(21), 1), false, 'recorded once');
  const bigger = masteryReport(progress, course(30));
  assert.equal(bigger.dailyReviewUnlocked, true);
  assert.equal(bigger.required.lessons, 21);
  assert.equal(requiredComplete({ completed: [], answers: {} }, course(21)), false);
});

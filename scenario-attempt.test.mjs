import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios } from './scenario-bank.mjs';
import { revealIndexedOutcome } from './scenario-index.mjs';
import { normaliseCommitment, simulateFill, scoreAttempt, scoreReasoning } from './scenario-attempt.mjs';

const { scenarios } = await loadScenarios();
const pool = scenarios;

async function fixture({ poolOption = pool } = {}) {
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => Date.parse('2026-10-01T12:00:00Z'), env: {}, scenarioPool: async () => poolOption });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  let n = 0;
  const signUp = async name => {
    const response = await call('/auth/register', { email: `${name}${++n}@example.com`, password: 'correct horse battery', displayName: name });
    return { Cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  return { call, db, signUp, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

const reasoning = { observation: 'Price pulled back in a rising trend and held above the earlier swing low.', invalidation: 'A close below the pullback low would show the idea is wrong.' };
const longPlan = (assignmentId, extra = {}) => ({ assignmentId, decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, statedRR: 2, statedStopPercent: 2, reasoning, ...extra });
const noTrade = (assignmentId, extra = {}) => ({ assignmentId, decision: 'none', reasoning: { ...reasoning, noTradeReason: 'unclear_structure' }, ...extra });

test('validation requires a decision, structured reasoning and sensible levels', () => {
  assert.throws(() => normaliseCommitment({ decision: 'maybe', reasoning }), /Long, Short or No trade/);
  assert.throws(() => normaliseCommitment({ decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1 }), /reasoning/);
  assert.throws(() => normaliseCommitment({ decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, reasoning: { observation: 'x'.repeat(30), invalidation: ' ' } }), /Fill in/);
  assert.throws(() => normaliseCommitment({ decision: 'long', entry: 100, stop: 101, target: 104, riskPercent: 1, reasoning }), /losing side/);
  assert.throws(() => normaliseCommitment({ decision: 'short', entry: 100, stop: 102, target: 103, riskPercent: 1, reasoning }), /winning side/);
  assert.throws(() => normaliseCommitment({ decision: 'long', stop: 98, target: 104, riskPercent: 1, reasoning }), /Entry/);
  assert.throws(() => normaliseCommitment({ decision: 'none', reasoning }), /reason for staying out/);
  assert.equal(normaliseCommitment({ decision: 'none', reasoning: { ...reasoning, noTradeReason: 'volatile_conditions' } }).decision, 'none');
});

test('fills are deterministic: stop before target on the same bar, unfilled and window-end exits', () => {
  const plan = normaliseCommitment({ decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, reasoning });
  const bar = (l, h, c = h) => ({ o: l, h, l, c });
  assert.deepEqual(simulateFill(plan, [bar(100, 105)]).exit, 'target');
  assert.equal(simulateFill(plan, [bar(97, 105)]).exit, 'stop'); // both touched on the fill bar: the stop wins
  assert.equal(simulateFill(plan, [bar(100.5, 101), bar(100.5, 103)]).exit, 'not filled');
  const window = simulateFill(plan, [bar(99, 101, 101), bar(100, 102, 102)]);
  assert.equal(window.exit, 'window end');
  assert.equal(window.r, 1);
  const short = normaliseCommitment({ decision: 'short', entry: 100, stop: 102, target: 96, riskPercent: 1, reasoning });
  assert.deepEqual([simulateFill(short, [bar(95, 100.5)]).exit, simulateFill(short, [bar(95, 100.5)]).r], ['target', 2]);
  assert.deepEqual(simulateFill(plan, [bar(99, 101)]), simulateFill(plan, [bar(99, 101)]));
});

test('scoring separates rules, risk maths and reasoning from profit and loss', () => {
  const good = normaliseCommitment({ decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, statedRR: 2, statedStopPercent: 2, reasoning });
  const win = { filled: true, exit: 'target', r: 2, percent: 4 }, loss = { filled: true, exit: 'stop', r: -1, percent: -2 };
  assert.deepEqual(scoreAttempt(good, win).scores, scoreAttempt(good, loss).scores); // outcome never moves the score
  assert.equal(scoreAttempt(good, loss).scores.ruleAdherence, 100);
  assert.equal(scoreAttempt(good, loss).scores.riskCalculation, 100);
  const sloppy = normaliseCommitment({ decision: 'long', entry: 100, stop: 99, target: 100.5, riskPercent: 5, statedRR: 3, reasoning: { observation: 'it goes up', invalidation: 'no' } });
  const s = scoreAttempt(sloppy, win).scores;
  assert.ok(s.ruleAdherence < 50 && s.riskCalculation === 0 && s.reasoning < 50);
  assert.equal(scoreReasoning(reasoning), 100);
  const checked = scoreAttempt(normaliseCommitment({ decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, reasoning, checklist: [{ item: 'Stop placed', checked: true }, { item: 'Waited for close', checked: false }] }), win);
  assert.deepEqual(checked.checklist, { checked: 1, total: 2 });
  assert.ok(checked.scores.ruleAdherence < 100);
});

test('a well-reasoned no-trade completes the day and earns credit whatever the market did', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    const today = await f.call('/scenario/today', undefined, user);
    const res = await f.call('/scenario/commit', noTrade(today.data.assignmentId), user);
    assert.equal(res.status, 201);
    assert.equal(res.data.result.completed, true);
    assert.equal(res.data.result.learningCredit, true);
    assert.equal(res.data.result.noTradeRecognised, true);
    assert.equal(res.data.result.scores.riskCalculation, null);
    assert.equal(res.data.result.outcome.r, 0);
    const thin = await f.call('/scenario/commit', { assignmentId: 'x', decision: 'none' }, user);
    assert.equal(thin.status, 404);
  } finally { await f.close(); }
});

test('nothing about the future is available before commitment', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    const today = await f.call('/scenario/today', undefined, user);
    const id = today.data.assignmentId;
    const before = await f.call('/scenario/replay?assignmentId=' + id, undefined, user);
    assert.equal(before.status, 404);
    assert.ok(!('replay' in before.data) && !('result' in before.data));
    // An invalid commitment must not reveal or lock anything.
    assert.equal((await f.call('/scenario/commit', { assignmentId: id, decision: 'long' }, user)).status, 400);
    assert.equal((await f.call('/scenario/replay?assignmentId=' + id, undefined, user)).status, 404);
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_attempts').get().c, 0);
    // The pre-commit payload has no outcome data and public assets carry no scenario outcomes.
    for (const key of ['outcomeBars', 'outcomeLabel', 'teachingNotes', 'family']) assert.ok(!JSON.stringify(today.data).includes(key), key);
    const scenario = pool.find(s => today.data.objective === s.objective);
    const futureTimes = new Set(revealIndexedOutcome(scenario).map(b => b.t));
    assert.ok(today.data.chart.bars.every(b => !futureTimes.has(b.t)), 'no future bar timestamps in the chart');
    assert.equal(today.data.chart.bars.length, scenario.visibleBars.length);
    for (const file of readdirSync('public')) if (/\.(js|html|json)$/.test(file)) {
      const source = readFileSync('public/' + file, 'utf8');
      for (const s of pool) assert.ok(!source.includes(s.id), `${file} contains scenario id`);
    }
  } finally { await f.close(); }
});

test('replay after commitment reveals indexed outcome bars on the same scale, reproducibly', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    const today = await f.call('/scenario/today', undefined, user);
    const created = await f.call('/scenario/commit', longPlan(today.data.assignmentId), user);
    assert.equal(created.status, 201);
    const replay = await f.call('/scenario/replay?assignmentId=' + today.data.assignmentId, undefined, user);
    assert.equal(replay.status, 200);
    const visible = today.data.chart.bars;
    const first = replay.data.replay.outcomeBars[0];
    assert.equal(first.label, 'Bar ' + (visible.length + 1));
    assert.ok(first.t > visible.at(-1).t);
    assert.ok(first.o > 50 && first.o < 200, 'outcome stays on the index scale');
    assert.equal(replay.data.result.versions.fill, 'fill-1');
    assert.equal(replay.data.result.versions.rubric, 'rubric-1');
    const again = await f.call('/scenario/replay?assignmentId=' + today.data.assignmentId, undefined, user);
    assert.deepEqual(again.data, replay.data);
    const text = JSON.stringify(replay.data);
    for (const s of pool) assert.ok(!text.includes(s.id), 'internal id leaked');
    assert.ok(!('provenance' in replay.data.replay));
  } finally { await f.close(); }
});

test('commitment is locked: retries return the saved result, edits are refused, concurrency makes one attempt', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    const id = (await f.call('/scenario/today', undefined, user)).data.assignmentId;
    const results = await Promise.all(Array.from({ length: 10 }, () => f.call('/scenario/commit', longPlan(id), user)));
    assert.ok(results.every(r => r.status === 200 || r.status === 201));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(new Set(results.map(r => JSON.stringify(r.data.result))).size, 1);
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_attempts').get().c, 1);
    const edit = await f.call('/scenario/commit', longPlan(id, { target: 110, stop: 90 }), user);
    assert.equal(edit.status, 409);
    assert.equal(edit.data.commitment.target, 104, 'saved commitment is returned, not the edit');
    const flip = await f.call('/scenario/commit', noTrade(id), user);
    assert.equal(flip.status, 409);
    assert.equal(f.db.prepare('SELECT count(*) c FROM scenario_attempts').get().c, 1);
  } finally { await f.close(); }
});

test('only the assigned account can commit or replay; guests are refused', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann'), bob = await f.signUp('Bob');
    const id = (await f.call('/scenario/today', undefined, ann)).data.assignmentId;
    assert.equal((await f.call('/scenario/commit', longPlan(id), bob)).status, 404);
    await f.call('/scenario/commit', longPlan(id), ann);
    assert.equal((await f.call('/scenario/replay?assignmentId=' + id, undefined, bob)).status, 404);
    const guest = await f.call('/session', {});
    const headers = { Authorization: 'Bearer ' + guest.data.token };
    assert.equal((await f.call('/scenario/commit', longPlan(id), headers)).status, 401);
    assert.equal((await f.call('/scenario/replay?assignmentId=' + id, undefined, headers)).status, 401);
  } finally { await f.close(); }
});

test('server enforces the score: client-supplied scores and results are ignored', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    const id = (await f.call('/scenario/today', undefined, user)).data.assignmentId;
    const res = await f.call('/scenario/commit', longPlan(id, { riskPercent: 5, statedRR: 9, scores: { process: 100 }, result: { r: 99 }, outcome: { r: 99 } }), user);
    assert.equal(res.status, 201);
    assert.ok(res.data.result.scores.process < 100);
    assert.ok(res.data.result.scores.riskCalculation < 100);
    assert.notEqual(res.data.result.outcome.r, 99);
    assert.ok(!('scores' in res.data.commitment));
  } finally { await f.close(); }
});

test('attempts are exported and erased with the account', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    const id = (await f.call('/scenario/today', undefined, user)).data.assignmentId;
    await f.call('/scenario/commit', noTrade(id), user);
    const exported = await f.call('/privacy/export', undefined, user);
    assert.equal(exported.data.scenarioAttempts.length, 1);
    assert.equal(exported.data.scenarioAttempts[0].commitment.decision, 'none');
  } finally { await f.close(); }
});

test('the module states its limits: concealment is not cheat prevention', () => {
  assert.match(readFileSync('scenario-attempt.mjs', 'utf8'), /does not guarantee cheat prevention/);
});

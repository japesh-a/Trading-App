import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios, validateScenario } from './scenario-bank.mjs';
import { assessNoTrade, REWARD } from './no-trade.mjs';
import { normaliseCommitment } from './scenario-attempt.mjs';

const { scenarios } = await loadScenarios();
const byId = id => scenarios.find(s => s.id === id);
const DAY = 86400000;

async function fixture(pool) {
  const db = new DatabaseSync(':memory:');
  const time = { now: Date.parse('2026-10-01T12:00:00Z') };
  const service = createTradingService(db, { clock: () => time.now, env: {}, scenarioPool: async () => pool });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  let n = 0;
  const signUp = async () => {
    const response = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `u${++n}@example.com`, password: 'correct horse battery', displayName: 'Ann' }) });
    return { Cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  const streak = async user => (await call('/streak', undefined, user)).data;
  return { call, db, time, signUp, streak, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

const good = { observation: 'Bars are small and overlapping with no level to measure a stop against.', invalidation: 'A clean close outside this range would change my mind.', noTradeReason: 'unclear_structure' };
const plan = (assignmentId, reasoning = good) => ({ assignmentId, decision: 'none', reasoning });
const REFLECTION = 'Staying out felt uncomfortable but the chart gave me nothing to size a stop against.';

test('synthetic no-trade criteria are valid and invalid criteria are rejected', () => {
  assert.ok(byId('nt-quiet').noTradeCriteria);
  assert.deepEqual(validateScenario(byId('nt-quiet')), []);
  assert.ok(validateScenario({ ...byId('nt-quiet'), noTradeCriteria: { reasons: ['lucky_feeling'], evidenceTerms: ['range'] } }).length);
  assert.ok(validateScenario({ ...byId('nt-quiet'), noTradeCriteria: { reasons: ['unclear_structure'], evidenceTerms: [] } }).length);
  assert.equal(byId('tp-steady-resume').noTradeCriteria, undefined);
});

test('the badge needs a fitting reason, visible evidence and specific reasoning, and ignores the outcome', () => {
  const quiet = byId('nt-quiet');
  const c = r => normaliseCommitment({ decision: 'none', reasoning: { ...good, ...r } });
  assert.equal(assessNoTrade(c({}), quiet).earned, true);
  const vague = assessNoTrade(c({ observation: 'I just do not like it.', invalidation: 'not sure' }), quiet);
  assert.equal(vague.earned, false);
  assert.ok(vague.missing.includes('observation cites evidence visible at decision time'));
  assert.equal(assessNoTrade(c({ noTradeReason: 'volatile_conditions' }), quiet).earned, false, 'reason must fit this scenario');
  assert.equal(assessNoTrade(c({ noTradeReason: 'outside_my_rules' }), quiet).earned, false, 'rules reason needs a documented unmet rule');
  const withRule = { ...c({ noTradeReason: 'outside_my_rules' }), playbookCheck: { version: 1, responses: [{ status: 'not_met' }] } };
  assert.equal(assessNoTrade(withRule, quiet).earned, true);
  // a later price move cannot change the verdict: same decision, opposite outcomes
  const crash = { ...quiet, outcomeBars: quiet.outcomeBars.map(b => ({ ...b, o: b.o * 0.5, h: b.h * 0.5, l: b.l * 0.5, c: b.c * 0.5 })) };
  const rally = { ...quiet, outcomeBars: quiet.outcomeBars.map(b => ({ ...b, o: b.o * 2, h: b.h * 2, l: b.l * 2, c: b.c * 2 })) };
  assert.deepEqual(assessNoTrade(c({}), crash), assessNoTrade(c({}), rally));
  assert.equal(assessNoTrade(c({}), byId('tp-steady-resume')).available, false, 'no reviewed criteria, no badge');
});

test('no-trade needs a reflection before the day counts; the reflection then earns the private badge once', async () => {
  const f = await fixture([byId('nt-quiet')]);
  try {
    const user = await f.signUp();
    const today = (await f.call('/scenario/today', undefined, user)).data;
    const committed = await f.call('/scenario/commit', plan(today.assignmentId), user);
    assert.equal(committed.status, 201);
    assert.equal(committed.data.noTrade.reflectionRequired, true);
    assert.equal(committed.data.noTrade.badge, null, 'no badge before the reflection');
    assert.equal((await f.streak(user)).current, 0, 'no streak credit before the reflection');
    assert.equal((await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: 'ok' }, user)).status, 400);
    assert.equal((await f.streak(user)).current, 0);
    const saved = await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, user);
    assert.equal(saved.status, 201);
    assert.equal(saved.data.noTrade.learningCredit, true);
    assert.equal(saved.data.noTrade.badge.earned, true);
    assert.equal(saved.data.noTrade.badge.private, true);
    assert.deepEqual(saved.data.noTrade.reward, REWARD);
    assert.equal(REWARD.cash, 0);
    assert.equal((await f.streak(user)).current, 1);
    // repeating earns nothing extra and cannot rewrite the saved reflection
    const again = await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: 'A completely different answer that is long enough.' }, user);
    assert.equal(again.status, 200);
    assert.equal(again.data.noTrade.reflection, REFLECTION);
    assert.equal(f.db.prepare("SELECT count(*) c FROM activity_events WHERE kind='challenge'").get().c, 1);
    assert.equal(f.db.prepare('SELECT count(*) c FROM no_trade_reflections').get().c, 1);
    const replay = await f.call('/scenario/replay?assignmentId=' + today.assignmentId, undefined, user);
    assert.equal(replay.data.noTrade.badge.earned, true);
  } finally { await f.close(); }
});

test('clicking No trade with thin reasoning completes the day but earns no badge', async () => {
  const f = await fixture([byId('nt-quiet')]);
  try {
    const user = await f.signUp();
    const today = (await f.call('/scenario/today', undefined, user)).data;
    const thin = { observation: 'I do not feel like trading today at all.', invalidation: 'Maybe if I feel better later on.', noTradeReason: 'unclear_structure' };
    assert.equal((await f.call('/scenario/commit', plan(today.assignmentId, thin), user)).status, 201);
    const saved = await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, user);
    assert.equal(saved.data.noTrade.learningCredit, true);
    assert.equal(saved.data.noTrade.badge.earned, false);
    assert.ok(saved.data.noTrade.badge.missing.length);
    assert.equal((await f.streak(user)).current, 1);
  } finally { await f.close(); }
});

test('a scenario without reviewed criteria still completes the day but offers no badge', async () => {
  const f = await fixture([byId('tp-steady-resume')]);
  try {
    const user = await f.signUp();
    const today = (await f.call('/scenario/today', undefined, user)).data;
    await f.call('/scenario/commit', plan(today.assignmentId), user);
    const saved = await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, user);
    assert.equal(saved.data.noTrade.badgeAvailable, false);
    assert.equal(saved.data.noTrade.badge, null);
    assert.equal(saved.data.noTrade.learningCredit, true);
  } finally { await f.close(); }
});

test('reflections need a commitment, apply only to no-trade, and belong to one account', async () => {
  const f = await fixture([byId('nt-quiet')]);
  try {
    const ann = await f.signUp(), bob = await f.signUp();
    assert.equal((await f.call('/scenario/reflection', { assignmentId: 'x', reflection: REFLECTION })).status, 401);
    const today = (await f.call('/scenario/today', undefined, ann)).data;
    assert.equal((await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, ann)).status, 404, 'must commit first');
    await f.call('/scenario/commit', plan(today.assignmentId), ann);
    assert.equal((await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, bob)).status, 404);
  } finally { await f.close(); }
});

test('a trade decision does not need a reflection and keeps its immediate streak credit', async () => {
  const f = await fixture([byId('tp-steady-resume')]);
  try {
    const user = await f.signUp();
    const today = (await f.call('/scenario/today', undefined, user)).data;
    const reasoning = { observation: 'Price pulled back in a rising trend and held above the earlier swing low.', invalidation: 'A close below the pullback low would show the idea is wrong.' };
    const res = await f.call('/scenario/commit', { assignmentId: today.assignmentId, decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, reasoning }, user);
    assert.equal(res.status, 201);
    assert.equal(res.data.noTrade, null);
    assert.equal((await f.streak(user)).current, 1);
    assert.equal((await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, user)).status, 400);
  } finally { await f.close(); }
});

test('a late reflection is saved but does not add streak credit to a past day', async () => {
  const f = await fixture([byId('nt-quiet')]);
  try {
    const user = await f.signUp();
    const today = (await f.call('/scenario/today', undefined, user)).data;
    await f.call('/scenario/commit', plan(today.assignmentId), user);
    f.time.now += 2 * DAY;
    const saved = await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, user);
    assert.equal(saved.status, 201);
    assert.equal(f.db.prepare("SELECT count(*) c FROM activity_events WHERE kind='challenge'").get().c, 0);
  } finally { await f.close(); }
});

test('reflections are included in the data export and erased with the account', async () => {
  const f = await fixture([byId('nt-quiet')]);
  try {
    const user = await f.signUp();
    const today = (await f.call('/scenario/today', undefined, user)).data;
    await f.call('/scenario/commit', plan(today.assignmentId), user);
    await f.call('/scenario/reflection', { assignmentId: today.assignmentId, reflection: REFLECTION }, user);
    const exported = await f.call('/privacy/export', undefined, user);
    assert.equal(exported.data.noTradeReflections[0].reflection, REFLECTION);
    assert.equal(exported.data.noTradeReflections[0].badge, true);
    const gone = await f.call('/privacy/delete', { confirm: 'DELETE' }, user);
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    assert.equal(f.db.prepare('SELECT count(*) c FROM no_trade_reflections').get().c, 0);
  } finally { await f.close(); }
});

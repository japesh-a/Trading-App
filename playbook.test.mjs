import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios } from './scenario-bank.mjs';
import { MAX_RULES, PROMPTS } from './playbook.mjs';

const { scenarios } = await loadScenarios();

async function fixture() {
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => Date.parse('2026-10-01T12:00:00Z'), env: {}, scenarioPool: async () => scenarios });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  let n = 0;
  const signUp = async () => {
    const response = await call('/auth/register', { email: `rules${++n}@example.com`, password: 'correct horse battery', displayName: 'Jo' });
    return { cookie: { Cookie: response.headers.get('set-cookie').split(';')[0] }, id: response.data.account.id };
  };
  const addTrade = user => {
    const sessionId = db.prepare('SELECT session_id FROM accounts WHERE id=?').get(user.id).session_id;
    const id = 'trade-' + Math.random().toString(36).slice(2);
    db.prepare('INSERT INTO trading_paper_trades VALUES(?,?,?)').run(id, sessionId, JSON.stringify({ id, mode: 'paper', status: 'closed', instrument: { id: 'BTC' }, side: 'buy' }));
    return id;
  };
  return { call, db, signUp, addTrade, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

const reasoning = { observation: 'Price pulled back in a rising trend and held above the earlier swing low.', invalidation: 'A close below the pullback low would show the idea is wrong.' };
const longPlan = (assignmentId, extra = {}) => ({ assignmentId, decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, statedRR: 2, statedStopPercent: 2, reasoning, ...extra });
const noTrade = (assignmentId, extra = {}) => ({ assignmentId, decision: 'none', reasoning: { ...reasoning, noTradeReason: 'unclear_structure' }, ...extra });
const answers = (playbook, status = 'met', note = '') => ({ version: playbook.version, responses: playbook.rules.map(r => ({ ruleId: r.id, status, note })) });
const save = async (f, user, texts) => (await f.call('/playbook', { rules: texts.map(text => ({ text })) }, user.cookie)).data.playbook;

test('guests cannot use the playbook and accounts only see their own', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/playbook')).status, 401);
    const a = await f.signUp(), b = await f.signUp();
    await save(f, a, ['Only trade with a stop']);
    assert.equal((await f.call('/playbook', undefined, b.cookie)).data.playbook.rules.length, 0);
    assert.equal((await f.call('/playbook', undefined, a.cookie)).data.playbook.rules.length, 1);
  } finally { await f.close(); }
});

test('rules are validated, prompts are offered, and extra fields cannot carry a risk limit', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const got = await f.call('/playbook', undefined, user.cookie);
    assert.equal(got.data.prompts.length, PROMPTS.length);
    for (const topic of ['setup', 'invalidation', 'risk', 'why']) assert.ok(got.data.prompts.some(p => p.id === topic));
    assert.equal((await f.call('/playbook', { rules: Array.from({ length: MAX_RULES + 1 }, () => ({ text: 'x' })) }, user.cookie)).status, 400);
    assert.equal((await f.call('/playbook', { rules: [{ text: ' ' }] }, user.cookie)).status, 400);
    assert.equal((await f.call('/playbook', { rules: [{ text: 'x'.repeat(121) }] }, user.cookie)).status, 400);
    const saved = (await f.call('/playbook', { rules: [{ text: 'Risk 50% is fine', maxRiskPercent: 50, riskPercent: 50 }] }, user.cookie)).data.playbook;
    assert.deepEqual(Object.keys(saved.rules[0]).sort(), ['id', 'text']);
  } finally { await f.close(); }
});

test('edits create new versions, saving the same rules does not, and ids stay stable', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const v1 = await save(f, user, ['Know my stop', 'Wait for a close']);
    assert.equal(v1.version, 1);
    assert.equal((await f.call('/playbook', { rules: v1.rules }, user.cookie)).data.playbook.version, 1);
    const v2 = (await f.call('/playbook', { rules: [v1.rules[0], { id: v1.rules[1].id, text: 'Wait for a candle close' }] }, user.cookie)).data.playbook;
    assert.equal(v2.version, 2);
    assert.equal(v2.rules[1].id, v1.rules[1].id);
  } finally { await f.close(); }
});

test('a daily decision stores a snapshot of the rule version and answers that later edits do not change', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const v1 = await save(f, user, ['Know my stop', 'Only trade clear structure']);
    const today = await f.call('/scenario/today', undefined, user.cookie);
    const responses = v1.rules.map((r, i) => ({ ruleId: r.id, status: i ? 'not_applicable' : 'met', note: i ? 'No trade today' : 'Stop is 2 below entry' }));
    const res = await f.call('/scenario/commit', longPlan(today.data.assignmentId, { playbook: { version: 1, responses } }), user.cookie);
    assert.equal(res.status, 201);
    assert.equal(res.data.commitment.playbookCheck.version, 1);
    assert.equal(res.data.commitment.playbookCheck.responses[0].text, 'Know my stop');
    assert.equal(res.data.commitment.playbookCheck.selfAssessed, true);
    assert.deepEqual(res.data.result.playbook, { version: 1, met: 1, notMet: 0, notApplicable: 1, total: 2 });
    await f.call('/playbook', { rules: [{ text: 'Completely different rule' }] }, user.cookie);
    const replay = await f.call('/scenario/replay?assignmentId=' + today.data.assignmentId, undefined, user.cookie);
    assert.equal(replay.data.commitment.playbookCheck.version, 1);
    assert.equal(replay.data.commitment.playbookCheck.responses[1].text, 'Only trade clear structure');
    const retry = await f.call('/scenario/commit', longPlan(today.data.assignmentId, { playbook: { version: 1, responses } }), user.cookie);
    assert.equal(retry.status, 200);
  } finally { await f.close(); }
});

test('rule text comes from the server and a client-supplied snapshot is ignored', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await save(f, user, ['Real rule']);
    const today = await f.call('/scenario/today', undefined, user.cookie);
    const res = await f.call('/scenario/commit', noTrade(today.data.assignmentId, { playbookCheck: { version: 9, responses: [{ text: 'Forged' }] } }), user.cookie);
    assert.equal(res.status, 201);
    assert.equal(res.data.commitment.playbookCheck, undefined);
  } finally { await f.close(); }
});

test('every rule needs an answer, not met needs an explanation, and unknown versions are refused', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const pb = await save(f, user, ['Rule A', 'Rule B']);
    const today = await f.call('/scenario/today', undefined, user.cookie);
    const id = today.data.assignmentId;
    const missing = await f.call('/scenario/commit', noTrade(id, { playbook: { version: 1, responses: [{ ruleId: pb.rules[0].id, status: 'met' }] } }), user.cookie);
    assert.equal(missing.status, 400);
    assert.equal((await f.call('/scenario/commit', noTrade(id, { playbook: answers(pb, 'not_met') }), user.cookie)).status, 400);
    assert.equal((await f.call('/scenario/commit', noTrade(id, { playbook: answers(pb, 'perhaps') }), user.cookie)).status, 400);
    assert.equal((await f.call('/scenario/commit', noTrade(id, { playbook: { ...answers(pb), version: 7 } }), user.cookie)).status, 400);
    assert.equal((await f.call('/scenario/commit', noTrade(id, { playbook: answers(pb, 'not_met', 'I felt rushed') }), user.cookie)).status, 201);
  } finally { await f.close(); }
});

test('no-trade decisions use the checklist without entry, stop or target', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const pb = await save(f, user, ['Stay out when structure is unclear']);
    const today = await f.call('/scenario/today', undefined, user.cookie);
    const res = await f.call('/scenario/commit', noTrade(today.data.assignmentId, { playbook: answers(pb, 'met', 'No clear structure') }), user.cookie);
    assert.equal(res.status, 201);
    assert.equal(res.data.commitment.entry, undefined);
    assert.equal(res.data.result.playbook.met, 1);
  } finally { await f.close(); }
});

test('personal rules cannot override platform risk limits or certify a trade', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const pb = await save(f, user, ['Risking 10% is allowed for me']);
    const today = await f.call('/scenario/today', undefined, user.cookie);
    const res = await f.call('/scenario/commit', longPlan(today.data.assignmentId, { riskPercent: 10, playbook: answers(pb) }), user.cookie);
    assert.equal(res.status, 201);
    assert.ok(res.data.result.scores.ruleAdherence < 100, 'platform risk check still fails with every personal rule met');
  } finally { await f.close(); }
});

test('paper practice can record a checklist once per trade, for trades the account owns', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp(), other = await f.signUp();
    const pb = await save(f, user, ['Know my stop']);
    const tradeId = f.addTrade(user);
    assert.equal((await f.call('/playbook/paper-check', { tradeId: 'nope', playbook: answers(pb) }, user.cookie)).status, 404);
    const first = await f.call('/playbook/paper-check', { tradeId, playbook: answers(pb, 'met', 'ok') }, user.cookie);
    assert.equal(first.status, 201);
    await f.call('/playbook', { rules: [{ text: 'Changed' }] }, user.cookie);
    const again = await f.call('/playbook/paper-check', { tradeId, playbook: answers({ version: 1, rules: pb.rules }, 'not_met', 'later') }, user.cookie);
    assert.equal(again.status, 200);
    assert.equal(again.data.check.responses[0].status, 'met', 'saved check is not rewritten');
    assert.equal((await f.call('/playbook/paper-check?tradeId=' + tradeId, undefined, user.cookie)).data.check.responses[0].text, 'Know my stop');
    assert.equal((await f.call('/playbook/paper-check?tradeId=' + tradeId, undefined, other.cookie)).status, 404);
  } finally { await f.close(); }
});

test('the data export lists playbook versions and checks, and deletion erases them', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const pb = await save(f, user, ['Private rule']);
    await f.call('/playbook/paper-check', { tradeId: f.addTrade(user), playbook: answers(pb) }, user.cookie);
    const exported = (await f.call('/privacy/export', undefined, user.cookie)).data;
    assert.equal(exported.playbook.versions.length, 1);
    assert.equal(exported.playbook.paperChecks.length, 1);
    assert.equal((await f.call('/privacy/delete', { confirm: 'DELETE' }, user.cookie)).status, 200);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM playbook_versions').get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM playbook_checks').get().n, 0);
  } finally { await f.close(); }
});

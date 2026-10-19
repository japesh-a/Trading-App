import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios, recordReview, contentHash } from './scenario-bank.mjs';
import { parseStaff, GRANT_MAX_READS } from './admin.mjs';

const { scenarios: samples } = await loadScenarios();
const TOKENS = { alice: 'alice-content-token-0123456789', bob: 'bob-support-token-0123456789ab', cara: 'cara-content-token-0123456789a' };
const ADMIN_ENV = { WICKLUME_ADMIN_TOKENS: `alice:content:${TOKENS.alice},bob:support:${TOKENS.bob},cara:content:${TOKENS.cara}` };
const staff = name => ({ Authorization: 'Admin ' + TOKENS[name] });

const draft = (over = {}) => structuredClone({ ...samples[0], id: 'admin-draft', version: 1, status: 'draft', provenance: { ...samples[0].provenance, author: 'content-bot' }, ...over });

async function fixture({ env = ADMIN_ENV, scenarios = [draft()], questionBank } = {}) {
  const db = new DatabaseSync(':memory:');
  const state = { scenarios, reviews: {}, now: Date.parse('2026-10-01T12:00:00Z') };
  const service = createTradingService(db, { clock: () => state.now, env, scenarioLoader: async () => ({ scenarios: state.scenarios, reviews: state.reviews }), questionBank });
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
  const publish = async (id = 'admin-draft', version = 1) => {
    assert.equal((await call('/admin/scenarios/review', { id, version, decision: 'approved' }, staff('alice'))).status, 200);
    assert.equal((await call('/admin/scenarios/publish', { id, version }, staff('alice'))).status, 201);
  };
  return { call, db, state, signUp, publish, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

const reasoning = { observation: 'Price pulled back in a rising trend and held above the earlier swing low.', invalidation: 'A close below the pullback low would show the idea is wrong.' };
const plan = assignmentId => ({ assignmentId, decision: 'long', entry: 100, stop: 98, target: 104, riskPercent: 1, statedRR: 2, statedStopPercent: 2, reasoning });

test('administration is closed without configured staff tokens and rejects bad or weak credentials', async () => {
  const off = await fixture({ env: {} });
  try { assert.equal((await off.call('/admin/scenarios', undefined, staff('alice'))).status, 403); } finally { await off.close(); }
  assert.deepEqual(parseStaff('x:content:short,ab:root:' + 'z'.repeat(30)), []);
  assert.equal(parseStaff('ab:support:' + 'z'.repeat(30)).length, 1);
  const f = await fixture();
  try {
    assert.equal((await f.call('/admin/scenarios')).status, 401);
    assert.equal((await f.call('/admin/scenarios', undefined, { Authorization: 'Admin ' + 'x'.repeat(30) })).status, 401);
    const learner = await f.signUp('Ann');
    assert.equal((await f.call('/admin/scenarios', undefined, learner)).status, 401, 'a learner session is not staff');
    assert.equal((await f.call('/admin/me', undefined, staff('alice'))).data.role, 'content');
    assert.equal((await f.call('/admin/scenarios', undefined, staff('bob'))).status, 403, 'support role cannot manage content');
    assert.equal((await f.call('/admin/support/journal', { code: 'WS-X', reason: 'checking things' }, staff('alice'))).status, 403, 'content role cannot read journals');
  } finally { await f.close(); }
});

test('review, publish and retire are gated, audited and change what learners can be given', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp('Ann');
    assert.equal((await f.call('/scenario/today', undefined, user)).status, 503, 'unreviewed content is not served');
    const listed = (await f.call('/admin/scenarios', undefined, staff('alice'))).data.scenarios[0];
    assert.equal(listed.status, 'draft');
    assert.ok(!JSON.stringify(listed).includes('outcome'), 'listing carries no outcome data');
    assert.equal((await f.call('/admin/scenarios/publish', { id: 'admin-draft', version: 1 }, staff('alice'))).status, 409, 'cannot publish unreviewed');
    assert.equal((await f.call('/admin/scenarios/review', { id: 'admin-draft', version: 1, decision: 'maybe' }, staff('alice'))).status, 400);
    assert.equal((await f.call('/admin/scenarios/review', { id: 'nope', version: 1, decision: 'approved' }, staff('alice'))).status, 404);
    // Author cannot review their own work.
    f.state.scenarios[0].provenance.author = 'alice';
    assert.equal((await f.call('/admin/scenarios/review', { id: 'admin-draft', version: 1, decision: 'approved' }, staff('alice'))).status, 409);
    f.state.scenarios[0].provenance.author = 'content-bot';
    await f.publish();
    assert.equal((await f.call('/admin/scenarios', undefined, staff('alice'))).data.scenarios[0].status, 'published');
    assert.equal((await f.call('/scenario/today', undefined, user)).status, 200);
    assert.equal((await f.call('/admin/scenarios/publish', { id: 'admin-draft', version: 1 }, staff('alice'))).status, 409, 'already published');
    assert.equal((await f.call('/admin/scenarios/review', { id: 'admin-draft', version: 1, decision: 'rejected' }, staff('cara'))).status, 409, 'published version is fixed');
    assert.equal((await f.call('/admin/scenarios/retire', { id: 'admin-draft', version: 1, reason: 'x' }, staff('alice'))).status, 400);
    assert.equal((await f.call('/admin/scenarios/retire', { id: 'admin-draft', version: 1, reason: 'Teaching note is misleading' }, staff('alice'))).status, 200);
    const other = await f.signUp('Ben');
    assert.equal((await f.call('/scenario/today', undefined, other)).status, 503, 'retired scenarios are not newly assigned');
    const actions = (await f.call('/admin/actions', undefined, staff('bob'))).data.actions;
    assert.deepEqual(actions.map(a => a.action).reverse(), ['scenario.review', 'scenario.publish', 'scenario.retire']);
    assert.ok(actions.every(a => a.staff === 'alice' && a.at === f.state.now));
    // Unauthorised mutation attempts leave no state or audit record.
    assert.equal((await f.call('/admin/scenarios/retire', { id: 'admin-draft', version: 1, reason: 'sneaky retire' }, staff('bob'))).status, 403);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM admin_actions').get().c, 3);
  } finally { await f.close(); }
});

test('a published version cannot silently change a completed result; retiring keeps its replay', async () => {
  const f = await fixture();
  try {
    await f.publish();
    const user = await f.signUp('Ann');
    const today = await f.call('/scenario/today', undefined, user);
    assert.equal((await f.call('/scenario/commit', plan(today.data.assignmentId), user)).status, 201);
    const before = await f.call('/scenario/replay?assignmentId=' + today.data.assignmentId, undefined, user);
    assert.equal(before.status, 200);
    assert.equal((await f.call('/admin/scenarios', undefined, staff('alice'))).data.scenarios[0].attempts, 1);
    // Retirement stops new use but the learner's completed replay is unchanged.
    await f.call('/admin/scenarios/retire', { id: 'admin-draft', version: 1, reason: 'Superseded by version 2' }, staff('alice'));
    const after = await f.call('/scenario/replay?assignmentId=' + today.data.assignmentId, undefined, user);
    assert.equal(after.status, 200);
    assert.deepEqual(after.data.replay, before.data.replay);
    // Editing content under the same version is detected and withdrawn rather than served.
    f.state.scenarios[0].objective = 'A quietly edited objective for the same version';
    const status = (await f.call('/admin/scenarios', undefined, staff('alice'))).data.scenarios[0];
    assert.equal(status.status, 'changed-after-publication');
    assert.equal((await f.call('/scenario/replay?assignmentId=' + today.data.assignmentId, undefined, user)).status, 503);
    // A new version needs its own review and publication.
    f.state.scenarios.push(draft({ version: 2 }));
    assert.equal((await f.call('/admin/scenarios', undefined, staff('alice'))).data.scenarios[1].status, 'draft');
  } finally { await f.close(); }
});

test('content-file approvals are pinned on first use so later edits are caught', async () => {
  const s = draft();
  const f = await fixture({ scenarios: [s] });
  try {
    f.state.reviews = { 'admin-draft@1': recordReview(s, 'outside-reviewer') };
    const user = await f.signUp('Ann');
    assert.equal((await f.call('/scenario/today', undefined, user)).status, 200);
    const pin = f.db.prepare('SELECT * FROM scenario_publications').get();
    assert.equal(pin.content_hash, contentHash(s));
    s.objective = 'Edited after the file review and first use';
    f.state.reviews = { 'admin-draft@1': recordReview(draft(), 'outside-reviewer') };
    assert.equal((await f.call('/admin/scenarios', undefined, staff('alice'))).data.scenarios[0].status, 'changed-after-publication');
  } finally { await f.close(); }
});

test('question versions are recorded only when content changes', async () => {
  const bank = [[['What is X?', 'A', 'B', 'C']], [['What is Y?', 'A', 'B', 'C']]];
  const f = await fixture({ questionBank: bank });
  try {
    let list = (await f.call('/admin/questions', undefined, staff('alice'))).data.questions;
    assert.ok(list.every(q => q.version === 0 && q.changedSinceRecorded));
    assert.equal((await f.call('/admin/questions/record', { note: 'baseline' }, staff('alice'))).data.changed.length, 2);
    assert.equal((await f.call('/admin/questions/record', {}, staff('alice'))).data.changed.length, 0, 'unchanged questions get no new version');
    bank[1][0][1] = 'A better answer';
    const changed = (await f.call('/admin/questions/record', { note: 'clarified' }, staff('cara'))).data.changed;
    assert.deepEqual(changed, [{ key: 'L2Q1', version: 2 }]);
    list = (await f.call('/admin/questions', undefined, staff('alice'))).data.questions;
    assert.deepEqual(list.map(q => q.version), [1, 2]);
    assert.equal((await f.call('/admin/questions/record', {}, staff('bob'))).status, 403);
  } finally { await f.close(); }
});

test('user reports are validated, handled by staff, private to the reporter and erased with the account', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann'), ben = await f.signUp('Ben');
    assert.equal((await f.call('/reports', { kind: 'nonsense', message: 'This is a long enough message' }, ann)).status, 400);
    assert.equal((await f.call('/reports', { kind: 'bug', message: 'short' }, ann)).status, 400);
    const made = await f.call('/reports', { kind: 'scenario_problem', scenarioId: 'admin-draft', message: 'The chart looks wrong to me today.' }, ann);
    assert.equal(made.status, 201);
    assert.equal((await f.call('/reports', undefined, ben)).data.reports.length, 0, 'reports are private to their author');
    const list = (await f.call('/admin/reports?status=open', undefined, staff('bob'))).data.reports;
    assert.equal(list.length, 1);
    assert.ok(!JSON.stringify(list).includes('@example.com'), 'staff see no email');
    assert.equal((await f.call('/admin/reports/handle', { id: made.data.id, status: 'open' }, staff('bob'))).status, 400);
    assert.equal((await f.call('/admin/reports/handle', { id: made.data.id, status: 'resolved', note: 'Fixed in v2' }, staff('bob'))).status, 200);
    assert.equal((await f.call('/admin/reports/handle', { id: made.data.id, status: 'dismissed' }, staff('bob'))).status, 404, 'already handled');
    assert.equal((await f.call('/reports', undefined, ann)).data.reports[0].status, 'resolved');
    assert.equal((await f.call('/privacy/export', undefined, ann)).data.problemReports.length, 1);
    await f.call('/privacy/delete', { confirm: 'DELETE' }, ann);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM user_reports').get().c, 0);
    assert.ok((await f.call('/admin/actions', undefined, staff('alice'))).data.actions.some(a => a.action === 'report.handle'));
  } finally { await f.close(); }
});

test('failure summaries are aggregate only', async () => {
  const f = await fixture();
  try {
    await f.call('/scenario/today');
    await f.call('/scenario/today');
    const out = (await f.call('/admin/failures?days=7', undefined, staff('bob'))).data;
    assert.ok(out.errors.length && out.errors.every(e => e.count >= 1 && Object.keys(e).sort().join() === 'count,event,status'));
    assert.ok(!/account|session|email|ip_hash/i.test(JSON.stringify(out)));
  } finally { await f.close(); }
});

test('support journal access needs the learner’s own grant, is limited, expires and is recorded', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann');
    await f.call('/journal/entries', { kind: 'no_trade', notes: { reflection: 'Private thought' } }, ann);
    const read = (code, who = 'bob', reason = 'Ticket 42: sync problem') => f.call('/admin/support/journal', { code, reason }, staff(who));
    assert.equal((await read('WS-0000000000')).status, 403, 'no grant, no access');
    const grant = (await f.call('/support-access', {}, ann)).data;
    assert.match(grant.code, /^WS-[0-9A-F]{10}$/);
    assert.equal(f.db.prepare('SELECT code_hash FROM support_grants').get().code_hash.includes(grant.code), false, 'code is stored hashed');
    assert.equal((await f.call('/admin/support/journal', { code: grant.code, reason: 'why' }, staff('bob'))).status, 400, 'a reason is required');
    const ok = await read(grant.code.toLowerCase());
    assert.equal(ok.status, 200);
    assert.equal(ok.data.entries[0].notes.reflection, 'Private thought');
    assert.ok(!('snapshot' in ok.data.entries[0]) && !('drawings' in ok.data.entries[0]));
    const view = (await f.call('/support-access', undefined, ann)).data;
    assert.equal(view.accessLog.length, 1);
    assert.equal(view.accessLog[0].staff, 'bob');
    assert.equal(view.accessLog[0].reason, 'Ticket 42: sync problem');
    assert.equal((await f.call('/support-access', undefined, await f.signUp('Ben'))).data.accessLog.length, 0, 'logs are per account');
    for (let i = 1; i < GRANT_MAX_READS; i++) assert.equal((await read(grant.code)).status, 200);
    assert.equal((await read(grant.code)).status, 403, 'reads are capped');
    // Revoke and expiry.
    const second = (await f.call('/support-access', {}, ann)).data;
    assert.equal((await read(grant.code)).status, 403, 'a new grant replaces the old one');
    await f.call('/support-access/revoke', {}, ann);
    assert.equal((await read(second.code)).status, 403, 'revoked');
    const third = (await f.call('/support-access', {}, ann)).data;
    f.state.now += 25 * 3600000;
    assert.equal((await read(third.code)).status, 403, 'expired');
    const actions = (await f.call('/admin/actions', undefined, staff('alice'))).data.actions;
    assert.ok(actions.some(a => a.action === 'support.journal') && actions.some(a => a.action === 'support.denied'));
    assert.equal((await f.call('/support-access')).status, 401);
    await f.call('/privacy/delete', { confirm: 'DELETE' }, ann);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM support_grants').get().c + f.db.prepare('SELECT COUNT(*) c FROM support_access_log').get().c, 0);
  } finally { await f.close(); }
});

test('admin documentation and configuration are in place', () => {
  const env = readFileSync('.env.example', 'utf8'), docs = readFileSync('docs/ADMINISTRATION.md', 'utf8');
  assert.match(env, /WICKLUME_ADMIN_TOKENS/);
  assert.ok(!/WICKLUME_ADMIN_TOKENS=\S/.test(env.replace(/^#.*$/gm, '')), 'no live tokens in the example file');
  for (const topic of ['support grant', 'Retire', 'audit', 'pinned']) assert.match(docs, new RegExp(topic, 'i'));
  assert.match(readFileSync('package.json', 'utf8'), /admin\.test\.mjs/);
});

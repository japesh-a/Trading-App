import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { runMigrations } from './migrations.mjs';
import { exportAccount } from './privacy.mjs';
import { backupDatabase, rehearseRestore, pruneBackups } from './db-backup.mjs';
import { recordEvent, recordOps, setAnalyticsConsent, analyticsSummary, purgeAnalytics, evaluateAlerts, dispatchAlerts, serviceStatus, setMeta, retention } from './analytics.mjs';

const NOW = Date.parse('2026-10-01T12:00:00Z'), HOUR = 3600000, DAY = 86400000;
const TOKENS = { alice: 'alice-content-token-0123456789' };
const ADMIN_ENV = { WICKLUME_ADMIN_TOKENS: `alice:content:${TOKENS.alice}` };
const staff = { Authorization: 'Admin ' + TOKENS.alice };

async function fixture({ env = ADMIN_ENV, fetchImpl } = {}) {
  const db = new DatabaseSync(':memory:');
  const state = { now: NOW };
  const service = createTradingService(db, { clock: () => state.now, env, fetchImpl });
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
  return { call, db, state, signUp, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
const accountId = (db, email) => db.prepare('SELECT id FROM accounts WHERE email LIKE ?').get(email + '%').id;
const events = db => db.prepare('SELECT * FROM analytics_events').all();

test('analytics is off by default, account-only, and counts nothing without consent', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/analytics/consent')).status, 401, 'guests are never measured');
    const ann = await f.signUp('Ann');
    assert.equal((await f.call('/analytics/consent', undefined, ann)).data.enabled, false);
    await f.call('/streak', undefined, ann);
    assert.deepEqual(events(f.db), [], 'a return visit without consent stores nothing');
    assert.equal((await f.call('/analytics/consent', { enabled: 'yes' }, ann)).status, 400);
    assert.equal((await f.call('/analytics/consent', { enabled: true }, ann)).data.enabled, true);
  } finally { await f.close(); }
});

test('consented learners produce day-level events with a pseudonym and no content', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann');
    await f.call('/analytics/consent', { enabled: true }, ann);
    const id = accountId(f.db, 'ann');
    await f.call('/streak', undefined, ann);
    await f.call('/streak', undefined, ann);
    const created = await f.call('/journal/entries', { kind: 'manual', source: 'import', facts: { instrument: 'SPX', side: 'buy', entry: 10, pnl: -3 }, notes: { reflection: 'SECRET-REFLECTION-TEXT about my feelings' } }, ann);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const rows = events(f.db);
    assert.deepEqual(rows.map(r => r.name).sort(), ['journal_reflection', 'return_visit']);
    assert.equal(rows.find(r => r.name === 'return_visit').count, 1, 'one return visit per day however many requests');
    const dump = JSON.stringify([rows, f.db.prepare('SELECT * FROM ops_counters').all()]);
    assert(!dump.includes(id) && !dump.includes('SECRET') && !dump.includes('ann1@') && !dump.includes('127.0.0.1'), 'no identifiers, text or addresses in analytics tables');
    assert(rows.every(r => /^[0-9a-f]{24}$/.test(r.subject)));
    f.state.now += DAY;
    await f.call('/streak', undefined, ann);
    assert.equal(events(f.db).filter(r => r.name === 'return_visit').length, 2, 'next day counts again');
  } finally { await f.close(); }
});

test('course completion and daily review events are counted once and need consent', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  assert.equal(recordEvent(db, 'acc-1', 'course_completed', NOW), false);
  setAnalyticsConsent(db, 'acc-1', true, NOW);
  assert.equal(recordEvent(db, 'acc-1', 'course_completed', NOW), true);
  recordEvent(db, 'acc-1', 'course_completed', NOW + 5 * DAY);
  recordEvent(db, 'acc-1', 'daily_review_completed', NOW);
  assert.equal(recordEvent(db, 'acc-1', 'raw_answer_text', NOW), false, 'only listed event names exist');
  const summary = analyticsSummary(db, NOW, 7);
  assert.equal(summary.usage.courseCompletions, 1);
  assert.equal(summary.usage.dailyReviewLearners, 1);
  assert.equal(summary.consent.accountsOptedIn, 1);
});

test('switching analytics off, and deleting the account, erases its events', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann'), bob = await f.signUp('Bob');
    for (const who of [ann, bob]) { await f.call('/analytics/consent', { enabled: true }, who); await f.call('/streak', undefined, who); }
    assert.equal(events(f.db).length, 2);
    await f.call('/analytics/consent', { enabled: false }, ann);
    assert.equal(events(f.db).length, 1, 'only Ann\'s events are forgotten');
    const exported = (await f.call('/privacy/export', undefined, bob)).data;
    assert.equal(exported.analytics.enabled, true);
    assert.equal((await f.call('/privacy/delete', { confirm: 'DELETE' }, bob)).status, 200);
    assert.equal(events(f.db).length, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM analytics_consent').get().n, 1, 'only the consent record of Ann (off) remains');
  } finally { await f.close(); }
});

test('client sync failures and server errors are counted anonymously; unknown kinds refused', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/analytics/failure', { kind: 'sync_failure' })).status, 202);
    assert.equal((await f.call('/analytics/failure', { kind: 'api_failure_client' })).status, 202);
    assert.equal((await f.call('/analytics/failure', { kind: 'journal_text', detail: 'x' })).status, 400);
    recordOps(f.db, 'api_5xx', NOW, 3);
    const summary = (await f.call('/admin/analytics', undefined, staff)).data;
    assert.equal(summary.reliability.syncFailures, 1);
    assert.equal(summary.reliability.clientApiFailures, 1);
    assert.equal(summary.reliability.serverErrors, 3);
    assert.equal((await f.call('/admin/analytics')).status, 401, 'staff only');
  } finally { await f.close(); }
});

test('AI calls and estimated tokens are counted from the existing coach without storing content', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ usage: { total_tokens: 321 }, output: [{ content: [{ type: 'output_text', text: 'Good thesis.' }] }] }) });
  const f = await fixture({ env: { ...ADMIN_ENV, OPENAI_API_KEY: 'k'.repeat(12), OPENAI_MODEL: 'test-model' }, fetchImpl });
  try {
    const ann = await f.signUp('Ann');
    await f.call('/privacy/choices', { aiProcessing: true }, ann);
    const trade = { mode: 'daily', status: 'closed', instrument: { id: 'BTC' }, side: 'buy', entry: 100, stopLoss: 98, takeProfit: 104, quantity: 1, exitPrice: 104, entryTime: NOW / 1000, exitTime: NOW / 1000 + 60, reasoning: 'Pullback in an uptrend.' };
    const reply = await f.call('/coach', { question: 'How was my plan?', trade }, ann);
    assert.equal(reply.status, 200, JSON.stringify(reply.data));
    const ai = (await f.call('/admin/analytics', undefined, staff)).data.ai;
    assert.equal(ai.calls, 1);
    assert.equal(ai.estimatedTokens, 321);
    assert(!JSON.stringify(f.db.prepare('SELECT * FROM ops_counters').all()).includes('Pullback'));
  } finally { await f.close(); }
});

test('retention removes old events and counters but keeps recent ones', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  setAnalyticsConsent(db, 'acc-1', true, NOW);
  recordEvent(db, 'acc-1', 'return_visit', NOW - (retention.eventDays + 2) * DAY);
  recordEvent(db, 'acc-1', 'return_visit', NOW);
  recordOps(db, 'api_5xx', NOW - (retention.opsDays + 2) * DAY);
  recordOps(db, 'api_5xx', NOW);
  assert.deepEqual(purgeAnalytics(db, NOW), { events: 1, ops: 1 });
  assert.equal(events(db).length, 1);
});

test('alerts fire on health, error spikes, missing or stale backups and rehearsals; clean state is quiet', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const keys = alerts => alerts.map(a => a.key).sort();
  assert.deepEqual(keys(evaluateAlerts(db, NOW)), ['backup-missing', 'rehearsal-missing']);
  setMeta(db, 'last_backup', NOW - HOUR); setMeta(db, 'last_rehearsal', NOW - DAY);
  assert.deepEqual(evaluateAlerts(db, NOW), []);
  recordOps(db, 'api_5xx', NOW, 10);
  recordOps(db, 'sync_failure', NOW, 20);
  recordOps(db, 'ai_tokens', NOW, 250000);
  assert.deepEqual(keys(evaluateAlerts(db, NOW, {}, { database: 'error' })), ['ai-cost', 'database', 'server-errors', 'sync-failures']);
  assert.deepEqual(keys(evaluateAlerts(db, NOW + 40 * HOUR)), ['backup-stale']);
  assert.deepEqual(keys(evaluateAlerts(db, NOW + 40 * DAY)), ['backup-stale', 'rehearsal-stale']);
  assert.equal(evaluateAlerts(db, NOW, { WICKLUME_ALERT_5XX_PER_HOUR: '11' }).some(a => a.key === 'server-errors'), false, 'thresholds are configurable');
  assert(evaluateAlerts(db, NOW + 40 * HOUR).every(a => !/@|token|password/i.test(a.message.replace(/AI tokens/, ''))));
});

test('alert webhook is a flag: nothing is sent unless an HTTPS URL is set, and repeats are throttled', async () => {
  const sent = [], fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const alerts = [{ key: 'database', severity: 'critical', message: 'The database health check is failing.' }];
  assert.deepEqual(await dispatchAlerts(alerts, { env: {}, fetchImpl, now: NOW }), []);
  assert.deepEqual(await dispatchAlerts(alerts, { env: { WICKLUME_ALERT_WEBHOOK: 'http://insecure.example/hook' }, fetchImpl, now: NOW }), []);
  assert.equal(sent.length, 0);
  const env = { WICKLUME_ALERT_WEBHOOK: 'https://hooks.example.test/abc' }, memory = new Map();
  assert.equal((await dispatchAlerts(alerts, { env, fetchImpl, sent: memory, now: NOW })).length, 1);
  assert.equal((await dispatchAlerts(alerts, { env, fetchImpl, sent: memory, now: NOW + HOUR })).length, 0, 'not repeated within six hours');
  assert.equal((await dispatchAlerts(alerts, { env, fetchImpl, sent: memory, now: NOW + 7 * HOUR })).length, 1);
  assert.equal(sent[0].url, env.WICKLUME_ALERT_WEBHOOK);
  assert.deepEqual(await dispatchAlerts(alerts, { env, fetchImpl: async () => { throw Error('down'); }, now: NOW + 99 * HOUR }), [], 'a failing webhook never throws');
});

test('backups are recorded, rehearsals verify a restore, and old backup files are pruned', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wicklume-f24-'));
  try {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.prepare('INSERT INTO accounts(id,email,salt,password_hash,session_id,created) VALUES(?,?,?,?,?,?)').run('a1', 'a@example.com', 's', 'x', 's1', NOW);
    backupDatabase(db, path.join(dir, 'b1.db'), NOW);
    assert.equal(db.prepare("SELECT updated FROM ops_meta WHERE key='last_backup'").get().updated, NOW);
    const result = rehearseRestore(db, { now: NOW + 1, dir: path.join(dir, 'scratch') });
    assert.equal(result.ok, true);
    assert.equal(result.accounts, 1);
    assert.equal(db.prepare("SELECT updated FROM ops_meta WHERE key='last_rehearsal'").get().updated, NOW + 1);
    assert.equal(existsSync(path.join(dir, 'scratch')), false, 'scratch copy is removed');
    mkdirSync(path.join(dir, 'backups'));
    const old = path.join(dir, 'backups', 'wicklume-old.db'), fresh = path.join(dir, 'backups', 'wicklume-new.db'), other = path.join(dir, 'backups', 'notes.txt');
    for (const file of [old, fresh, other]) writeFileSync(file, 'x');
    const ancient = new Date(Date.now() - 40 * DAY);
    utimesSync(old, ancient, ancient); utimesSync(other, ancient, ancient);
    assert.deepEqual(pruneBackups(path.join(dir, 'backups')), ['wicklume-old.db']);
    assert(existsSync(fresh) && existsSync(other));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('service status makes a paused or degraded service visible and strips control characters', async () => {
  assert.deepEqual(serviceStatus({}), { state: 'ok', message: '' });
  assert.equal(serviceStatus({ WICKLUME_SERVICE_STATE: 'paused' }).state, 'paused');
  assert.match(serviceStatus({ WICKLUME_SERVICE_STATE: 'paused' }).message, /paused/);
  assert.equal(serviceStatus({}, { database: 'error' }).state, 'degraded');
  assert.equal(serviceStatus({ WICKLUME_SERVICE_STATE: 'nonsense' }).state, 'ok');
  assert.equal(serviceStatus({ WICKLUME_SERVICE_STATE: 'degraded', WICKLUME_SERVICE_NOTICE: 'Back\u0000 soon' }).message, 'Back  soon');
  const f = await fixture({ env: { ...ADMIN_ENV, WICKLUME_SERVICE_STATE: 'paused' } });
  try {
    const status = await f.call('/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.state, 'paused');
    const ops = (await f.call('/admin/ops', undefined, staff)).data;
    assert.equal(ops.service.state, 'paused');
    assert(ops.alerts.some(a => a.key === 'backup-missing'));
    assert.equal(JSON.stringify(ops).includes(TOKENS.alice), false);
    assert.equal((await f.call('/admin/ops')).status, 401);
  } finally { await f.close(); }
});

test('operations are documented: metrics, opt-in, retention, alerts, rehearsal, outage state and incident owners', () => {
  const doc = readFileSync(new URL('./docs/OPERATIONS.md', import.meta.url), 'utf8');
  for (const word of ['off by default', 'Retention', 'Alerts', 'db:rehearse', 'WICKLUME_SERVICE_STATE', 'Incident owner', 'journal text', 'advertising']) assert(doc.includes(word), word);
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert(pkg.scripts.test.includes('analytics.test.mjs'));
  assert(pkg.scripts['db:rehearse']);
  const env = readFileSync(new URL('./.env.example', import.meta.url), 'utf8');
  for (const name of ['WICKLUME_ALERT_WEBHOOK', 'WICKLUME_AUTO_BACKUP', 'WICKLUME_SERVICE_STATE']) assert(env.includes(name), name);
});

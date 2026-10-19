import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { TERMS_VERSION, reapplyDeletions, runRetention, retention } from './privacy.mjs';
import { backupDatabase, restoreDatabase } from './db-backup.mjs';

async function fixture(env = {}, options = {}) {
  const time = { now: Date.parse('2026-10-01T12:00:00Z') };
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => time.now, env, ...options });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  let n = 0;
  const signUp = async (name = 'Ann') => {
    const email = `${name.toLowerCase()}${++n}@example.com`;
    const response = await call('/auth/register', { email, password: 'correct horse battery', displayName: name });
    assert.equal(response.status, 201);
    const cookie = { Cookie: response.headers.get('set-cookie').split(';')[0] };
    const sessionId = db.prepare('SELECT session_id FROM accounts WHERE id=?').get(response.data.account.id).session_id;
    db.prepare('INSERT INTO trading_learning VALUES(?,?)').run(sessionId, JSON.stringify({ completed: ['lesson-1'] }));
    return { cookie, id: response.data.account.id, sessionId, email };
  };
  return { call, db, time, signUp, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('privacy routes need an account, never a paid plan', async () => {
  const f = await fixture();
  try {
    const guest = await f.call('/session', {});
    const bearer = { Authorization: 'Bearer ' + guest.data.token };
    assert.equal((await f.call('/privacy', undefined, bearer)).status, 401);
    const user = await f.signUp();
    assert.equal((await f.call('/privacy', undefined, user.cookie)).status, 200);
  } finally { await f.close(); }
});

test('terms acceptance is versioned, timestamped, and separate from off-by-default optional choices', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const before = (await f.call('/privacy', undefined, user.cookie)).data;
    assert.equal(before.acceptedTermsVersion, null);
    assert.deepEqual([before.marketing, before.aiProcessing], [false, false]);
    assert.equal((await f.call('/privacy/terms', { version: 'old' }, user.cookie)).status, 400);
    const accepted = (await f.call('/privacy/terms', { version: TERMS_VERSION }, user.cookie)).data;
    assert.equal(accepted.acceptedTermsVersion, TERMS_VERSION);
    assert.equal(accepted.termsAcceptedAt, f.time.now);
    assert.deepEqual([accepted.marketing, accepted.aiProcessing], [false, false], 'accepting terms does not opt in to anything');
    assert.equal((await f.call('/privacy/choices', { marketing: 'yes' }, user.cookie)).status, 400);
    const chosen = (await f.call('/privacy/choices', { marketing: true }, user.cookie)).data;
    assert.deepEqual([chosen.marketing, chosen.aiProcessing], [true, false]);
    assert.equal(chosen.acceptedTermsVersion, TERMS_VERSION);
  } finally { await f.close(); }
});

test('withdrawing the AI choice stops the coach and sends nothing to the provider', async () => {
  let providerCalls = 0;
  const fetchImpl = async () => { providerCalls++; return { ok: true, json: async () => ({ output_text: 'Fine.' }) }; };
  const f = await fixture({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test' }, { fetchImpl });
  try {
    const user = await f.signUp();
    const ask = () => f.call('/coach', { question: 'Review my reasoning.', trade: { mode: 'daily', status: 'closed' } }, user.cookie);
    assert.equal((await ask()).status, 403, 'off by default');
    assert.equal(providerCalls, 0);
    await f.call('/privacy/choices', { aiProcessing: true }, user.cookie);
    await f.call('/privacy/choices', { aiProcessing: false }, user.cookie);
    assert.equal((await ask()).status, 403, 'withdrawn');
    assert.equal(providerCalls, 0);
  } finally { await f.close(); }
});

test('export returns the account data without secrets or other accounts', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann'), bob = await f.signUp('Bob');
    const text = JSON.stringify((await f.call('/privacy/export', undefined, ann.cookie)).data);
    const data = JSON.parse(text);
    assert.equal(data.account.email, ann.email);
    assert.deepEqual(data.learning, [{ completed: ['lesson-1'] }]);
    assert.ok(!text.includes(bob.email));
    assert.ok(!/password_hash|salt|token/i.test(text.replace('Passwords, session tokens', '')));
  } finally { await f.close(); }
});

test('deletion removes the data, revokes every session, clears the cookie, and leaves other accounts alone', async () => {
  const f = await fixture();
  try {
    const ann = await f.signUp('Ann'), bob = await f.signUp('Bob');
    const second = await f.call('/auth/login', { email: ann.email, password: 'correct horse battery' });
    const secondCookie = { Cookie: second.headers.get('set-cookie').split(';')[0] };
    assert.equal((await f.call('/privacy/delete', { confirm: 'no' }, ann.cookie)).status, 400);
    const deleted = await f.call('/privacy/delete', { confirm: 'DELETE' }, ann.cookie);
    assert.equal(deleted.status, 200);
    assert.match(deleted.headers.get('set-cookie'), /Max-Age=0/);
    for (const cookie of [ann.cookie, secondCookie]) assert.equal((await f.call('/progress', undefined, cookie)).status, 401);
    for (const [table, column] of [['accounts', 'id'], ['trading_sessions', 'id'], ['trading_learning', 'session_id'], ['account_privacy', 'account_id']])
      assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} IN (?,?)`).get(ann.id, ann.sessionId).n, 0, table);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM account_logins WHERE account_id=?').get(ann.id).n, 0);
    assert.equal((await f.call('/progress', undefined, bob.cookie)).status, 200);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trading_learning WHERE session_id=?').get(bob.sessionId).n, 1);
    assert.equal((await f.call('/auth/login', { email: ann.email, password: 'correct horse battery' })).status, 401);
  } finally { await f.close(); }
});

test('restoring a backup re-applies deletion requests', async () => {
  const f = await fixture();
  const dir = mkdtempSync(path.join(tmpdir(), 'wicklume-privacy-'));
  try {
    const ann = await f.signUp('Ann');
    const backup = backupDatabase(f.db, path.join(dir, 'before.db'));
    await f.call('/privacy/delete', { confirm: 'DELETE' }, ann.cookie);
    // Simulate a restore of the older backup while keeping the later tombstone.
    const old = new DatabaseSync(backup);
    assert.equal(old.prepare('SELECT count(*) AS n FROM accounts').get().n, 1);
    old.prepare('INSERT INTO deletion_tombstones VALUES(?,?)').run(
      f.db.prepare('SELECT account_hash FROM deletion_tombstones').get().account_hash, f.time.now);
    assert.equal(reapplyDeletions(old), 1);
    assert.equal(old.prepare('SELECT count(*) AS n FROM accounts').get().n, 0);
    assert.equal(old.prepare('SELECT count(*) AS n FROM trading_learning').get().n, 0);
    assert.equal(reapplyDeletions(old), 0, 'idempotent');
    old.close();
    const target = path.join(dir, 'live.db');
    restoreDatabase(backup, target);
    assert.ok(existsSync(target));
  } finally { await f.close(); }
});

test('retention job removes old audit rows, expired logins and stale tombstones only', async () => {
  const f = await fixture();
  try {
    const now = f.time.now, day = 86400000;
    f.db.prepare('INSERT INTO audit_log(at,event) VALUES(?,?)').run(now - (retention.auditLogDays + 1) * day, 'old');
    f.db.prepare('INSERT INTO audit_log(at,event) VALUES(?,?)').run(now - day, 'recent');
    f.db.prepare('INSERT INTO account_logins VALUES(?,?,?)').run('expired', 'x', now - 1);
    f.db.prepare('INSERT INTO account_logins VALUES(?,?,?)').run('live', 'x', now + day);
    f.db.prepare('INSERT INTO deletion_tombstones VALUES(?,?)').run('stale', now - (retention.tombstoneDays + 1) * day);
    f.db.prepare('INSERT INTO deletion_tombstones VALUES(?,?)').run('fresh', now - day);
    assert.deepEqual(runRetention(f.db, now), { logins: 1, audit: 1, tombstones: 1 });
    assert.deepEqual(f.db.prepare('SELECT event FROM audit_log').all().map(row => row.event), ['recent']);
    assert.deepEqual(f.db.prepare('SELECT account_hash FROM deletion_tombstones').all().map(row => row.account_hash), ['fresh']);
    assert.ok(retention.tombstoneDays > retention.backupDays, 'tombstones outlive backups');
  } finally { await f.close(); }
});

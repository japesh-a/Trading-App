import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';

async function fixture() {
  const time = { now: Date.parse('2026-10-01T12:00:00Z') };
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => time.now, env: {} });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, headers = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await response.text();
    let data = raw; try { data = JSON.parse(raw); } catch { /* csv */ }
    return { status: response.status, data, headers: response.headers };
  };
  let n = 0;
  const signUp = async () => {
    const email = `journal${++n}@example.com`;
    const response = await call('/auth/register', { email, password: 'correct horse battery', displayName: 'Jo' });
    return { email, cookie: { Cookie: response.headers.get('set-cookie').split(';')[0] }, id: response.data.account.id };
  };
  const addTrade = (user, extra = {}) => {
    const sessionId = db.prepare('SELECT session_id FROM accounts WHERE id=?').get(user.id).session_id;
    const trade = { id: 'trade-' + Math.random().toString(36).slice(2), mode: 'paper', status: 'closed', instrument: { id: 'BTC' }, side: 'buy', entryTime: 1, entry: 100, stopLoss: 95, takeProfit: 110, quantity: 1, exitTime: 2, exitPrice: 110, exitReason: 'target', pnl: 10, plannedRR: 2, realizedR: 2, reasoning: 'Breakout plan', serverVerified: true, source: 'coinbase', ...extra };
    db.prepare('INSERT INTO trading_paper_trades VALUES(?,?,?)').run(trade.id, sessionId, JSON.stringify(trade));
    return trade;
  };
  return { call, db, time, signUp, addTrade, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('guests cannot use the journal and accounts only see their own entries', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/journal/entries')).status, 401);
    const guest = await f.call('/session', {});
    assert.equal((await f.call('/journal/entries', undefined, { Authorization: 'Bearer ' + guest.data.token })).status, 401);
    const a = await f.signUp(), b = await f.signUp();
    const made = await f.call('/journal/entries', { kind: 'no_trade', notes: { reflection: 'Private thought' } }, a.cookie);
    assert.equal(made.status, 201);
    assert.equal((await f.call('/journal/entries', undefined, b.cookie)).data.entries.length, 0);
    const edit = await f.call('/journal/entries/update', { id: made.data.entry.id, baseRevision: 1, notes: { reflection: 'x' } }, b.cookie);
    assert.equal(edit.status, 404);
    assert.equal((await f.call('/journal/entries/delete', { id: made.data.entry.id }, b.cookie)).status, 404);
    assert.equal((await f.call('/journal/entries', undefined, a.cookie)).data.entries.length, 1);
  } finally { await f.close(); }
});

test('paper entries copy immutable execution facts from the server record and carry structured fields', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const trade = f.addTrade(user);
    const made = (await f.call('/journal/entries', { kind: 'paper', tradeId: trade.id, facts: { pnl: 99999 }, provenance: 'verified', notes: { plan: 'Buy the retest', setup: 'Breakout', tags: ['Trend', 'trend', 'A+'], riskPercent: 1, emotion: 'calm', selfAssessment: 4, outcome: 'Hit target', reflection: 'Stuck to plan' } }, user.cookie)).data.entry;
    assert.equal(made.facts.pnl, 10, 'facts come from the server trade, not the request');
    assert.equal(made.facts.entry, 100);
    assert.equal(made.provenance, 'verified');
    assert.equal(made.notes.setup, 'breakout');
    assert.deepEqual(made.notes.tags, ['trend', 'a+']);
    assert.equal(made.notes.emotion, 'calm');
    assert.equal((await f.call('/journal/entries', { kind: 'paper', tradeId: 'nope' }, user.cookie)).status, 404);
    // facts, kind and provenance cannot be edited later
    for (const bad of [{ facts: { pnl: 1 } }, { provenance: 'verified' }, { kind: 'manual' }]) {
      assert.equal((await f.call('/journal/entries/update', { id: made.id, baseRevision: 1, ...bad }, user.cookie)).status, 400);
    }
    const again = (await f.call('/journal/entries', undefined, user.cookie)).data.entries[0];
    assert.equal(again.facts.pnl, 10);
  } finally { await f.close(); }
});

test('no-trade decisions are supported; optional fields are validated; provenance is distinguishable', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const none = (await f.call('/journal/entries', { kind: 'no_trade', facts: { instrument: 'ETH' }, notes: { plan: 'Choppy, so I waited', emotion: null } }, user.cookie)).data.entry;
    assert.equal(none.facts.decision, 'none');
    assert.equal(none.provenance, 'self_reported');
    assert.equal(none.notes.emotion, null);
    const imported = (await f.call('/journal/entries', { kind: 'manual', source: 'import', facts: { instrument: 'SPX', side: 'buy', entry: 10, pnl: -3 } }, user.cookie)).data.entry;
    assert.equal(imported.provenance, 'imported');
    const synthetic = f.addTrade(user, { demo: true });
    const sample = (await f.call('/journal/entries', { kind: 'paper', tradeId: synthetic.id }, user.cookie)).data.entry;
    assert.equal(sample.provenance, 'synthetic');
    const unverified = f.addTrade(user, { serverVerified: false });
    assert.equal((await f.call('/journal/entries', { kind: 'paper', tradeId: unverified.id }, user.cookie)).data.entry.provenance, 'self_reported');
    for (const notes of [{ emotion: 'furious' }, { selfAssessment: 9 }, { tags: Array(11).fill('a') }, { reflection: 'x'.repeat(4001) }, { riskPercent: 'lots' }])
      assert.equal((await f.call('/journal/entries', { kind: 'no_trade', notes }, user.cookie)).status, 400, JSON.stringify(notes));
    assert.equal((await f.call('/journal/entries', { kind: 'bogus' }, user.cookie)).status, 400);
  } finally { await f.close(); }
});

test('a reflection edited on one device appears on another', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const second = await f.call('/auth/login', { email: user.email, password: 'correct horse battery' });
    const phone = { Cookie: second.headers.get('set-cookie').split(';')[0] };
    const made = (await f.call('/journal/entries', { kind: 'no_trade' }, user.cookie)).data.entry;
    f.time.now += 1000;
    const saved = await f.call('/journal/entries/update', { id: made.id, baseRevision: 1, notes: { reflection: 'Wrote this on the laptop' }, drawings: [{ type: 'line', y: 101 }] }, user.cookie);
    assert.equal(saved.data.entry.revision, 2);
    const seen = (await f.call('/journal/entries', undefined, phone)).data.entries[0];
    assert.equal(seen.notes.reflection, 'Wrote this on the laptop');
    assert.deepEqual(seen.drawings, [{ type: 'line', y: 101 }]);
    const since = (await f.call('/journal/entries?since=' + (f.time.now + 1), undefined, phone)).data.entries;
    assert.equal(since.length, 0, 'sync with since returns only newer entries');
  } finally { await f.close(); }
});

test('a stale edit gets a conflict with the current entry instead of overwriting', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const made = (await f.call('/journal/entries', { kind: 'no_trade', notes: { reflection: 'v1' } }, user.cookie)).data.entry;
    await f.call('/journal/entries/update', { id: made.id, baseRevision: 1, notes: { reflection: 'laptop edit' } }, user.cookie);
    const stale = await f.call('/journal/entries/update', { id: made.id, baseRevision: 1, notes: { reflection: 'phone edit', setup: 'range' } }, user.cookie);
    assert.equal(stale.status, 409);
    assert.equal(stale.data.current.notes.reflection, 'laptop edit');
    assert.equal(stale.data.current.revision, 2);
    assert.deepEqual(stale.data.differing.sort(), ['reflection', 'setup']);
    assert.equal((await f.call('/journal/entries', undefined, user.cookie)).data.entries[0].notes.reflection, 'laptop edit');
    const resolved = await f.call('/journal/entries/update', { id: made.id, baseRevision: 2, notes: { reflection: 'merged edit' } }, user.cookie);
    assert.equal(resolved.status, 200);
    assert.equal(resolved.data.entry.revision, 3);
    assert.equal((await f.call('/journal/entries/update', { id: made.id, notes: {} }, user.cookie)).status, 400, 'baseRevision is required');
  } finally { await f.close(); }
});

test('drawings and snapshots are size-capped, safe SVG, private and not in lists unless asked', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp(), other = await f.signUp();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const made = await f.call('/journal/entries', { kind: 'no_trade', snapshot: svg }, user.cookie);
    assert.equal(made.status, 201);
    for (const snapshot of ['<svg><script>alert(1)</script></svg>', '<svg onload="x()"></svg>', 'not svg', '<svg>' + 'a'.repeat(200001) + '</svg>'])
      assert.equal((await f.call('/journal/entries', { kind: 'no_trade', snapshot }, user.cookie)).status, 400);
    assert.equal((await f.call('/journal/entries', { kind: 'no_trade', drawings: [{ d: 'x'.repeat(60000) }] }, user.cookie)).status, 400);
    assert.equal((await f.call('/journal/entries', undefined, user.cookie)).data.entries[0].snapshot, true);
    assert.equal((await f.call('/journal/entries?snapshots=1', undefined, user.cookie)).data.entries[0].snapshot, svg);
    assert.equal((await f.call('/journal/entries?snapshots=1', undefined, other.cookie)).data.entries.length, 0);
    assert.equal((await f.call('/journal/entries?snapshots=1')).status, 401);
  } finally { await f.close(); }
});

test('exports include structured data and provenance, and CSV keeps formula neutralisation', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    await f.call('/journal/entries', { kind: 'no_trade', facts: { instrument: 'BTC' }, notes: { plan: '=HYPERLINK("https://example.com")', setup: 'range', reflection: 'Waited, then "watched"' }, snapshot: '<svg></svg>' }, user.cookie);
    const csv = await f.call('/journal/export.csv', undefined, user.cookie);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.ok(csv.data.includes(`"'=HYPERLINK(""https://example.com"")"`), 'formula is exported as text');
    assert.ok(csv.data.trim().endsWith('"self_reported"'));
    assert.equal((await f.call('/journal/export.csv')).status, 401);
    const exported = (await f.call('/privacy/export', undefined, user.cookie)).data;
    assert.equal(exported.journalEntries.length, 1);
    assert.equal(exported.journalEntries[0].notes.setup, 'range');
    assert.equal(exported.journalEntries[0].provenance, 'self_reported');
    assert.equal(exported.journalEntries[0].hasSnapshot, true);
    assert.equal(exported.journalEntries[0].snapshot, undefined, 'images are not bulk-exported');
  } finally { await f.close(); }
});

test('deleting an entry removes it, and deleting the account erases the journal', async () => {
  const f = await fixture();
  try {
    const user = await f.signUp();
    const one = (await f.call('/journal/entries', { kind: 'no_trade', snapshot: '<svg></svg>' }, user.cookie)).data.entry;
    await f.call('/journal/entries', { kind: 'no_trade' }, user.cookie);
    assert.equal((await f.call('/journal/entries/delete', { id: one.id }, user.cookie)).status, 200);
    assert.equal((await f.call('/journal/entries/delete', { id: one.id }, user.cookie)).status, 404);
    assert.equal((await f.call('/journal/entries', undefined, user.cookie)).data.entries.length, 1);
    const deleted = await f.call('/privacy/delete', { confirm: 'DELETE' }, user.cookie);
    assert.ok([200, 202].includes(deleted.status));
    assert.equal(f.db.prepare('SELECT count(*) c FROM journal_entries WHERE account_id=?').get(user.id).c, 0);
  } finally { await f.close(); }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';

async function fixture(overrides = {}) {
  let now = Date.parse('2026-09-25T12:00:00Z'), price = 100, coachPayload;
  const day = '2026-09-25', midnight = Date.parse(day + 'T00:00:00Z') / 1000;
  const candles = Array.from({ length: 144 }, (_, i) => ({
    time: midnight - 36 * 3600 + i * 900, open: 100, high: i === 51 ? 112 : 103, low: 98, close: 102, volume: 1,
  }));
  const challenge = { id: day + '-BTC-15m', day, marketDate: '2026-09-24', instrument: 'BTC', interval: 900,
    history: candles.slice(0, 48), future: candles.slice(48), source: 'Verified test provider', demo: false, selection: 'Fixed UTC session' };
  const db = new DatabaseSync(':memory:');
  const env = overrides.env || {};
  const service = createTradingService(db, {
    clock: () => now, env,
    challengeProvider: async () => challenge,
    quoteProvider: async () => ({ price, time: now / 1000, source: 'Quote fixture', demo: false }),
    marketProvider: async () => ({ candles: [{ time: Math.floor(now / 60000) * 60, open: price, high: price + 1, low: price - 1, close: price, volume: 1 }], price, time: now / 1000, source: 'Market fixture', demo: false, interval: 60 }),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      coachPayload = { headers: options.headers, ...JSON.parse(options.body) };
      return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Review the invalidation level before the result.' }] }] }) };
    },
    ...overrides,
  });
  const server = http.createServer(async (req, res) => {
    if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, token, headers = {}) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  return { call, db, challenge, now: () => now, tick: (ms = 61000) => { now += ms; }, setPrice: value => { price = value; }, coachPayload: () => coachPayload,
    close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
const order = { side: 'buy', entry: 102, stopLoss: 97, takeProfit: 110, quantity: 10 };
const decision = { challengeId: '2026-09-25-BTC-15m', order, reasoning: 'I will invalidate below the range low and size the risk first.', displayName: 'Alex' };

test('sessions are authenticated, token hashes persist, and CORS/body limits apply', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/challenge')).status, 401);
    assert.equal((await f.call('/challenge', undefined, 'invented')).status, 401);
    const session = await f.call('/session', {});
    assert.equal(session.status, 201);
    assert.match(session.data.token, /^[A-Za-z0-9_-]{43}$/);
    const saved = f.db.prepare('SELECT * FROM trading_sessions').get();
    assert.notEqual(saved.token_hash, session.data.token);
    assert.equal(saved.token_hash.length, 64);
    const blocked = await f.call('/config', undefined, undefined, { Origin: 'https://attacker.invalid' });
    assert.equal(blocked.status, 403);
    const allowed = await f.call('/config', undefined, undefined, { Origin: 'https://japesh-a.github.io' });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://japesh-a.github.io');
    assert.equal(allowed.data.coach, false);
    assert.equal(allowed.data.paperRanked, true);
    assert.equal(allowed.data.lessonGateVerified, false);
    assert.equal(allowed.data.paperTradingOpen, true);
    assert.equal((await f.call('/session', { value: 'a'.repeat(17000) })).status, 413);
  } finally { await f.close(); }
});

test('daily routes hide future bars, enforce entry/risk/one attempt, and calculate P/L themselves', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const challenge = await f.call('/challenge', undefined, token);
    assert.equal(challenge.status, 200);
    assert.equal(challenge.data.history.length, 48);
    assert.equal(challenge.data.future, undefined);
    assert.equal(challenge.data.submitted, false);
    assert.equal((await f.call('/daily/submit', { ...decision, order: { ...order, entry: 1 } }, token)).status, 400);
    assert.equal((await f.call('/daily/submit', { ...decision, order: { ...order, quantity: 100 } }, token)).status, 400);
    assert.equal((await f.call('/daily/submit', { ...decision, order: { ...order, stopLoss: 105 } }, token)).status, 400);
    const result = await f.call('/daily/submit', { ...decision, pnl: 999999, trade: { pnl: 999999 } }, token);
    assert.equal(result.status, 200);
    assert.equal(result.data.future.length, 96);
    assert.equal(result.data.trade.pnl, 80);
    assert.equal(result.data.trade.realizedR, 1.6);
    assert.equal(result.data.trade.serverVerified, true);
    assert.equal((await f.call('/daily/submit', decision, token)).status, 409);
    const restore = await f.call('/daily/result', undefined, token);
    assert.equal(restore.data.trade.id, result.data.trade.id);
    assert.equal((await f.call('/challenge', undefined, token)).data.submitted, true);
    const board = await f.call('/leaderboard?mode=daily', undefined, token);
    assert.deepEqual(board.data.entries, [{ displayName: 'Alex', pnl: 80, realizedR: 1.6, count: 1 }]);
    const other = (await f.call('/session', {})).data.token;
    assert.equal((await f.call('/daily/result', undefined, other)).status, 404);
    assert.equal((await f.call('/leaderboard?mode=daily', undefined, other)).data.entries.length, 1);
  } finally { await f.close(); }
});

test('concurrent daily submissions produce only one result', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const results = await Promise.all([f.call('/daily/submit', decision, token), f.call('/daily/submit', decision, token)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trading_daily_results').get().n, 1);
  } finally { await f.close(); }
});

test('paper is open immediately, uses provider market entry and exits, and isolates accounts', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const other = (await f.call('/session', {})).data.token;
    const paperOrder = { side: 'buy', entry: 1, stopLoss: 95, takeProfit: 110, quantity: 2 };
    const opened = await f.call('/paper/open', { symbol: 'BTC', order: paperOrder, displayName: 'Alex' }, token);
    assert.equal(opened.status, 200);
    assert.equal((await f.call('/progress', { completed: [1, 2, 3] }, token)).status, 404);
    assert.equal((await f.call('/answer', { id: 0, question: 1, answer: 0 }, token)).status, 409);
    assert.equal((await f.call('/answer', { id: 0, question: 0, answer: 0 }, token)).status, 200);
    assert.equal((await f.call('/progress', undefined, token)).data.answers[0].length, 1);
    assert.equal((await f.call('/progress', undefined, other)).data.completed.length, 0);
    assert.equal((await f.call('/answer', { id: 0, question: 9, answer: 0 }, token)).status, 409);
    assert.equal(opened.data.trade.entry, 100, 'Client entry prices are not trusted');
    assert.equal(opened.data.balance, 10000);
    assert.equal(opened.data.trade.initialRisk, 10);
    assert.equal((await f.call('/paper/open', { symbol: 'BTC', order: paperOrder }, token)).status, 409);
    assert.equal((await f.call('/paper/close', {}, other)).status, 409);
    f.setPrice(106); f.tick(3000);
    const state = await f.call('/paper/state?symbol=BTC', undefined, token);
    assert.equal(state.data.trade.unrealizedPnl, 12);
    const closed = await f.call('/paper/close', { price: 9999, pnl: 999999 }, token);
    assert.equal(closed.status, 200);
    assert.equal(closed.data.trade.pnl, 12);
    assert.equal(closed.data.trade.exitPrice, 106);
    assert.equal(closed.data.balance, 10012);
    assert.equal((await f.call('/paper/close', {}, token)).status, 409);
    const board = await f.call('/leaderboard?mode=paper', undefined, token);
    assert.equal(board.data.entries[0].pnl, 12);
    assert.equal(board.data.entries[0].count, 1);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, other)).data.balance, 10000);
  } finally { await f.close(); }
});

test('chosen-price paper entries wait for a quote crossing and can be cancelled', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const order = { side: 'buy', entry: 105, stopLoss: 95, takeProfit: 115, quantity: 2 };
    const placed = await f.call('/paper/open', { symbol: 'BTC', order, entryType: 'trigger' }, token);
    assert.equal(placed.status, 200);
    assert.equal(placed.data.trade.status, 'pending');
    assert.equal(placed.data.trade.entry, 105);
    f.setPrice(103); f.tick(3000);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, token)).data.trade.status, 'pending');
    f.setPrice(106); f.tick(3000);
    const filled = await f.call('/paper/state?symbol=BTC', undefined, token);
    assert.equal(filled.data.trade.status, 'open');
    assert.equal(filled.data.trade.entry, 105);
    assert.equal(filled.data.trade.unrealizedPnl, 0);
    f.setPrice(108); f.tick(3000);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, token)).data.trade.unrealizedPnl, 6);
    assert.equal((await f.call('/paper/close', {}, token)).data.trade.pnl, 6);
    const again = await f.call('/paper/open', { symbol: 'BTC', order, entryType: 'trigger' }, token);
    assert.equal(again.data.trade.status, 'pending');
    const cancelled = await f.call('/paper/close', {}, token);
    assert.equal(cancelled.data.trade.status, 'cancelled');
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, token)).data.trade, null);
    assert.equal((await f.call('/leaderboard?mode=paper', undefined, token)).data.entries[0].count, 1);
  } finally { await f.close(); }
});

test('daily chosen-price entry is verified and an untouched level records no fill', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const chosen = await f.call('/daily/submit', { ...decision, entryType: 'trigger', order: { ...order, entry: 108, stopLoss: 100, takeProfit: 112, quantity: 2 } }, token);
    assert.equal(chosen.status, 200);
    assert.equal(chosen.data.trade.entryFilled, true);
    assert.equal(chosen.data.trade.entry, 108);
    const other = (await f.call('/session', {})).data.token;
    const unfilled = await f.call('/daily/submit', { ...decision, entryType: 'trigger', order: { ...order, entry: 200, stopLoss: 190, takeProfit: 220, quantity: 2 } }, other);
    assert.equal(unfilled.status, 200);
    assert.equal(unfilled.data.trade.entryFilled, false);
    assert.equal(unfilled.data.trade.pnl, 0);
    assert.equal(unfilled.data.trade.exitReason, 'entry-not-reached');
  } finally { await f.close(); }
});

test('stale providers cannot open orders and provider errors do not expose keys', async () => {
  const f = await fixture({
    env: { TWELVE_DATA_API_KEY: 'private-data-key' },
    quoteProvider: async () => { throw Error('Failed request with apikey=private-data-key'); },
  });
  try {
    const token = (await f.call('/session', {})).data.token;
    const result = await f.call('/quote?symbol=XAUUSD', undefined, token);
    assert.equal(result.status, 503);
    assert(!JSON.stringify(result.data).includes('private-data-key'));
    const config = await f.call('/config');
    assert(!JSON.stringify(config.data).includes('private-data-key'));
    assert.equal((await f.call('/market?symbol=UNSUPPORTED', undefined, token)).status, 400);
  } finally { await f.close(); }
  const stale = await fixture({ quoteProvider: async () => ({ price: 100, time: 1000, source: 'Stale' }) });
  try {
    const token = (await stale.call('/session', {})).data.token;
    assert.equal((await stale.call('/quote?symbol=BTC', undefined, token)).status, 503);
  } finally { await stale.close(); }
});

test('coach is optional, uses owned server trades, and keeps credentials on the server', async () => {
  const disconnected = await fixture();
  try {
    const token = (await disconnected.call('/session', {})).data.token;
    assert.equal((await disconnected.call('/coach', { question: 'Review my reasoning.' }, token)).status, 503);
  } finally { await disconnected.close(); }
  const f = await fixture({ env: { OPENAI_API_KEY: 'private-openai-key', OPENAI_MODEL: 'configured-model' } });
  try {
    const token = (await f.call('/session', {})).data.token;
    const other = (await f.call('/session', {})).data.token;
    const result = await f.call('/daily/submit', decision, token);
    assert.equal((await f.call('/coach', { tradeId: result.data.trade.id, question: 'Review my reasoning.' }, other)).status, 404);
    const review = await f.call('/coach', { tradeId: result.data.trade.id, question: 'Review my reasoning.' }, token);
    assert.equal(review.status, 200);
    assert(review.data.text.includes('invalidation'));
    assert.equal(review.data.serverVerified, true);
    assert(!JSON.stringify(review.data).includes('private-openai-key'));
    assert(!JSON.stringify((await f.call('/config')).data).includes('private-openai-key'));
    const payload = f.coachPayload();
    assert.equal(payload.model, 'configured-model');
    assert.equal(payload.store, false);
    assert.deepEqual(payload.tools, []);
    assert.equal(payload.headers.Authorization, 'Bearer private-openai-key');
    assert.equal(JSON.parse(payload.input).trade.pnl, 80);
    assert.equal((await f.call('/coach', { tradeId: result.data.trade.id, question: 'a'.repeat(601) }, token)).status, 400);
  } finally { await f.close(); }
});

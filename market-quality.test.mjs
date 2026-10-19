import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { aggregateCandles } from './public/timeframes.js';
import { dataLabel, canVerifyFill, isMarketOpen, findMissingBars, historyQuality, createProviderHealth, costSettings, simulationAssumptions } from './market-quality.mjs';

test('labels distinguish connected, delayed, stale and synthetic data', () => {
  const now = 1_800_000_000;
  assert.equal(dataLabel({ quoteTime: now - 5, nowSeconds: now }).kind, 'connected');
  assert.equal(dataLabel({ quoteTime: now - 600, nowSeconds: now, delaySeconds: 900 }).kind, 'delayed');
  assert.equal(dataLabel({ quoteTime: now - 600, nowSeconds: now }).kind, 'stale');
  assert.equal(dataLabel({ quoteTime: undefined, nowSeconds: now }).kind, 'stale');
  assert.equal(dataLabel({ demo: true, quoteTime: now, nowSeconds: now }).kind, 'synthetic');
});

test('only a connected fresh feed can verify fills', () => {
  const now = 1_800_000_000;
  assert(canVerifyFill(dataLabel({ quoteTime: now, nowSeconds: now })));
  for (const input of [{ demo: true, quoteTime: now }, { quoteTime: now - 999 }, { quoteTime: now, delaySeconds: 900 }]) {
    assert(!canVerifyFill(dataLabel({ nowSeconds: now, ...input })));
  }
});

test('calendar closes non-crypto markets at the weekend but not BTC', () => {
  const saturday = Date.parse('2026-09-26T12:00:00Z'), monday = Date.parse('2026-09-28T12:00:00Z');
  assert(!isMarketOpen('US500', saturday));
  assert(isMarketOpen('US500', monday));
  assert(isMarketOpen('BTC', saturday));
});

test('missing bars are found, but weekend closures are not reported as gaps', () => {
  const bar = time => ({ time, open: 1, high: 2, low: 1, close: 1, volume: 0 });
  const gappy = [bar(0), bar(60), bar(240)];
  assert.deepEqual(findMissingBars(gappy, 60, 'BTC'), [120, 180]);
  assert.equal(historyQuality(gappy, 60, 'BTC').complete, false);
  const friday = Date.parse('2026-09-25T22:00:00Z') / 1000, sunday = Date.parse('2026-09-27T22:00:00Z') / 1000;
  assert.equal(historyQuality([bar(friday - 3600), bar(friday), bar(sunday)], 3600, 'US500').missingBars, 0);
  assert(historyQuality([bar(friday), bar(sunday)], 3600, 'BTC').missingBars > 0);
});

test('provider health tracks failures and recovery', () => {
  const health = createProviderHealth(() => 5);
  assert.deepEqual(health.report(), []);
  health.success('Coinbase');
  health.failure('Twelve Data');
  assert.equal(health.report().find(p => p.name === 'Twelve Data').status, 'degraded');
  health.failure('Twelve Data'); health.failure('Twelve Data');
  assert.equal(health.report().find(p => p.name === 'Twelve Data').status, 'down');
  health.success('Twelve Data');
  assert.equal(health.report().find(p => p.name === 'Twelve Data').status, 'ok');
});

test('costs default to zero, reject bad values, and assumptions are explained', () => {
  assert.deepEqual(costSettings({}), { spread: 0, feePercent: 0, slippage: 0 });
  assert.deepEqual(costSettings({ WICKLUME_SIM_SPREAD: '-1', WICKLUME_SIM_FEE_PERCENT: 'x' }), { spread: 0, feePercent: 0, slippage: 0 });
  const text = simulationAssumptions({}).notes.join(' ');
  assert.match(text, /No spread, fees or slippage/);
  assert.match(text, /synthetic prices are never used in a connected session/);
});

test('aggregated charts use only the candles they are given (revealed ones)', () => {
  const minutes = Array.from({ length: 7 }, (_, i) => ({ time: i * 60, open: 10 + i, high: 20 + i, low: 5, close: 11 + i, volume: 1 }));
  const five = aggregateCandles(minutes.slice(0, 4), 300);
  assert.equal(five.length, 1);
  assert.equal(five[0].high, 23, 'Hidden later bars never leak into the aggregate');
  assert.equal(five[0].close, 14);
});

async function service(overrides) {
  const now = Date.parse('2026-09-25T12:00:00Z');
  const db = new DatabaseSync(':memory:');
  const svc = createTradingService(db, { clock: () => now, env: { WICKLUME_ANONYMOUS_VERIFIED: 'true' }, ...overrides });
  const server = http.createServer(async (req, res) => { if (!await svc(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const token = (await (await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).token;
  const get = async route => { const r = await fetch(base + route, { headers: { Authorization: 'Bearer ' + token } }); return { status: r.status, data: await r.json() }; };
  return { get, now, close: async () => { await new Promise(r => server.close(r)); db.close(); } };
}

test('market endpoint labels a connected feed', async () => {
  const seconds = Date.parse('2026-09-25T12:00:00Z') / 1000;
  const f = await service({
    marketProvider: async () => ({ candles: [{ time: seconds - 60, open: 1, high: 2, low: 1, close: 1, volume: 1 }], price: 1, time: seconds, source: 'Fixture', demo: false }),
  });
  try {
    const ok = await f.get('/market?symbol=BTC');
    assert.equal(ok.status, 200);
    assert.equal(ok.data.dataStatus.kind, 'connected');
    assert.equal(typeof ok.data.quality.missingBars, 'number');
    const health = await f.get('/market/health');
    assert.match(health.data.assumptions.notes.join(' '), /connected session/);
    assert(!JSON.stringify(health.data).includes('apikey'));
  } finally { await f.close(); }
});

test('stale data is refused rather than served or substituted', async () => {
  const f = await service({
    quoteProvider: async () => ({ price: 1, time: 1000, source: 'Old' }),
    marketProvider: async () => ({ candles: [{ time: 960, open: 1, high: 2, low: 1, close: 1, volume: 1 }], price: 1, time: 1000, source: 'Old', demo: false }),
  });
  try {
    const refused = await f.get('/market?symbol=BTC');
    assert.equal(refused.status, 503);
    assert.equal(refused.data.candles, undefined);
    assert.equal((await f.get('/quote?symbol=BTC')).status, 503);
  } finally { await f.close(); }
});

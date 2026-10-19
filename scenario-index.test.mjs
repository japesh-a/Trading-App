import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';
import { loadScenarios } from './scenario-bank.mjs';
import { indexedChartView, indexBars, aggregateIndexed, indexabilityProblems, availableTimeframes, percentMove, rMultiple, revealIndexedOutcome, CONCEALED_EPOCH, GENERIC_ATTRIBUTION } from './scenario-index.mjs';

const { scenarios } = await loadScenarios();

async function fixture() {
  const db = new DatabaseSync(':memory:');
  const service = createTradingService(db, { clock: () => Date.parse('2026-10-01T12:00:00Z'), env: {}, scenarioPool: async () => scenarios });
  const server = http.createServer(async (req, res) => { if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const response = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ann@example.com', password: 'correct horse battery', displayName: 'Ann' }) });
  const cookie = { Cookie: response.headers.get('set-cookie').split(';')[0] };
  const get = async q => { const r = await fetch(base + '/scenario/today' + (q || ''), { headers: cookie }); return { status: r.status, text: await r.text() }; };
  return { get, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

test('every price is rebased with one positive factor and relationships are preserved', () => {
  for (const s of scenarios) {
    const view = indexedChartView(s);
    const ref = s.visibleBars[0].o, f = 100 / ref;
    assert.equal(view.bars.length, s.visibleBars.length);
    assert.equal(view.bars[0].o, 100);
    view.bars.forEach((b, i) => {
      const o = s.visibleBars[i];
      for (const k of ['o', 'h', 'l', 'c']) assert.ok(Math.abs(b[k] - o[k] * f) < 0.00006, 'rebased ' + k);
      assert.ok(b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c), 'OHLC kept');
      if (i) assert.ok(b.t > view.bars[i - 1].t, 'chronological');
      // Percentage returns match the source to rounding.
      if (i) assert.ok(Math.abs(percentMove(view.bars[i - 1].c, b.c) - percentMove(s.visibleBars[i - 1].c, o.c)) < 0.01);
    });
  }
});

test('different starting price levels produce the same indexed scale and one fictional timeline', () => {
  const a = indexBars([{ o: 50, h: 55, l: 49, c: 52 }], 50, 900), b = indexBars([{ o: 80000, h: 88000, l: 78400, c: 83200 }], 80000, 900);
  assert.deepEqual(a, b);
  assert.equal(a[0].t, CONCEALED_EPOCH);
  const views = scenarios.map(s => indexedChartView(s));
  assert.ok(views.every(v => v.bars[0].t === CONCEALED_EPOCH && v.bars[0].o === 100));
  assert.ok(views.every(v => v.attribution === GENERIC_ATTRIBUTION));
});

test('the real timestamps and price levels are not present in the indexed view', () => {
  for (const s of scenarios) {
    const text = JSON.stringify(indexedChartView(s));
    for (const b of s.visibleBars.slice(0, 5)) assert.ok(!text.includes(String(b.t)), 'original timestamp leaked');
    assert.ok(!text.includes(s.id));
    assert.ok(!/volume|lot|provenance|family/i.test(text));
  }
});

test('every timeframe uses only visible candles on the same timeline and scale', () => {
  const s = scenarios[0];
  const frames = availableTimeframes(s);
  assert.ok(frames.includes('15m') && frames.includes('1h') && !frames.includes('5m'));
  const base = indexedChartView(s);
  const hourly = indexedChartView(s, '1h');
  assert.ok(hourly.bars.length < base.bars.length);
  assert.equal(hourly.bars[0].o, base.bars[0].o);
  assert.equal(hourly.bars.at(-1).c, base.bars.at(-1).c, 'last aggregated close is the last visible close');
  assert.equal(Math.max(...hourly.bars.map(b => b.h)), Math.max(...base.bars.map(b => b.h)));
  assert.equal(Math.min(...hourly.bars.map(b => b.l)), Math.min(...base.bars.map(b => b.l)));
  assert.ok(hourly.bars.every(b => b.t % 3600 === 0));
  assert.throws(() => indexedChartView(s, '5m'), RangeError);
  assert.equal(aggregateIndexed([], 3600).length, 0);
});

test('percentage and R units stay consistent after indexing', () => {
  const s = scenarios[0], raw = s.visibleBars, idx = indexedChartView(s).bars;
  const last = raw.at(-1).c, lastIdx = idx.at(-1).c;
  const rawR = rMultiple({ side: 'long', entry: last, stop: last * 0.98, exit: last * 1.04 });
  const idxR = rMultiple({ side: 'long', entry: lastIdx, stop: lastIdx * 0.98, exit: lastIdx * 1.04 });
  assert.equal(rawR, 2); assert.equal(idxR, 2);
  assert.equal(rMultiple({ side: 'short', entry: 100, stop: 102, exit: 96 }), 2);
  assert.equal(percentMove(100, 103), 3);
  assert.throws(() => rMultiple({ side: 'long', entry: 100, stop: 101, exit: 105 }), RangeError);
});

test('identifying objectives and unlicensed historical data are refused', () => {
  const s = scenarios[0];
  assert.deepEqual(indexabilityProblems(s), []);
  assert.ok(indexabilityProblems({ ...s, objective: 'Trade the BTC pullback' }).length);
  assert.ok(indexabilityProblems({ ...s, objective: 'The March 2020 crash' }).length);
  const hist = { ...s, provenance: { ...s.provenance, source: 'historical' } };
  assert.match(indexabilityProblems(hist).join(), /generic attribution/);
  assert.deepEqual(indexabilityProblems({ ...hist, dataRights: { ...s.dataRights, genericAttribution: true } }), []);
  assert.throws(() => indexedChartView({ ...s, objective: 'Bitcoin 2021' }), /cannot be shown/);
});

test('the API serves the indexed chart with no future bars or identifying data, for any timeframe', async () => {
  const f = await fixture();
  try {
    for (const q of ['', '?timeframe=15m', '?timeframe=1h', '?timeframe=4h']) {
      const r = await f.get(q);
      assert.equal(r.status, 200);
      const data = JSON.parse(r.text);
      assert.equal(data.chart.bars[0].o, 100);
      assert.ok(!('bars' in data) && !('decisionBoundary' in data) && !('timeframe' in data));
      for (const s of scenarios) {
        assert.ok(!r.text.includes(s.id));
        for (const b of [...s.visibleBars.slice(0, 3), ...s.outcomeBars.slice(0, 3)]) assert.ok(!r.text.includes(String(b.t)));
        const future = s.outcomeBars[0];
        assert.ok(!r.text.includes('"c":' + future.c + ','), 'raw future price');
      }
    }
    assert.equal((await f.get('?timeframe=5m')).status, 400);
  } finally { await f.close(); }
});

test('post-commit outcome uses the same index and continues the same timeline', () => {
  const s = scenarios[0], view = indexedChartView(s), out = revealIndexedOutcome(s);
  assert.equal(out.length, s.outcomeBars.length);
  assert.ok(out[0].t > view.bars.at(-1).t);
  const f = 100 / s.visibleBars[0].o;
  assert.ok(Math.abs(out[0].c - s.outcomeBars[0].c * f) < 0.00006);
});

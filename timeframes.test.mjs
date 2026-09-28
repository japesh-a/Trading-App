import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateCandles, withQuote, TIMEFRAMES, refreshCachedCharts } from './public/timeframes.js';

const bar = (time, open, high, low, close, volume = 1) => ({ time, open, high, low, close, volume });

test('UTC aggregation keeps the first open, extremes, final close and volume', () => {
  const values = [bar(0, 100, 103, 99, 102, 2), bar(900, 102, 104, 101, 103, 3),
    bar(1800, 103, 105, 98, 99, 4), bar(2700, 99, 100, 97, 98, 5), bar(3600, 98, 101, 96, 100, 6)];
  assert.deepEqual(aggregateCandles(values, TIMEFRAMES['1h']), [bar(0, 100, 105, 97, 98, 14), bar(3600, 98, 101, 96, 100, 6)]);
  assert.deepEqual(aggregateCandles(values.slice(0, 2), TIMEFRAMES['1h']), [bar(0, 100, 104, 99, 103, 5)], 'Only revealed bars contribute to a partial candle');
  assert.deepEqual(aggregateCandles(values, TIMEFRAMES['4h']), [bar(0, 100, 105, 96, 100, 20)]);
});

test('all six UTC timeframes retain exact OHLC and only include revealed input', () => {
  const start = Date.parse('2026-09-26T23:45:00Z') / 1000;
  const candles = Array.from({length: 1800}, (_, i) => bar(start+i*60, 100+i, 103+i, 98+i, 101+i, 2));
  for (const interval of Object.values(TIMEFRAMES)) {
    for (const length of [1, 15, 16, 60, 240, 1440, 1800]) {
      const source=candles.slice(0,length), result=aggregateCandles(source,interval);
      assert(result.every((c,i)=>c.time%interval===0 && (!i||c.time>result[i-1].time)));
      for (const candle of result) {
        const input=source.filter(c=>Math.floor(c.time/interval)*interval===candle.time);
        assert.deepEqual(candle, bar(candle.time,input[0].open,Math.max(...input.map(c=>c.high)),Math.min(...input.map(c=>c.low)),input.at(-1).close,input.length*2));
      }
      assert.equal(result.at(-1).close,source.at(-1).close,'The final close never uses the next unrevealed candle');
    }
  }
});

test('inactive timeframe caches retain quote extremes and history expiry through switches', () => {
  const cache=new Map(Object.keys(TIMEFRAMES).map(tf=>[tf,{time:123,candles:[bar(0,100,102,98,100)]}]));
  refreshCachedCharts(cache,{time:30,price:110});
  refreshCachedCharts(cache,{time:35,price:95});
  refreshCachedCharts(cache,{time:40,price:105});
  for (const cached of cache.values()) {
    assert.equal(cached.time,123,'Sampling does not make old provider history appear fresh');
    assert.deepEqual(cached.candles,[bar(0,100,110,95,105)]);
  }
  refreshCachedCharts(cache,{time:86401,price:106});
  for(const [tf,cached] of cache)assert.equal(cached.candles.at(-1).time,86400);
});

test('quote updates only the current displayed bucket and preserves history', () => {
  const source = [bar(0, 100, 102, 99, 101)];
  const same = withQuote(source, { time: 120, price: 103 }, TIMEFRAMES['5m']);
  assert.equal(same[0].high, 103);
  assert.equal(source[0].high, 102);
  const next = withQuote(same, { time: 301, price: 104 }, TIMEFRAMES['5m']);
  assert.deepEqual(next[1], bar(300, 103, 104, 103, 104, 0));
  assert.deepEqual(withQuote(next, { time: 200, price: 99 }, TIMEFRAMES['5m']), next);
});

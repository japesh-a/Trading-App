import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateCandles, withQuote, TIMEFRAMES } from './public/timeframes.js';

const bar = (time, open, high, low, close, volume = 1) => ({ time, open, high, low, close, volume });

test('UTC aggregation keeps the first open, extremes, final close and volume', () => {
  const values = [bar(0, 100, 103, 99, 102, 2), bar(900, 102, 104, 101, 103, 3),
    bar(1800, 103, 105, 98, 99, 4), bar(2700, 99, 100, 97, 98, 5), bar(3600, 98, 101, 96, 100, 6)];
  assert.deepEqual(aggregateCandles(values, TIMEFRAMES['1h']), [bar(0, 100, 105, 97, 98, 14), bar(3600, 98, 101, 96, 100, 6)]);
  assert.deepEqual(aggregateCandles(values.slice(0, 2), TIMEFRAMES['1h']), [bar(0, 100, 104, 99, 103, 5)], 'Only revealed bars contribute to a partial candle');
  assert.deepEqual(aggregateCandles(values, TIMEFRAMES['4h']), [bar(0, 100, 105, 96, 100, 20)]);
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

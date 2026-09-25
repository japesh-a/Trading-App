export const TIMEFRAMES = Object.freeze({
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
});
export const DAILY_TIMEFRAMES = Object.freeze(['15m', '1h', '4h', '1d']);
export const PAPER_TIMEFRAMES = Object.freeze(Object.keys(TIMEFRAMES));

/** Build UTC OHLC buckets from already-revealed candles. Inputs must be time ordered. */
export function aggregateCandles(candles, interval) {
  if (!Number.isInteger(interval) || interval <= 0) throw new RangeError('Choose a valid candle interval.');
  const result = [];
  for (const candle of candles) {
    if (!candle || !Number.isFinite(candle.time)) continue;
    const time = Math.floor(candle.time / interval) * interval;
    const last = result.at(-1);
    if (last && last.time === time) {
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
      last.volume += Number(candle.volume) || 0;
    } else if (!last || time > last.time) {
      result.push({ time, open: candle.open, high: candle.high, low: candle.low,
        close: candle.close, volume: Number(candle.volume) || 0 });
    }
  }
  return result;
}

/** Add a sampled quote to the displayed candle without changing execution data. */
export function withQuote(candles, quote, interval) {
  if (!Number.isFinite(quote?.price) || !Number.isFinite(quote?.time) || quote.price <= 0) return candles;
  const time = Math.floor(quote.time / interval) * interval;
  const result = candles.slice();
  const last = result.at(-1);
  if (last && last.time > time) return result;
  if (last && last.time === time) result[result.length - 1] = {
    ...last, high: Math.max(last.high, quote.price), low: Math.min(last.low, quote.price), close: quote.price,
  };
  else result.push({ time, open: last?.close ?? quote.price, high: Math.max(last?.close ?? quote.price, quote.price),
    low: Math.min(last?.close ?? quote.price, quote.price), close: quote.price, volume: 0 });
  return result;
}

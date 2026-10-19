// Data-quality helpers for market feeds: labels, staleness, gaps, trading calendar, provider health.
// Pure functions plus a small health tracker; nothing here fetches data or substitutes prices.

export const STALE_QUOTE_SECONDS = 120;

/** Label shown with every chart/quote. Synthetic is never reported as connected. */
export function dataLabel({ demo = false, synthetic = false, quoteTime, nowSeconds, delaySeconds = 0 } = {}) {
  if (demo || synthetic) return { kind: 'synthetic', text: 'Synthetic practice data', verified: false };
  if (!Number.isFinite(quoteTime) || !Number.isFinite(nowSeconds) || nowSeconds - quoteTime > STALE_QUOTE_SECONDS + delaySeconds) {
    return { kind: 'stale', text: 'Stale or unavailable quote', verified: false };
  }
  if (delaySeconds > 0) return { kind: 'delayed', text: `Delayed about ${Math.round(delaySeconds / 60)} min`, verified: false };
  return { kind: 'connected', text: 'Connected market feed', verified: true };
}

/** Only a connected, fresh feed may produce verified fills. */
export const canVerifyFill = label => label?.kind === 'connected' && label.verified === true;

const WEEKEND_CLOSED = new Set(['US500', 'XAUUSD', 'GBPUSD']);
/** Simplified calendar: BTC trades 24/7; other instruments close from Friday 22:00 to Sunday 22:00 UTC. */
export function isMarketOpen(symbol, ms) {
  if (!WEEKEND_CLOSED.has(symbol)) return true;
  const date = new Date(ms), day = date.getUTCDay(), hour = date.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && hour >= 22) return false;
  if (day === 0 && hour < 22) return false;
  return true;
}

/** Find missing bars between consecutive candles, ignoring closed-market periods. */
export function findMissingBars(candles, interval, symbol = 'BTC') {
  const gaps = [];
  for (let i = 1; i < candles.length; i++) {
    for (let time = candles[i - 1].time + interval; time < candles[i].time; time += interval) {
      if (isMarketOpen(symbol, time * 1000)) gaps.push(time);
    }
  }
  return gaps;
}

/** Summarise a candle history so callers can warn instead of silently interpolating. */
export function historyQuality(candles, interval, symbol) {
  const missing = findMissingBars(candles, interval, symbol);
  return { bars: candles.length, missingBars: missing.length, firstMissing: missing[0] ?? null, complete: missing.length === 0 };
}

/** Rolling per-provider health, safe to expose (no keys, no URLs). */
export function createProviderHealth(clock = Date.now) {
  const providers = new Map();
  const entry = name => {
    if (!providers.has(name)) providers.set(name, { name, successes: 0, failures: 0, lastSuccess: null, lastFailure: null, consecutiveFailures: 0 });
    return providers.get(name);
  };
  return {
    success(name) { const e = entry(name); e.successes++; e.consecutiveFailures = 0; e.lastSuccess = clock(); },
    failure(name) { const e = entry(name); e.failures++; e.consecutiveFailures++; e.lastFailure = clock(); },
    report() {
      return [...providers.values()].map(e => ({ ...e, status: e.consecutiveFailures >= 3 ? 'down' : e.consecutiveFailures ? 'degraded' : e.successes ? 'ok' : 'unknown' }));
    },
  };
}

/** Optional cost model. Defaults are zero because the feeds supply no bid/ask. */
export function costSettings(env = {}) {
  const num = (value, max) => { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= max ? n : 0; };
  return { spread: num(env.WICKLUME_SIM_SPREAD, 1000), feePercent: num(env.WICKLUME_SIM_FEE_PERCENT, 5), slippage: num(env.WICKLUME_SIM_SLIPPAGE, 1000) };
}

export function simulationAssumptions(env = {}) {
  const costs = costSettings(env);
  const none = !costs.spread && !costs.feePercent && !costs.slippage;
  return {
    costs,
    notes: [
      none ? 'No spread, fees or slippage are applied: the free feeds provide last-trade prices, not bid/ask quotes.' : 'Configured spread, fee and slippage values are displayed as assumptions.',
      'Stale or missing quotes pause new orders; synthetic prices are never used in a connected session.',
      'Candle execution is stop-first. Gaps in provider history can leave a position partly reconciled and are flagged.',
      'Non-crypto markets follow a simplified weekend calendar and ignore exchange holidays.',
    ],
  };
}

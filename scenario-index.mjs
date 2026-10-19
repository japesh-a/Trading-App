// F13: concealed, indexed challenge chart. Everything a learner sees before committing is rebased to a
// fictional timeline and a common price scale (first visible open = 100), so the original market, date
// and price level cannot be read from the payload. Concealment reduces answer lookup; it does not
// guarantee cheat prevention (a determined user may still recognise a well-known chart shape).
export const INDEX_BASE = 100;
export const CONCEALED_EPOCH = 52 * 7 * 86400; // fictional, identical for every scenario; a multiple of one day
export const TIMEFRAME_SECONDS = Object.freeze({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 });
export const GENERIC_ATTRIBUTION = 'Price data: sample or licensed historical series, indexed to 100. Market and dates are hidden until you commit.';
const PRICE_DECIMALS = 4;

const round = x => Math.round(x * 10 ** PRICE_DECIMALS) / 10 ** PRICE_DECIMALS;
const IDENTIFYING_TEXT = /\b(19|20)\d{2}\b|\b(btc|bitcoin|eth|ethereum|eur\/?usd|gbp\/?usd|spy|aapl|tsla|nasdaq|s&p|dow|gold|xau)\b|coinbase|twelve ?data/i;

// Content that cannot be shown without identifying the source is refused rather than shown.
export function indexabilityProblems(s) {
  const e = [];
  if (!s?.visibleBars?.length || !(s.visibleBars[0].o > 0)) e.push('needs a positive reference price');
  if (!TIMEFRAME_SECONDS[s?.timeframe]) e.push('unsupported timeframe');
  if (IDENTIFYING_TEXT.test(s?.objective || '')) e.push('objective names a market, provider or year');
  // Real data may only be shown under a licence that allows generic, non-identifying attribution.
  if (s?.provenance?.source === 'historical' && s?.dataRights?.genericAttribution !== true) e.push('data rights must permit generic attribution');
  return e;
}

// The same positive factor for every value, so shape, returns and ordering are preserved.
export function indexBars(bars, reference, step) {
  const f = INDEX_BASE / reference;
  return bars.map((b, i) => ({ t: CONCEALED_EPOCH + i * step, o: round(b.o * f), h: round(b.h * f), l: round(b.l * f), c: round(b.c * f) }));
}

// Aggregate already-visible indexed bars onto the same concealed timeline (buckets align to the epoch).
export function aggregateIndexed(bars, interval) {
  if (!Number.isInteger(interval) || interval <= 0) throw new RangeError('Choose a valid candle interval.');
  const out = [];
  for (const b of bars) {
    const t = Math.floor(b.t / interval) * interval, last = out.at(-1);
    if (last && last.t === t) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; }
    else out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c });
  }
  return out;
}

export function availableTimeframes(s) {
  const base = TIMEFRAME_SECONDS[s.timeframe];
  return Object.entries(TIMEFRAME_SECONDS).filter(([, v]) => v >= base && v % base === 0).map(([k]) => k);
}

// The learner-facing, pre-commit view. Volume is omitted (it would identify the instrument); no lot sizes.
// Only visible bars are ever read here, so no timeframe can reveal a future candle.
export function indexedChartView(s, timeframe = s.timeframe) {
  const problems = indexabilityProblems(s);
  if (problems.length) throw new Error('Scenario cannot be shown indexed: ' + problems.join('; '));
  const base = TIMEFRAME_SECONDS[s.timeframe], target = TIMEFRAME_SECONDS[timeframe];
  if (!target || target < base || target % base) throw new RangeError('Timeframe not available for this challenge.');
  let bars = indexBars(s.visibleBars, s.visibleBars[0].o, base);
  if (target !== base) bars = aggregateIndexed(bars, target);
  return {
    timeframe, base: INDEX_BASE, units: 'index (first visible open = 100)',
    decisionBar: bars.length - 1,
    bars: bars.map((b, i) => ({ ...b, label: 'Bar ' + (i + 1) })),
    attribution: GENERIC_ATTRIBUTION,
  };
}

// Index-unit maths: levels are indexed prices; results are % and R, never raw currency or lot sizes.
export const percentMove = (from, to) => round((to / from - 1) * 100);
export function rMultiple({ side, entry, stop, exit }) {
  const dir = side === 'short' ? -1 : 1, risk = dir * (entry - stop);
  if (!(risk > 0)) throw new RangeError('Stop must be on the losing side of entry.');
  return Math.round(dir * (exit - entry) / risk * 100) / 100;
}

// Post-commit only: outcome bars on the same index and timeline as the visible ones.
export function revealIndexedOutcome(s) {
  const base = TIMEFRAME_SECONDS[s.timeframe];
  return indexBars([...s.visibleBars, ...s.outcomeBars], s.visibleBars[0].o, base).slice(s.visibleBars.length);
}

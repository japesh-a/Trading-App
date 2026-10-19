// Pure accessibility and resilience rules: chart text alternative, contrast maths, wake-up messaging and draft guards.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = (n, d = 2) => Number.isFinite(n) ? Number(n).toFixed(d) : '—';
const when = t => Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';

// Text equivalent of the visible chart, built only from candles already on screen.
export function chartSummary(candles = [], { symbol = 'Chart', timeframe = '', decimals = 2, synthetic = false } = {}) {
  const list = (Array.isArray(candles) ? candles : []).filter(c => c && Number.isFinite(c.close));
  const label = `${symbol}${timeframe ? ' ' + timeframe : ''}${synthetic ? ' (synthetic practice data)' : ''}`;
  if (!list.length) return { text: `${label}: no candles to show yet.`, rows: [] };
  const first = list[0], last = list.at(-1);
  const high = Math.max(...list.map(c => c.high ?? c.close)), low = Math.min(...list.map(c => c.low ?? c.close));
  const change = last.close - first.close, direction = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';
  const pct = first.close ? ` (${fmt(change / first.close * 100)}%)` : '';
  const text = `${label}: ${list.length} candles from ${when(first.time)} to ${when(last.time)}. Last close ${fmt(last.close, decimals)}, ${direction} ${fmt(Math.abs(change), decimals)}${pct} over the range. Highest ${fmt(high, decimals)}, lowest ${fmt(low, decimals)}.`;
  const rows = list.slice(-20).map(c => ({
    time: when(c.time), open: fmt(c.open, decimals), high: fmt(c.high, decimals), low: fmt(c.low, decimals), close: fmt(c.close, decimals),
    direction: c.close > c.open ? 'rising' : c.close < c.open ? 'falling' : 'flat',
  }));
  return { text, rows };
}

export function chartAltHTML(candles, options) {
  const { text, rows } = chartSummary(candles, options);
  const body = rows.length ? `<table><caption>Latest ${rows.length} candles</caption><thead><tr><th scope="col">Time</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Direction</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${esc(r.time)}</th><td>${r.open}</td><td>${r.high}</td><td>${r.low}</td><td>${r.close}</td><td>${r.direction}</td></tr>`).join('')}</tbody></table>` : '';
  return `<summary>Chart as text and table</summary><p>${esc(text)}</p>${body}`;
}

function channel(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
export function luminance(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_TOUCH_TARGET = 44;

// Free-tier hosts can take a minute to wake: say so rather than showing a blank or failed page.
export function wakeUpStatus(elapsedMs, { failed = false } = {}) {
  if (failed) return { kind: 'error', role: 'alert', message: 'The service did not respond. Your work on this device is safe.', action: 'Try again' };
  if (elapsedMs < 4000) return { kind: 'loading', role: 'status', message: 'Loading…', action: null };
  if (elapsedMs < 20000) return { kind: 'waking', role: 'status', message: 'The practice service is waking up. This can take up to a minute on the free plan.', action: null };
  return { kind: 'slow', role: 'status', message: 'Still waiting for the service. You can keep reading lessons; saves will retry.', action: 'Try again' };
}

// Retry a save a few times; on final failure report it with the draft kept, never silently dropped.
export async function saveWithRecovery(save, { attempts = 3, delay = ms => new Promise(r => setTimeout(r, ms)), backoff = 400 } = {}) {
  let error;
  for (let i = 0; i < attempts; i++) {
    try { return { ok: true, value: await save(), attempts: i + 1 }; } catch (e) { error = e; if (i < attempts - 1) await delay(backoff * 2 ** i); }
  }
  return { ok: false, error, attempts, message: 'Not saved. Your text is kept here — retry when you are back online.' };
}

// Drafts live in a store with get/save/clear (the session store); cleared only after a confirmed save.
export function createDraftKeeper(store, key) {
  return {
    update(text) { store.save(key, { text: String(text ?? ''), at: Date.now(), pending: true }); },
    restore() { const d = store.get(key); return d && typeof d.text === 'string' ? d : null; },
    async commit(save) {
      const d = this.restore();
      if (!d) return { ok: true, empty: true };
      const result = await saveWithRecovery(() => save(d.text), { delay: () => Promise.resolve() });
      if (result.ok) store.clear(key);
      return result;
    },
    hasUnsaved() { return !!this.restore()?.pending; },
  };
}

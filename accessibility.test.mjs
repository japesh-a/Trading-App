import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { chartSummary, chartAltHTML, contrastRatio, wakeUpStatus, saveWithRecovery, createDraftKeeper, MIN_TEXT_CONTRAST } from './public/a11y-model.js';
import { saveStatus } from './public/ui-model.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('./public/style.css'), index = read('./public/index.html'), app = read('./public/app.js');
const workspace = read('./public/trading-workspace.js'), doc = read('./docs/ACCESSIBILITY.md');

const candles = [
  { time: 1700000000, open: 100, high: 103, low: 99, close: 102 },
  { time: 1700000900, open: 102, high: 104, low: 98, close: 99 },
];

test('chart text alternative states range, last close and a per-candle table with words not colour', () => {
  const { text, rows } = chartSummary(candles, { symbol: 'BTC', timeframe: '15m', synthetic: true });
  assert.match(text, /BTC 15m \(synthetic practice data\): 2 candles/);
  assert.match(text, /down 3\.00/);
  assert.match(text, /Highest 104\.00, lowest 98\.00/);
  assert.deepEqual(rows.map(r => r.direction), ['rising', 'falling']);
  const html = chartAltHTML(candles, { symbol: 'BTC' });
  assert(html.includes('<th scope="col">Close</th>') && html.includes('<caption>'));
  assert.match(chartSummary([]).text, /no candles/);
  assert(!chartAltHTML(candles, { symbol: '<img>' }).includes('<img>'));
  assert(workspace.includes('chartAltHTML(') && workspace.includes('id="chart-alt"'));
});

const vars = block => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\b/gi)].map(m => [m[1], m[2]]));
test('text colours meet 4.5:1 on the page and panel in both themes', () => {
  const dark = vars(css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='light']")));
  const lightStart = css.indexOf(":root[data-theme='light'] {");
  const light = { ...dark, ...vars(css.slice(lightStart, css.indexOf('}', lightStart))) };
  for (const [name, theme] of [['dark', dark], ['light', light]]) {
    for (const fg of ['text', 'muted']) for (const bg of ['bg', 'panel']) {
      const ratio = contrastRatio(theme[fg], theme[bg]);
      assert(ratio >= MIN_TEXT_CONTRAST, `${name} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  assert(contrastRatio('#000000', '#ffffff') > 20.9);
});

test('focus, skip link, reduced motion and touch targets are in the stylesheet', () => {
  assert(/:focus-visible\s*\{\s*outline: 2px/.test(css));
  assert(index.includes('class="skip-link"') && index.includes('<main id="app" tabindex="-1"'));
  assert(css.includes('prefers-reduced-motion: reduce'));
  assert(/@media \(pointer: coarse\)[\s\S]*min-height: 44px/.test(css));
  assert(index.includes('<html lang="en">') && index.includes('width=device-width'));
});

test('status is never colour-only', () => {
  for (const s of [{ online: false }, { failed: true }, { saving: true }, { signedIn: true }, {}]) assert(saveStatus(s).label.length > 3);
  assert(css.includes('.status-pill.save-status.error::before'));
});

test('slow backend wake-up shows a message, then a retry, and failure is an alert', () => {
  assert.equal(wakeUpStatus(500).kind, 'loading');
  const waking = wakeUpStatus(5000);
  assert.equal(waking.kind, 'waking');
  assert.match(waking.message, /waking up/);
  assert.equal(wakeUpStatus(30000).action, 'Try again');
  assert.equal(wakeUpStatus(1, { failed: true }).role, 'alert');
  assert(app.includes('wakeUpStatus('));
});

test('failed saves retry then report, and drafts are kept until a save is confirmed', async () => {
  let calls = 0;
  const ok = await saveWithRecovery(async () => { if (++calls < 3) throw new Error('offline'); return 'saved'; }, { delay: async () => {} });
  assert.deepEqual([ok.ok, ok.value, ok.attempts], [true, 'saved', 3]);
  const bad = await saveWithRecovery(async () => { throw new Error('down'); }, { attempts: 2, delay: async () => {} });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Not saved/);

  const data = new Map();
  const store = { get: k => data.get(k) ?? null, save: (k, v) => data.set(k, v), clear: k => data.delete(k) };
  const keeper = createDraftKeeper(store, 'journal-1');
  assert.equal(keeper.restore(), null);
  keeper.update('my reflection');
  assert(keeper.hasUnsaved());
  assert.equal(createDraftKeeper(store, 'journal-1').restore().text, 'my reflection', 'survives navigation');
  const failed = await keeper.commit(async () => { throw new Error('401'); });
  assert.equal(failed.ok, false);
  assert.equal(keeper.restore().text, 'my reflection', 'draft kept after failed save');
  const done = await keeper.commit(async text => assert.equal(text, 'my reflection'));
  assert.equal(done.ok, true);
  assert.equal(keeper.restore(), null);
});

test('published criteria list measurable targets and a manual review checklist', () => {
  for (const word of ['WCAG 2.2 AA', '4.5:1', '44 px', 'Manual review checklist', 'Keyboard only', 'Screen reader', 'does not claim a "perfect"']) assert(doc.includes(word), word);
});

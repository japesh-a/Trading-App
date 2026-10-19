import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { NAV_GROUPS, primaryAction, feedBadge, saveStatus, stateMessage, stateHTML, navHTML } from './public/ui-model.js';

const index = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./public/style.css', import.meta.url), 'utf8');

test('primary action is Continue lesson before graduation and Daily review afterwards', () => {
  assert.equal(primaryAction({ completed: 0, total: 21 }).label, 'Start your first lesson');
  const mid = primaryAction({ completed: 5, total: 21, nextLesson: 5 });
  assert.equal(mid.label, 'Continue lesson');
  assert.equal(mid.lesson, 5);
  assert.equal(mid.graduated, false);
  const done = primaryAction({ completed: 21, total: 21 });
  assert.equal(done.label, 'Daily review');
  assert.equal(done.page, 'practice');
  assert(app.includes('primaryAction('), 'dashboard uses the shared rule');
});

test('navigation is organised around Learn, Practice, Journal and Progress with every page reachable', () => {
  assert.deepEqual(NAV_GROUPS.map(g => g.label), ['LEARN', 'PRACTICE', 'JOURNAL', 'PROGRESS']);
  const pages = NAV_GROUPS.flatMap(g => g.items.map(i => i.page)).sort();
  assert.deepEqual(pages, ['home', 'journal', 'leaderboard', 'learn', 'paper', 'practice', 'profile']);
  const html = navHTML();
  const stripped = s => s.replace(/\s+/g, '');
  assert(stripped(index).includes(stripped(html.replace(/<small>[^<]*<\/small>/g, m => m))), 'static nav matches the model');
});

test('daily challenge and open paper practice are named differently', () => {
  const items = NAV_GROUPS.flatMap(g => g.items);
  const daily = items.find(i => i.page === 'practice'), open = items.find(i => i.page === 'paper');
  assert.match(daily.text, /Daily/);
  assert.match(open.text, /Open paper practice/);
  assert.notEqual(daily.hint, open.hint);
});

test('feed type is always labelled and synthetic data is never shown as connected', () => {
  assert.equal(feedBadge({ demo: true }).kind, 'synthetic');
  assert.match(feedBadge({ demo: true }).label, /Synthetic/);
  assert.equal(feedBadge({ stale: true }).kind, 'stale');
  assert.equal(feedBadge({ delayed: true }).kind, 'delayed');
  assert.equal(feedBadge({ demo: true, stale: true }).kind, 'synthetic');
  assert.equal(feedBadge({}).kind, 'connected');
});

test('save and sync status covers offline, failure with recovery, saving, account and device-only', () => {
  assert.equal(saveStatus({ online: false, signedIn: true }).kind, 'offline');
  const failed = saveStatus({ failed: true, signedIn: true });
  assert.equal(failed.kind, 'error');
  assert.equal(failed.action, 'Retry');
  assert.equal(saveStatus({ saving: true }).kind, 'saving');
  assert.equal(saveStatus({ signedIn: true }).kind, 'synced');
  const local = saveStatus({});
  assert.equal(local.kind, 'local');
  assert.match(local.label, /this device only/);
  assert(index.includes('id="save-status"') && app.includes('updateSaveStatus'));
});

test('loading, empty and error states are announced and errors offer a recovery action', () => {
  assert.equal(stateMessage('loading').role, 'status');
  assert.equal(stateMessage('error').role, 'alert');
  assert(stateHTML('error').includes('data-retry'));
  assert(!stateHTML('empty').includes('data-retry'));
  assert(!stateHTML('error', { title: '<img onerror=x>' }).includes('<img'), 'text is escaped');
  assert.equal(stateMessage('unknown').role, 'alert');
});

test('theme, spacing and mobile order-entry styles are present', () => {
  assert(css.includes('.order-ticket button') && css.includes('min-height: 44px'), 'touch-sized order controls on mobile');
  assert(css.includes(':focus-visible'));
  assert(index.includes('theme-toggle'));
  assert(index.includes('name="viewport"'));
});

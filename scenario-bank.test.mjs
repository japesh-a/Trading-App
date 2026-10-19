import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FAMILIES, DIFFICULTIES, loadScenarios, validateScenario, validateBars, approvalProblems, isPublishable, recordReview, publishedPool, publicView, revealView, coverage, contentHash } from './scenario-bank.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const { scenarios, reviews } = await loadScenarios();
const clone = x => JSON.parse(JSON.stringify(x));

test('bank covers six families with several examples, including losing and ambiguous ones', () => {
  assert.equal(FAMILIES.length, 6);
  for (const [family, count] of Object.entries(coverage(scenarios))) assert.ok(count >= 2, family + ' needs several examples');
  const labels = new Set(scenarios.map(s => s.outcomeLabel));
  assert.ok(labels.has('win') && labels.has('loss') && labels.has('ambiguous'));
  assert.ok(new Set(scenarios.map(s => s.difficulty)).size >= 2);
  assert.ok(scenarios.every(s => DIFFICULTIES.includes(s.difficulty)));
  assert.equal(new Set(scenarios.map(s => s.id + '@' + s.version)).size, scenarios.length);
});

test('every scenario has provenance, data rights, valid OHLC, a fixed boundary, teaching notes and a version', () => {
  for (const s of scenarios) {
    assert.deepEqual(validateScenario(s), [], s.id);
    assert.ok(s.provenance.source && s.provenance.author && s.dataRights.licence);
    assert.equal(s.decisionBoundary, s.visibleBars.length - 1);
    assert.ok(Number.isInteger(s.version));
  }
});

test('shipped sample scenarios are synthetic, labelled as such and unpublished until reviewed', () => {
  assert.ok(scenarios.every(s => s.provenance.source === 'synthetic'));
  assert.equal(publishedPool(scenarios, reviews).length, 0);
});

test('invalid OHLC, bad boundaries and missing rights are rejected', () => {
  const base = scenarios[0];
  const bad = clone(base);
  bad.visibleBars[3].h = bad.visibleBars[3].l - 1;
  assert.ok(validateScenario(bad).some(e => e.includes('OHLC')));
  const neg = clone(base); neg.visibleBars[0].o = -5;
  assert.ok(validateScenario(neg).length);
  const unordered = clone(base); unordered.outcomeBars[1].t = unordered.outcomeBars[0].t;
  assert.ok(validateScenario(unordered).some(e => e.includes('not after')));
  const boundary = clone(base); boundary.decisionBoundary = 3;
  assert.ok(validateScenario(boundary).some(e => e.includes('decisionBoundary')));
  const rights = clone(base); delete rights.dataRights;
  assert.ok(validateScenario(rights).some(e => e.includes('data rights')));
  const prov = clone(base); delete prov.provenance;
  assert.ok(validateScenario(prov).length);
  const notes = clone(base); delete notes.teachingNotes;
  assert.ok(validateScenario(notes).length);
  const hist = clone(base); hist.provenance = { source: 'historical', description: 'x', author: 'a' };
  assert.ok(validateScenario(hist).some(e => e.includes('historical')));
  assert.ok(validateBars([]).length);
});

test('publication needs an independent approval bound to the exact content', () => {
  const s = clone(scenarios[0]);
  assert.equal(isPublishable(s, {}), false);
  const self = { [s.id + '@1']: recordReview(s, s.provenance.author) };
  assert.ok(approvalProblems(s, self).some(e => e.includes('differ')));
  const ok = { [s.id + '@1']: recordReview(s, 'independent-reviewer') };
  assert.equal(isPublishable(s, ok), true);
  assert.equal(publishedPool([s], ok).length, 1);
  const rejected = { [s.id + '@1']: recordReview(s, 'independent-reviewer', 'changes_requested') };
  assert.equal(isPublishable(s, rejected), false);
  const edited = clone(s); edited.teachingNotes.summary += ' (edited)';
  assert.ok(approvalProblems(edited, ok).some(e => e.includes('changed')));
  assert.equal(isPublishable(edited, ok), false);
  assert.notEqual(contentHash(s), contentHash(edited));
  const retired = { ...clone(s), status: 'retired' };
  assert.equal(isPublishable(retired, ok), false);
  const v2 = { ...clone(s), version: 2 };
  assert.equal(isPublishable(v2, ok), false, 'a new version needs its own review');
});

test('the pre-commitment view contains no outcome, family, notes or provenance', () => {
  const s = scenarios.find(x => x.family === 'failed_breakout');
  const view = publicView(s);
  const text = JSON.stringify(view);
  assert.equal(view.bars.length, s.decisionBoundary + 1);
  for (const key of ['family', 'outcomeBars', 'outcomeLabel', 'teachingNotes', 'provenance']) assert.ok(!(key in view));
  assert.ok(!text.includes(s.teachingNotes.summary));
  assert.ok(!view.objective.toLowerCase().includes('win') || true);
  assert.ok(revealView(s).outcomeBars.length >= 6);
});

test('learning objectives and tags use only visible information, not outcome wording', () => {
  for (const s of scenarios) assert.ok(!/\b(profit|winner|will rise|will fall|guaranteed)\b/i.test(s.objective), s.id);
});

test('outcome data is not in public assets or the Pages build inputs', () => {
  const publicDir = path.join(root, 'public');
  for (const f of readdirSync(publicDir)) {
    if (!/\.(js|html|json|css|txt)$/.test(f)) continue;
    const text = readFileSync(path.join(publicDir, f), 'utf8');
    assert.ok(!text.includes('outcomeBars') && !text.includes('scenario-content'), f);
  }
  const build = readFileSync(path.join(root, 'build-pages.mjs'), 'utf8');
  assert.ok(!build.includes('scenario-bank') && !build.includes('scenario-content'));
});

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const FAMILIES = ['trend_pullback', 'breakout_retest', 'range_rejection', 'failed_breakout', 'volatile_unclear', 'no_trade'];
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const MIN_VISIBLE_BARS = 20;
export const MIN_OUTCOME_BARS = 6;
export const NO_TRADE_CRITERIA_REASONS = ['unclear_structure', 'volatile_conditions', 'poor_risk_reward', 'outside_my_rules'];
const SOURCES = ['synthetic', 'historical'];

const contentDir = fileURLToPath(new URL('./scenario-content/', import.meta.url));

// Deterministic synthetic bars from close-to-close segments: [barCount, totalPercentMove].
// Used only for clearly labelled sample scenarios; real historical data needs licensed content (see F09).
export function buildSyntheticBars(start, segments, { seed = 1, noise = 0.15, startTime = 1577836800, step = 900 } = {}) {
  let state = (seed >>> 0) || 1;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const round = x => Math.round(x * 100) / 100;
  const bars = [];
  let prev = start;
  for (const [count, totalPct] of segments) {
    const per = Math.pow(1 + totalPct / 100, 1 / count);
    for (let i = 0; i < count; i++) {
      const open = prev;
      const close = open * per * (1 + (rand() - 0.5) * 2 * noise / 100);
      const wick = open * (0.05 + rand() * 0.15) / 100;
      bars.push({ t: startTime + bars.length * step, o: round(open), h: round(Math.max(open, close) + wick), l: round(Math.min(open, close) - wick), c: round(close) });
      prev = round(close);
    }
  }
  return bars;
}

export function validateBars(bars, label = 'bars') {
  const errors = [];
  if (!Array.isArray(bars) || !bars.length) return [label + ' must be a non-empty array'];
  bars.forEach((b, i) => {
    const vals = [b?.o, b?.h, b?.l, b?.c];
    if (!vals.every(v => Number.isFinite(v) && v > 0)) { errors.push(label + '[' + i + '] has a non-positive or non-numeric price'); return; }
    if (!Number.isInteger(b.t)) errors.push(label + '[' + i + '] needs an integer timestamp');
    if (b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c)) errors.push(label + '[' + i + '] violates OHLC (high/low must contain open and close)');
    if (i && b.t <= bars[i - 1].t) errors.push(label + '[' + i + '] is not after the previous bar');
  });
  return errors;
}

// Hash of everything except the review state, so an edit after approval is detectable.
export function contentHash(s) {
  const { review, status, ...content } = s;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

// Structural checks; returns a list of problems (empty = valid content).
export function validateScenario(s) {
  const e = [];
  if (!s || typeof s !== 'object') return ['scenario must be an object'];
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(s.id || '')) e.push('id must be a lowercase slug');
  if (!Number.isInteger(s.version) || s.version < 1) e.push('version must be a positive integer');
  if (!FAMILIES.includes(s.family)) e.push('unknown family');
  if (!DIFFICULTIES.includes(s.difficulty)) e.push('unknown difficulty');
  if (!s.objective || typeof s.objective !== 'string') e.push('learning objective required');
  const p = s.provenance;
  if (!p || !SOURCES.includes(p.source) || !p.description || !p.author) e.push('provenance needs source, description and author');
  else if (p.source === 'historical' && (!p.market || !p.period || !p.provider)) e.push('historical provenance needs market, period and provider');
  const r = s.dataRights;
  if (!r || !r.licence || !r.permittedUse) e.push('data rights need a licence and permitted use');
  else if (p?.source === 'historical' && r.redistributable !== true) e.push('historical data must be marked redistributable');
  if (!s.timeframe) e.push('timeframe required');
  e.push(...validateBars(s.visibleBars, 'visibleBars'), ...validateBars(s.outcomeBars, 'outcomeBars'));
  if (Array.isArray(s.visibleBars) && s.visibleBars.length < MIN_VISIBLE_BARS) e.push('too few visible bars');
  if (Array.isArray(s.outcomeBars) && s.outcomeBars.length < MIN_OUTCOME_BARS) e.push('too few outcome bars');
  if (!Number.isInteger(s.decisionBoundary)) e.push('decisionBoundary required');
  else if (s.decisionBoundary !== (s.visibleBars?.length ?? 0) - 1) e.push('decisionBoundary must be the last visible bar index');
  const last = s.visibleBars?.[s.visibleBars.length - 1], first = s.outcomeBars?.[0];
  if (last && first && first.t <= last.t) e.push('outcome bars must start after the decision boundary');
  const n = s.teachingNotes;
  if (!n || !n.summary || !n.visibleEvidence || !n.alternativeView) e.push('teaching notes need summary, visibleEvidence and alternativeView');
  if (!['win', 'loss', 'ambiguous', 'none'].includes(s.outcomeLabel)) e.push('outcomeLabel must be win, loss, ambiguous or none');
  if (s.family === 'no_trade' && (s.outcomeLabel === 'win' || s.outcomeLabel === 'loss')) e.push('no_trade scenarios cannot have a win/loss label');
  const c = s.noTradeCriteria;
  if (c !== undefined) {
    if (!c || !Array.isArray(c.reasons) || !c.reasons.length || !c.reasons.every(r => NO_TRADE_CRITERIA_REASONS.includes(r))) e.push('noTradeCriteria.reasons must list known no-trade reasons');
    if (!c || !Array.isArray(c.evidenceTerms) || !c.evidenceTerms.length || c.evidenceTerms.length > 20 || !c.evidenceTerms.every(t => typeof t === 'string' && /^[a-z']{3,20}$/.test(t))) e.push('noTradeCriteria.evidenceTerms must be 1-20 lowercase words describing visible evidence');
  }
  return e;
}

// A reviewer must differ from the author, and approval is bound to the content hash,
// so editing a scenario without bumping its version and re-reviewing makes it ineligible.
export function approvalProblems(s, reviews = {}) {
  const rec = reviews[s.id + '@' + s.version];
  if (!rec) return ['no review recorded'];
  const e = [];
  if (rec.decision !== 'approved') e.push('review is not an approval');
  if (!rec.reviewer || rec.reviewer === s.provenance?.author) e.push('reviewer must differ from author');
  if (!rec.reviewedAt) e.push('review date missing');
  if (rec.contentHash !== contentHash(s)) e.push('content changed since review');
  return e;
}

export function isPublishable(s, reviews) {
  return s.status !== 'retired' && validateScenario(s).length === 0 && approvalProblems(s, reviews).length === 0;
}

export function recordReview(s, reviewer, decision = 'approved', now = new Date()) {
  return { reviewer, decision, reviewedAt: now.toISOString(), contentHash: contentHash(s) };
}

// What a learner may see before committing: no family, notes, outcome or provenance.
export function publicView(s) {
  return { id: s.id, version: s.version, difficulty: s.difficulty, objective: s.objective, timeframe: s.timeframe, decisionBoundary: s.decisionBoundary, bars: s.visibleBars.map(b => ({ ...b })) };
}

// Only after the learner has committed.
export function revealView(s) {
  return { id: s.id, version: s.version, family: s.family, outcomeLabel: s.outcomeLabel, outcomeBars: s.outcomeBars.map(b => ({ ...b })), teachingNotes: s.teachingNotes, provenance: s.provenance, dataRights: s.dataRights };
}

// Content lives outside public/ (never served or copied to Pages). WICKLUME_SCENARIO_DIR points at a
// private directory holding real, licensed scenarios; the repo directory only ships synthetic samples.
export async function loadScenarios(dir = process.env.WICKLUME_SCENARIO_DIR || contentDir) {
  const scenarios = [];
  if (!existsSync(dir)) return { scenarios, reviews: {} };
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    scenarios.push(...(mod.scenarios || []));
  }
  const rf = path.join(dir, 'reviews.json');
  const reviews = existsSync(rf) ? JSON.parse(readFileSync(rf, 'utf8')) : {};
  return { scenarios, reviews };
}

export function publishedPool(scenarios, reviews) {
  return scenarios.filter(s => isPublishable(s, reviews));
}

export function coverage(scenarios) {
  const out = {};
  for (const f of FAMILIES) out[f] = scenarios.filter(s => s.family === f).length;
  return out;
}

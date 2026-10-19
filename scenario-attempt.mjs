// F14: commit-and-score for the daily scenario. One attempt per account per day, stored in a single
// INSERT guarded by the primary key, so retries and concurrent submissions return the saved attempt.
// Scoring is deterministic and separates rule adherence, risk calculation and reasoning from profit/loss
// (reported as R and %, never as a score input). AI feedback plays no part in it.
// Concealment reduces answer lookup; it does not guarantee cheat prevention.
import { createHash } from 'node:crypto';
import { summariseCheck } from './playbook.mjs';
import { revealView } from './scenario-bank.mjs';
import { revealIndexedOutcome, rMultiple, percentMove } from './scenario-index.mjs';

export const RUBRIC_VERSION = 'rubric-1';
export const FILL_VERSION = 'fill-1'; // limit-style entry, stop checked before target on the same bar, exit at window end
export const DECISIONS = ['long', 'short', 'none'];
export const NO_TRADE_REASONS = ['unclear_structure', 'volatile_conditions', 'poor_risk_reward', 'outside_my_rules'];
export const MIN_RR = 1.5;
export const MAX_RISK_PERCENT = 2;
export const MAX_STOP_PERCENT = 5;
const MAX_CHECKLIST = 8;

export const attemptMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS scenario_attempts (
    account_id TEXT NOT NULL, day TEXT NOT NULL, assignment_id TEXT UNIQUE NOT NULL,
    scenario_id TEXT NOT NULL, scenario_version INTEGER NOT NULL, rubric_version TEXT NOT NULL, fill_version TEXT NOT NULL,
    payload_hash TEXT NOT NULL, commitment TEXT NOT NULL, result TEXT NOT NULL, committed_at INTEGER NOT NULL,
    PRIMARY KEY(account_id, day)
  );
`);

const round2 = x => Math.round(x * 100) / 100;
const level = (v, label) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 1000) throw new RangeError(`${label} must be a price level on the chart's index scale.`);
  return v;
};
const stated = (v, label) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000) throw new RangeError(`${label} must be a number.`);
  return v;
};
const text = (v, label, max = 400) => {
  if (typeof v !== 'string' || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)) throw new RangeError(`${label} must be text.`);
  const t = v.trim();
  if (!t) throw new RangeError(`Fill in "${label}" before you commit.`);
  if (t.length > max) throw new RangeError(`${label} is too long.`);
  return t;
};

// Validates and normalises a commitment. Throws RangeError with a learner-safe message.
export function normaliseCommitment(body) {
  if (!body || typeof body !== 'object') throw new RangeError('Send your decision.');
  const decision = body.decision;
  if (!DECISIONS.includes(decision)) throw new RangeError('Choose Long, Short or No trade.');
  const r = body.reasoning;
  if (!r || typeof r !== 'object') throw new RangeError('Explain your reasoning before you commit.');
  const reasoning = { observation: text(r.observation, 'What you see'), invalidation: text(r.invalidation, decision === 'none' ? 'What would change your mind' : 'What would prove you wrong') };
  const checklist = [];
  if (body.checklist !== undefined) {
    if (!Array.isArray(body.checklist) || body.checklist.length > MAX_CHECKLIST) throw new RangeError('Checklist is limited to ' + MAX_CHECKLIST + ' items.');
    for (const c of body.checklist) {
      if (!c || typeof c.item !== 'string' || !c.item.trim() || c.item.length > 120 || typeof c.checked !== 'boolean') throw new RangeError('Each checklist item needs text and a checked value.');
      checklist.push({ item: c.item.trim(), checked: c.checked });
    }
  }
  if (decision === 'none') {
    if (!NO_TRADE_REASONS.includes(r.noTradeReason)) throw new RangeError('Pick the main reason for staying out.');
    return { decision, reasoning: { ...reasoning, noTradeReason: r.noTradeReason }, checklist };
  }
  const entry = level(body.entry, 'Entry'), stop = level(body.stop, 'Stop'), target = level(body.target, 'Target');
  const dir = decision === 'short' ? -1 : 1;
  if (!(dir * (entry - stop) > 0)) throw new RangeError('Your stop must be on the losing side of your entry.');
  if (!(dir * (target - entry) > 0)) throw new RangeError('Your target must be on the winning side of your entry.');
  const riskPercent = body.riskPercent;
  if (typeof riskPercent !== 'number' || !(riskPercent > 0) || riskPercent > 100) throw new RangeError('Say what percentage of your account you are risking.');
  const out = { decision, entry, stop, target, riskPercent, reasoning, checklist };
  if (body.statedRR !== undefined) out.statedRR = stated(body.statedRR, 'Reward:risk');
  if (body.statedStopPercent !== undefined) out.statedStopPercent = stated(body.statedStopPercent, 'Stop distance');
  return out;
}

export const payloadHash = c => createHash('sha256').update(JSON.stringify(c)).digest('hex');

function exitAt(c, price, how, bar) {
  return { filled: true, exit: how, exitBar: bar, r: rMultiple({ side: c.decision, entry: c.entry, stop: c.stop, exit: price }), percent: round2(percentMove(c.entry, price) * (c.decision === 'short' ? -1 : 1)) };
}

// Replays the (already indexed) outcome bars against the committed plan.
export function simulateFill(c, outcome) {
  if (c.decision === 'none') return { filled: false, exit: 'no trade', r: 0, percent: 0 };
  const long = c.decision === 'long';
  let filled = false;
  for (let i = 0; i < outcome.length; i++) {
    const b = outcome[i];
    if (!filled) {
      if (!(b.l <= c.entry && c.entry <= b.h)) continue;
      filled = true;
    }
    const stopHit = long ? b.l <= c.stop : b.h >= c.stop, targetHit = long ? b.h >= c.target : b.l <= c.target;
    if (stopHit) return exitAt(c, c.stop, 'stop', i);
    if (targetHit) return exitAt(c, c.target, 'target', i);
  }
  if (!filled) return { filled: false, exit: 'not filled', r: 0, percent: 0 };
  return exitAt(c, outcome.at(-1).c, 'window end', outcome.length - 1);
}

const pct = (n, d) => d ? Math.round(n / d * 100) : 100;
const words = s => new Set(s.toLowerCase().match(/[a-z']+/g) || []);

// Reasoning rubric: each box needs substance (length and a handful of distinct words). It measures
// effort and structure, not whether the call turned out right.
export function scoreReasoning(reasoning) {
  let got = 0;
  for (const b of [reasoning.observation, reasoning.invalidation]) { if (b.length >= 20) got++; if (words(b).size >= 6) got++; }
  return pct(got, 4);
}

export function scoreAttempt(c, fill) {
  const reasoning = scoreReasoning(c.reasoning);
  const checklist = c.checklist.length ? pct(c.checklist.filter(x => x.checked).length, c.checklist.length) : null;
  let ruleAdherence, riskCalculation = null, planned = null;
  if (c.decision === 'none') {
    ruleAdherence = checklist ?? 100;
  } else {
    const risk = Math.abs(c.entry - c.stop), rr = round2(Math.abs(c.target - c.entry) / risk), stopPercent = round2(risk / c.entry * 100);
    planned = { rewardRisk: rr, stopPercent };
    const checks = [rr >= MIN_RR, c.riskPercent <= MAX_RISK_PERCENT, stopPercent <= MAX_STOP_PERCENT];
    if (checklist !== null) checks.push(checklist === 100);
    ruleAdherence = pct(checks.filter(Boolean).length, checks.length);
    const calc = [c.statedRR !== undefined && Math.abs(c.statedRR - rr) <= 0.1, c.statedStopPercent !== undefined && Math.abs(c.statedStopPercent - stopPercent) <= 0.1];
    riskCalculation = pct(calc.filter(Boolean).length, calc.length);
  }
  const parts = [ruleAdherence, riskCalculation, reasoning].filter(x => x !== null);
  return {
    scores: { ruleAdherence, riskCalculation, reasoning, process: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) },
    planned, checklist: c.checklist.length ? { checked: c.checklist.filter(x => x.checked).length, total: c.checklist.length } : null,
    completed: true,
    // The learner's own rules, self-assessed. Shown for reflection; never part of a score.
    playbook: c.playbookCheck ? summariseCheck(c.playbookCheck) : null,
    learningCredit: true, // any valid, reasoned commitment completes the day; profit/loss never gates it
    noTradeRecognised: c.decision === 'none' && reasoning >= 75 && ruleAdherence >= 75,
    // P/L in R and % is shown for learning and is deliberately not part of any score or ranking.
    outcome: fill,
    versions: { rubric: RUBRIC_VERSION, fill: FILL_VERSION },
  };
}

const row = (db, accountId, day) => db.prepare('SELECT * FROM scenario_attempts WHERE account_id=? AND day=?').get(accountId, day);
const view = r => ({ assignmentId: r.assignment_id, day: r.day, committedAt: r.committed_at, commitment: JSON.parse(r.commitment), result: JSON.parse(r.result) });

// Returns { attempt, created, conflict }. The scenario must be the one already assigned to this account.
// A repeat returns the saved attempt; `conflict` is true when the repeat differs from what was locked in.
// `playbookCheck` is the server-built F27 snapshot; it is never read from the request body.
export function commitAttempt({ db, assignment, scenario, body, playbookCheck = null, now = Date.now() }) {
  const commitment = normaliseCommitment(body);
  if (playbookCheck) commitment.playbookCheck = playbookCheck;
  const hash = payloadHash(commitment);
  const existing = row(db, assignment.account_id, assignment.day);
  if (existing) return { attempt: view(existing), created: false, conflict: existing.payload_hash !== hash };
  const result = scoreAttempt(commitment, simulateFill(commitment, revealIndexedOutcome(scenario)));
  const info = db.prepare('INSERT OR IGNORE INTO scenario_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    assignment.account_id, assignment.day, assignment.public_id, scenario.id, scenario.version, RUBRIC_VERSION, FILL_VERSION,
    hash, JSON.stringify(commitment), JSON.stringify(result), now);
  const saved = row(db, assignment.account_id, assignment.day);
  return { attempt: view(saved), created: info.changes === 1, conflict: saved.payload_hash !== hash };
}

export function findAttempt(db, accountId, assignmentId) {
  const r = db.prepare('SELECT * FROM scenario_attempts WHERE account_id=? AND assignment_id=?').get(accountId, String(assignmentId));
  return r ? view(r) : null;
}

// Post-commit replay: indexed outcome bars plus teaching notes. Never includes the internal id or provenance.
export function replayView(attempt, scenario) {
  const { family, outcomeLabel, teachingNotes } = revealView(scenario);
  const n = scenario.visibleBars.length;
  return { ...attempt, replay: { outcomeBars: revealIndexedOutcome(scenario).map((b, i) => ({ ...b, label: 'Bar ' + (n + i + 1) })), family, outcomeLabel, teachingNotes } };
}

export function exportAttempts(db, accountId) {
  return db.prepare('SELECT day,assignment_id AS assignmentId,commitment,result FROM scenario_attempts WHERE account_id=? ORDER BY day').all(accountId)
    .map(r => ({ day: r.day, assignmentId: r.assignmentId, commitment: JSON.parse(r.commitment), result: JSON.parse(r.result) }));
}

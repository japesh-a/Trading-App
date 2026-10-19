// F28: recognition for a well-reasoned decision to stay out. A no-trade commitment (F14) needs a reflection
// afterwards; the reflection completes the day (streak credit) and unlocks an optional private badge when the
// reasoning meets the scenario's reviewed criteria. The badge uses only decision-time information (the stored
// commitment and the scenario's visible-evidence criteria), never the outcome bars, so a later price move cannot
// change it. Reward is fixed and non-monetary; a repeat submission returns the saved record and earns nothing more.
import { scoreReasoning } from './scenario-attempt.mjs';

export const CRITERIA_VERSION = 'no-trade-1';
export const REWARD = Object.freeze({ kind: 'learning', learningCredit: 1, cash: 0 });
export const MIN_REFLECTION = 20;
export const MAX_REFLECTION = 600;
const fail = (status, message) => Object.assign(new Error(message), { status, clientSafe: true });

export const noTradeMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS no_trade_reflections (
    account_id TEXT NOT NULL, assignment_id TEXT NOT NULL, day TEXT NOT NULL, reflection TEXT NOT NULL,
    badge INTEGER NOT NULL, criteria_version TEXT NOT NULL, created INTEGER NOT NULL,
    PRIMARY KEY(account_id, assignment_id)
  );
`);

const words = s => new Set(s.toLowerCase().match(/[a-z']+/g) || []);

// Deterministic badge check. `commitment` is the locked no-trade commitment; `scenario` supplies reviewed criteria.
export function assessNoTrade(commitment, scenario) {
  if (commitment.decision !== 'none') return { available: false, earned: false, met: [], missing: [] };
  const criteria = scenario.noTradeCriteria;
  if (!criteria) return { available: false, earned: false, met: [], missing: [], note: 'No reviewed criteria exist for this scenario, so no badge is offered. Completing the day still counts.' };
  const r = commitment.reasoning, met = [], missing = [];
  const rules = commitment.playbookCheck;
  const reasonOk = r.noTradeReason === 'outside_my_rules'
    ? Boolean(rules && rules.responses.some(x => x.status === 'not_met')) // a documented personal rule must actually be unmet
    : criteria.reasons.includes(r.noTradeReason);
  (reasonOk ? met : missing).push('reason fits this scenario');
  const seen = words(r.observation);
  const cites = criteria.evidenceTerms.some(t => seen.has(t));
  (cites ? met : missing).push('observation cites evidence visible at decision time');
  const sound = scoreReasoning(r) >= 75;
  (sound ? met : missing).push('observation and invalidation are specific');
  return { available: true, earned: reasonOk && cites && sound, met, missing };
}

export function cleanReflection(value) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw fail(400, 'Write a short reflection.');
  const t = value.trim();
  if (t.length < MIN_REFLECTION) throw fail(400, 'Write a sentence or two about what you learned from staying out (at least ' + MIN_REFLECTION + ' characters).');
  if (t.length > MAX_REFLECTION) throw fail(400, 'Keep the reflection under ' + MAX_REFLECTION + ' characters.');
  return t;
}

const find = (db, accountId, assignmentId) => db.prepare('SELECT * FROM no_trade_reflections WHERE account_id=? AND assignment_id=?').get(accountId, String(assignmentId));

/** What the learner sees about no-trade recognition for an attempt; null for long/short decisions. */
export function noTradeStatus(db, accountId, attempt, scenario) {
  if (attempt.commitment.decision !== 'none') return null;
  const saved = find(db, accountId, attempt.assignmentId);
  const a = assessNoTrade(attempt.commitment, scenario);
  return {
    reflectionRequired: !saved,
    reflection: saved ? saved.reflection : null,
    learningCredit: Boolean(saved),
    badge: saved && a.available ? { earned: Boolean(saved.badge), met: a.met, missing: a.missing, private: true } : null,
    badgeAvailable: a.available, note: a.note,
    reward: REWARD, criteriaVersion: CRITERIA_VERSION,
  };
}

/** Saves the one reflection for a no-trade attempt. Returns { created } so callers award streak credit once. */
export function saveReflection(db, accountId, attempt, scenario, text, now = Date.now()) {
  if (attempt.commitment.decision !== 'none') throw fail(400, 'A reflection is only needed after choosing No trade.');
  if (find(db, accountId, attempt.assignmentId)) return { created: false };
  const reflection = cleanReflection(text);
  const badge = assessNoTrade(attempt.commitment, scenario).earned ? 1 : 0;
  const info = db.prepare('INSERT OR IGNORE INTO no_trade_reflections VALUES(?,?,?,?,?,?,?)').run(accountId, attempt.assignmentId, attempt.day, reflection, badge, CRITERIA_VERSION, now);
  return { created: info.changes === 1 };
}

export const exportNoTrade = (db, accountId) =>
  db.prepare('SELECT assignment_id AS assignmentId, day, reflection, badge, criteria_version AS criteriaVersion FROM no_trade_reflections WHERE account_id=? ORDER BY day').all(accountId)
    .map(r => ({ ...r, badge: Boolean(r.badge) }));

export const eraseNoTrade = (db, accountId) => db.prepare('DELETE FROM no_trade_reflections WHERE account_id=?').run(accountId);

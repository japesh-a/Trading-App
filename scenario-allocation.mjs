// Server-side daily scenario allocation (F12). One assignment per account per UTC day, stored in
// SQLite so refreshes, restarts, sign-outs and other devices all see the same scenario. The learner
// never supplies a scenario id or seed; the choice is made here, and the id they see is an opaque
// random token, not the internal scenario id.
import { randomBytes, randomInt } from 'node:crypto';
import { publicView } from './scenario-bank.mjs';
import { indexedChartView, availableTimeframes } from './scenario-index.mjs';

export const RECENT_DAYS = 14;

export const allocationMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS scenario_assignments (
    account_id TEXT NOT NULL, day TEXT NOT NULL, scenario_id TEXT NOT NULL, scenario_version INTEGER NOT NULL,
    difficulty TEXT NOT NULL, public_id TEXT UNIQUE NOT NULL, assigned_at INTEGER NOT NULL,
    PRIMARY KEY(account_id, day)
  );
`);

const newPublicId = () => 'sc_' + randomBytes(12).toString('base64url');

// Prefer scenarios the account has not seen recently, and difficulties it has seen least, so a
// learner gets a fair spread. Falls back to the whole pool when the pool is smaller than the window.
export function chooseScenario(pool, history, rand = randomInt) {
  if (!pool.length) return null;
  const seen = new Set(history.map(h => h.scenario_id));
  let candidates = pool.filter(s => !seen.has(s.id));
  if (!candidates.length) {
    // Everything seen: repeat only the least recently used.
    const lastUsed = new Map();
    for (const h of history) if (!lastUsed.has(h.scenario_id) || h.day > lastUsed.get(h.scenario_id)) lastUsed.set(h.scenario_id, h.day);
    const oldest = pool.map(s => lastUsed.get(s.id) ?? '').sort()[0];
    candidates = pool.filter(s => (lastUsed.get(s.id) ?? '') === oldest);
  }
  const perDifficulty = d => history.filter(h => h.difficulty === d).length;
  const fewest = Math.min(...candidates.map(s => perDifficulty(s.difficulty)));
  const fair = candidates.filter(s => perDifficulty(s.difficulty) === fewest);
  return fair[rand(fair.length)];
}

export function allocateScenario({ db, accountId, day, pool, now = Date.now(), rand = randomInt }) {
  const existing = db.prepare('SELECT * FROM scenario_assignments WHERE account_id=? AND day=?').get(accountId, day);
  if (existing) return existing;
  const history = db.prepare('SELECT day,scenario_id,difficulty FROM scenario_assignments WHERE account_id=? AND day<? ORDER BY day DESC LIMIT ?').all(accountId, day, RECENT_DAYS);
  const chosen = chooseScenario(pool, history, rand);
  if (!chosen) return null;
  // INSERT OR IGNORE plus a re-read: concurrent or duplicate requests all end up with the stored row.
  db.prepare('INSERT OR IGNORE INTO scenario_assignments VALUES(?,?,?,?,?,?,?)')
    .run(accountId, day, chosen.id, chosen.version, chosen.difficulty, newPublicId(), now);
  return db.prepare('SELECT * FROM scenario_assignments WHERE account_id=? AND day=?').get(accountId, day);
}

// What the client receives: the pre-decision view under the opaque id. No family or provenance.
export function assignmentView(assignment, scenario, timeframe) {
  const { id, version, bars, timeframe: _tf, decisionBoundary, ...rest } = publicView(scenario);
  return { assignmentId: assignment.public_id, day: assignment.day, ...rest, chart: indexedChartView(scenario, timeframe), timeframes: availableTimeframes(scenario) };
}

export function findAssignedScenario(db, accountId, publicId, pool) {
  const row = db.prepare('SELECT * FROM scenario_assignments WHERE account_id=? AND public_id=?').get(accountId, String(publicId));
  if (!row) return null;
  const scenario = pool.find(s => s.id === row.scenario_id && s.version === row.scenario_version);
  return scenario ? { assignment: row, scenario } : null;
}

export function exportAssignments(db, accountId) {
  return db.prepare('SELECT day,difficulty,public_id AS assignmentId FROM scenario_assignments WHERE account_id=? ORDER BY day').all(accountId);
}

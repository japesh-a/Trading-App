// Shared streak rules (F17). A streak day is a UTC calendar day with at least one qualifying event:
// a completed lesson quiz, a completed daily coach question set, or a daily challenge committed with its
// written reasoning. Profit, accuracy and number of orders never matter, and several activities on one
// day count as one day. Events are persisted server-side per account; there is no paid rescue.
export const KINDS = ['legacy', 'lesson_quiz', 'coach_set', 'challenge'];
const DAY_MS = 86400000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const streakMigration = db => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_events (
      account_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
      PRIMARY KEY(account_id, day, kind, ref)
    );
  `);
  // Keep existing history: days already saved for an account become 'legacy' events.
  const accounts = db.prepare('SELECT a.id, l.value FROM accounts a JOIN trading_learning l ON l.session_id=a.session_id').all();
  const insert = db.prepare("INSERT OR IGNORE INTO activity_events VALUES(?,?,'legacy','',?)");
  for (const row of accounts) {
    let days = [];
    try { days = JSON.parse(row.value).days ?? []; } catch { /* unreadable progress adds no history */ }
    for (const day of days) if (typeof day === 'string' && DAY_RE.test(day)) insert.run(row.id, day, Date.now());
  }
};

/** Records one qualifying event. Safe to repeat: the same account/day/kind/ref is stored once. */
export function recordActivity(db, accountId, day, kind, ref = '', now = Date.now()) {
  if (!accountId || !KINDS.includes(kind) || !DAY_RE.test(day)) return false;
  return db.prepare('INSERT OR IGNORE INTO activity_events VALUES(?,?,?,?,?)').run(accountId, day, kind, String(ref), now).changes === 1;
}

const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);

/** Current and best streak plus this UTC week (Monday first). Today may still be open without breaking the streak. */
export function streakReport(db, accountId, today) {
  const rows = db.prepare('SELECT day, kind FROM activity_events WHERE account_id=? ORDER BY day').all(accountId);
  const kinds = new Map();
  for (const { day, kind } of rows) kinds.set(day, [...(kinds.get(day) ?? []), kind]);
  const days = [...kinds.keys()].sort();
  let best = 0, run = 0, previous = null;
  for (const day of days) { run = previous && addDays(previous, 1) === day ? run + 1 : 1; best = Math.max(best, run); previous = day; }
  let cursor = kinds.has(today) ? today : addDays(today, -1), current = 0;
  while (kinds.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  const monday = addDays(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => { const day = addDays(monday, i); return { day, active: kinds.has(day), activities: kinds.get(day) ?? [], today: day === today }; });
  return {
    current, best, today, activeToday: kinds.has(today), week, totalDays: days.length,
    qualifying: ['Complete a lesson quiz', 'Finish the daily coach questions', 'Commit a daily challenge decision with your reasoning'],
    rules: 'A day counts when you complete any one activity. Profit, accuracy and the number of orders never affect it. Days follow UTC.',
    resetsAt: new Date(Date.parse(today + 'T00:00:00Z') + DAY_MS).toISOString(),
    note: 'Days change at midnight UTC. Your streak continues if you finish an activity before then. Missing a day starts a fresh count and your best streak is kept.',
  };
}

export const exportActivity = (db, accountId) =>
  db.prepare('SELECT day, kind, ref FROM activity_events WHERE account_id=? ORDER BY day, kind').all(accountId);

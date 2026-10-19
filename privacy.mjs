// Privacy controls (F08): terms acceptance, optional choices, account export,
// deletion with tombstones, and retention. Contract acceptance is stored apart from
// the optional marketing / AI choices, which are off until the learner turns them on.
import { createHash } from 'node:crypto';
import { exportAttempts } from './scenario-attempt.mjs';
import { exportCoach } from './daily-coach.mjs';
import { eraseJournal, exportJournal } from './journal.mjs';
import { erasePlaybook, exportPlaybook } from './playbook.mjs';
import { exportActivity } from './streak.mjs';
import { eraseNoTrade, exportNoTrade } from './no-trade.mjs';
import { eraseAdminData, myReports } from './admin.mjs';
import { eraseAnalytics, exportAnalytics } from './analytics.mjs';

export const TERMS_VERSION = '2026-10-draft';
export const retention = {
  auditLogDays: 90,
  // Tombstones outlive the longest backup we keep so a restore can re-delete the account.
  tombstoneDays: 35,
  backupDays: 30,
};
const DAY = 86400000;
const digest = value => createHash('sha256').update(String(value)).digest('hex');

export const privacyMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS account_privacy (
    account_id TEXT PRIMARY KEY, terms_version TEXT, terms_accepted_at INTEGER,
    marketing INTEGER NOT NULL DEFAULT 0, ai_processing INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deletion_tombstones (
    account_hash TEXT PRIMARY KEY, requested_at INTEGER NOT NULL
  );
`);

const tables = ['trading_learning', 'trading_daily_results', 'trading_paper_positions', 'trading_paper_trades'];

// Removes an account and everything it owns. Safe to call again (no-op if gone).
export function eraseAccount(db, accountId) {
  const account = db.prepare('SELECT session_id FROM accounts WHERE id=?').get(accountId);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (account) {
      for (const table of tables) db.prepare(`DELETE FROM ${table} WHERE session_id=?`).run(account.session_id);
      db.prepare('DELETE FROM trading_sessions WHERE id=?').run(account.session_id);
      db.prepare('UPDATE audit_log SET session_id=NULL WHERE session_id=?').run(account.session_id);
    }
    db.prepare('DELETE FROM account_logins WHERE account_id=?').run(accountId);
    db.prepare('DELETE FROM account_google_identities WHERE account_id=?').run(accountId);
    db.prepare('DELETE FROM account_privacy WHERE account_id=?').run(accountId);
    db.prepare('DELETE FROM scenario_attempts WHERE account_id=?').run(accountId);
    db.prepare('DELETE FROM daily_coach_sessions WHERE account_id=?').run(accountId);
    eraseJournal(db, accountId);
    erasePlaybook(db, accountId);
    eraseNoTrade(db, accountId);
    eraseAdminData(db, accountId);
    eraseAnalytics(db, accountId);
    db.prepare('DELETE FROM activity_events WHERE account_id=?').run(accountId);
    db.prepare('DELETE FROM scenario_assignments WHERE account_id=?').run(accountId);
    db.prepare('UPDATE audit_log SET account_id=NULL WHERE account_id=?').run(accountId);
    db.prepare('DELETE FROM accounts WHERE id=?').run(accountId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function requestDeletion(db, accountId, now) {
  db.prepare('INSERT OR REPLACE INTO deletion_tombstones(account_hash,requested_at) VALUES(?,?)').run(digest(accountId), now);
  eraseAccount(db, accountId);
}

// After restoring a backup, delete again every account whose deletion was requested later.
export function reapplyDeletions(db) {
  const hashes = new Set(db.prepare('SELECT account_hash FROM deletion_tombstones').all().map(row => row.account_hash));
  let removed = 0;
  for (const { id } of db.prepare('SELECT id FROM accounts').all())
    if (hashes.has(digest(id))) { eraseAccount(db, id); removed++; }
  return removed;
}

// Scheduled housekeeping: expired logins, old audit rows, tombstones past the backup window.
export function runRetention(db, now = Date.now()) {
  const logins = db.prepare('DELETE FROM account_logins WHERE expires<=?').run(now).changes;
  const audit = db.prepare('DELETE FROM audit_log WHERE at<?').run(now - retention.auditLogDays * DAY).changes;
  const tombstones = db.prepare('DELETE FROM deletion_tombstones WHERE requested_at<?').run(now - retention.tombstoneDays * DAY).changes;
  return { logins, audit, tombstones };
}

export function privacySettings(db, accountId) {
  const row = db.prepare('SELECT * FROM account_privacy WHERE account_id=?').get(accountId);
  return {
    termsVersion: TERMS_VERSION,
    acceptedTermsVersion: row?.terms_version ?? null,
    termsAcceptedAt: row?.terms_accepted_at ?? null,
    marketing: Boolean(row?.marketing),
    aiProcessing: Boolean(row?.ai_processing),
  };
}

const ensureRow = (db, accountId, now) =>
  db.prepare('INSERT OR IGNORE INTO account_privacy(account_id,updated) VALUES(?,?)').run(accountId, now);

export const aiAllowed = (db, accountId) =>
  Boolean(db.prepare('SELECT ai_processing FROM account_privacy WHERE account_id=?').get(accountId)?.ai_processing);

export function exportAccount(db, session, now) {
  const rows = table => db.prepare(`SELECT value FROM ${table} WHERE session_id=?`).all(session.id).map(row => JSON.parse(row.value));
  return {
    exportedAt: new Date(now).toISOString(),
    account: { id: session.account_id, email: session.email, displayName: session.display_name },
    privacy: privacySettings(db, session.account_id),
    learning: rows('trading_learning'),
    dailyResults: rows('trading_daily_results'),
    paperTrades: rows('trading_paper_trades'),
    openPaperPosition: rows('trading_paper_positions'),
    scenarioAssignments: db.prepare('SELECT day,difficulty FROM scenario_assignments WHERE account_id=? ORDER BY day').all(session.account_id),
    scenarioAttempts: exportAttempts(db, session.account_id),
    dailyCoach: exportCoach(db, session.account_id),
    journalEntries: exportJournal(db, session.account_id),
    playbook: exportPlaybook(db, session.account_id),
    noTradeReflections: exportNoTrade(db, session.account_id),
    problemReports: myReports(db, session.account_id),
    analytics: exportAnalytics(db, session.account_id),
    activityHistory: exportActivity(db, session.account_id),
    note: 'Passwords, session tokens and security logs are not included.',
  };
}

// Returns true when the route was handled. Account-only; no paid plan is involved.
export async function handlePrivacy({ db, route, req, session, send, fail, requestBody, clock }) {
  if (!route.startsWith('/privacy')) return false;
  if (!session.account_id) fail(401, 'Sign in to manage account privacy. Guest data stays in this browser or device session.');
  const accountId = session.account_id;
  if (route === '/privacy' && req.method === 'GET') return send(privacySettings(db, accountId));
  if (route === '/privacy/export' && req.method === 'GET') return send(exportAccount(db, session, clock()));
  if (req.method !== 'POST') return send({ error: 'Privacy endpoint not found.' }, 404);
  const body = await requestBody(req);
  if (route === '/privacy/terms') {
    if (body.version !== TERMS_VERSION) fail(400, 'These are not the current terms. Reload and read the latest version.');
    ensureRow(db, accountId, clock());
    db.prepare('UPDATE account_privacy SET terms_version=?,terms_accepted_at=?,updated=? WHERE account_id=?').run(TERMS_VERSION, clock(), clock(), accountId);
    return send(privacySettings(db, accountId));
  }
  if (route === '/privacy/choices') {
    for (const key of ['marketing', 'aiProcessing']) if (key in body && typeof body[key] !== 'boolean') fail(400, 'Choices must be true or false.');
    ensureRow(db, accountId, clock());
    if ('marketing' in body) db.prepare('UPDATE account_privacy SET marketing=?,updated=? WHERE account_id=?').run(body.marketing ? 1 : 0, clock(), accountId);
    if ('aiProcessing' in body) db.prepare('UPDATE account_privacy SET ai_processing=?,updated=? WHERE account_id=?').run(body.aiProcessing ? 1 : 0, clock(), accountId);
    return send(privacySettings(db, accountId));
  }
  if (route === '/privacy/delete') {
    if (body.confirm !== 'DELETE') fail(400, 'Send a confirm field set to DELETE to delete your account and its data.');
    requestDeletion(db, accountId, clock());
    return send({ deleted: true, message: `Your account and learning data were deleted and every session was signed out. Backups expire within ${retention.backupDays} days.` });
  }
  return send({ error: 'Privacy endpoint not found.' }, 404);
}

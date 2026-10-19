// Versioned, forward-only schema migrations. Applied versions are recorded in
// schema_migrations, so opening a database twice never repeats a step.
// Never edit a shipped migration; add a new one at the end of the list.
import { privacyMigration } from './privacy.mjs';
import { allocationMigration } from './scenario-allocation.mjs';
import { attemptMigration } from './scenario-attempt.mjs';
import { coachMigration } from './daily-coach.mjs';
import { journalMigration } from './journal.mjs';
import { playbookMigration } from './playbook.mjs';
import { noTradeMigration } from './no-trade.mjs';
import { adminMigration } from './admin.mjs';
import { streakMigration } from './streak.mjs';
import { analyticsMigration } from './analytics.mjs';
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);

export const migrations = [
  {
    version: 1, name: 'baseline tables',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trading_sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS trading_learning (session_id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trading_challenges (day TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trading_daily_results (session_id TEXT NOT NULL, day TEXT NOT NULL, trade_id TEXT UNIQUE NOT NULL, value TEXT NOT NULL, PRIMARY KEY(session_id, day));
      CREATE TABLE IF NOT EXISTS trading_paper_positions (session_id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trading_paper_trades (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS trading_paper_by_session ON trading_paper_trades(session_id);
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL,
        password_hash TEXT NOT NULL, session_id TEXT UNIQUE NOT NULL, created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_logins (
        token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS account_login_expiry ON account_logins(expires);
      CREATE INDEX IF NOT EXISTS account_login_owner ON account_logins(account_id);
      CREATE TABLE IF NOT EXISTS account_google_identities (
        google_sub TEXT PRIMARY KEY, account_id TEXT UNIQUE NOT NULL
      );
    `),
  },
  {
    version: 2, name: 'accounts.password_enabled',
    up: db => {
      if (!columns(db, 'accounts').includes('password_enabled'))
        db.exec('ALTER TABLE accounts ADD COLUMN password_enabled INTEGER NOT NULL DEFAULT 1');
    },
  },
  {
    version: 3, name: 'case-insensitive unique email',
    up: db => {
      // Skipped (not failed) if an old database already holds case-variant duplicates;
      // user data is never rewritten or dropped by a migration.
      const duplicate = db.prepare('SELECT 1 FROM accounts GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1').get();
      if (!duplicate) db.exec('CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_nocase ON accounts(lower(email))');
    },
  },
  {
    version: 4, name: 'private audit log',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, event TEXT NOT NULL,
        account_id TEXT, session_id TEXT, ip_hash TEXT, detail TEXT
      );
      CREATE INDEX IF NOT EXISTS audit_log_by_time ON audit_log(at);
    `),
  },
  { version: 5, name: 'privacy choices and deletion tombstones', up: privacyMigration },
  { version: 6, name: 'daily scenario assignments', up: allocationMigration },
  { version: 7, name: 'daily scenario attempts', up: attemptMigration },
  { version: 8, name: 'daily coach sessions', up: coachMigration },
  { version: 9, name: 'streak activity events', up: streakMigration },
  { version: 10, name: 'structured journal entries', up: journalMigration },
  { version: 11, name: 'personal rules playbook', up: playbookMigration },
  { version: 12, name: 'no-trade reflections', up: noTradeMigration },
  { version: 13, name: 'administration, reports and support access', up: adminMigration },
  { version: 14, name: 'privacy-conscious analytics and operations counters', up: analyticsMigration },
];

export const latestVersion = migrations.at(-1).version;

export function runMigrations(db, list = migrations) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied INTEGER NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
  const applied = [];
  for (const migration of list) {
    if (done.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations(version,name,applied) VALUES(?,?,?)').run(migration.version, migration.name, Date.now());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    applied.push(migration.version);
  }
  return applied;
}

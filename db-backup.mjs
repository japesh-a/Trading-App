// Backup and restore for the SQLite file. Usage:
//   node db-backup.mjs backup [destination]      (safe while the server runs)
//   node db-backup.mjs restore <backup-file>     (stop the server first)
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations.mjs';
import { reapplyDeletions, retention } from './privacy.mjs';
import { setMeta } from './analytics.mjs';

const required = ['accounts', 'trading_sessions', 'trading_learning', 'trading_daily_results', 'trading_paper_trades'];

export function backupDatabase(db, destination, now = Date.now()) {
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) throw Error('Backup destination already exists: ' + destination);
  db.prepare('VACUUM INTO ?').run(destination);
  recordOpsMeta(db, 'last_backup', now);
  return destination;
}

/** Deletes backup files older than the retention window (privacy.mjs retention.backupDays) so deleted data ages out. */
export function pruneBackups(dir, now = Date.now(), days = retention.backupDays) {
  if (!existsSync(dir)) return [];
  const removed = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (/^wicklume-.*\.db$/.test(name) && now - statSync(file).mtimeMs > days * 86400000) { rmSync(file, { force: true }); removed.push(name); }
  }
  return removed;
}

// Lets /admin/ops and alerts know a backup exists. Best effort: an older database may not have the table yet.
function recordOpsMeta(db, key, now) {
  try { setMeta(db, key, now); } catch { /* ops_meta not migrated yet */ }
}

/**
 * Restoration rehearsal: back up, restore into a scratch file and check the copy opens, passes integrity and
 * holds the same accounts. The live database is only read. Records `last_rehearsal` on success.
 */
export function rehearseRestore(db, { now = Date.now(), dir = mkdtempSync(path.join(tmpdir(), 'wicklume-rehearsal-')) } = {}) {
  const backup = path.join(dir, 'rehearsal-backup.db'), target = path.join(dir, 'rehearsal-restored.db');
  try {
    backupDatabase(db, backup, now);
    restoreDatabase(backup, target);
    const copy = new DatabaseSync(target, { readOnly: true });
    try {
      const count = handle => handle.prepare('SELECT COUNT(*) n FROM accounts').get().n;
      const result = { ok: count(copy) === count(db), accounts: count(db), restoredAccounts: count(copy), schemaVersion: copy.prepare('SELECT MAX(version) v FROM schema_migrations').get().v };
      if (!result.ok) throw Error(`Rehearsal mismatch: ${result.accounts} accounts live, ${result.restoredAccounts} restored.`);
      recordOpsMeta(db, 'last_rehearsal', now);
      return result;
    } finally { copy.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Checks a backup file is a healthy Wicklume database before it replaces live data.
export function verifyBackup(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA integrity_check').get();
    if (Object.values(check)[0] !== 'ok') throw Error('Backup failed the integrity check.');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    for (const table of required) if (!tables.has(table)) throw Error('Backup is missing table ' + table);
  } finally { db.close(); }
}

export function restoreDatabase(backupFile, target) {
  verifyBackup(backupFile);
  const staging = target + '.restoring';
  rmSync(staging, { force: true });
  copyFileSync(backupFile, staging);
  const kept = existsSync(target) ? `${target}.before-restore-${Date.now()}` : null;
  if (kept) renameSync(target, kept);
  rmSync(target + '-wal', { force: true });
  rmSync(target + '-shm', { force: true });
  renameSync(staging, target);
  const db = new DatabaseSync(target);
  try { runMigrations(db); reapplyDeletions(db); } finally { db.close(); }
  return { restored: target, previousCopy: kept };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = process.env.WICKLUME_DB || path.join(process.env.WICKLUME_DATA_DIR || path.join(root, 'data'), 'wicklume.db');
  const [command, argument] = process.argv.slice(2);
  if (command === 'backup') {
    const db = new DatabaseSync(dbPath);
    const out = argument || path.join(path.dirname(dbPath), 'backups', `wicklume-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    console.log('Backup written to', backupDatabase(db, out));
  } else if (command === 'rehearse') {
    const db = new DatabaseSync(dbPath);
    runMigrations(db);
    console.log('Restore rehearsal passed:', rehearseRestore(db));
  } else if (command === 'restore' && argument) {
    console.log(restoreDatabase(argument, dbPath));
  } else { console.error('Usage: node db-backup.mjs backup [file] | rehearse | restore <file>'); process.exit(1); }
}

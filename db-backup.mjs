// Backup and restore for the SQLite file. Usage:
//   node db-backup.mjs backup [destination]      (safe while the server runs)
//   node db-backup.mjs restore <backup-file>     (stop the server first)
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations.mjs';

const required = ['accounts', 'trading_sessions', 'trading_learning', 'trading_daily_results', 'trading_paper_trades'];

export function backupDatabase(db, destination) {
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) throw Error('Backup destination already exists: ' + destination);
  db.prepare('VACUUM INTO ?').run(destination);
  return destination;
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
  try { runMigrations(db); } finally { db.close(); }
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
  } else if (command === 'restore' && argument) {
    console.log(restoreDatabase(argument, dbPath));
  } else { console.error('Usage: node db-backup.mjs backup [file] | restore <file>'); process.exit(1); }
}

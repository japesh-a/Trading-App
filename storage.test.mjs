import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrations, latestVersion, runMigrations } from './migrations.mjs';
import { backupDatabase, restoreDatabase, verifyBackup } from './db-backup.mjs';
import { createTradingService } from './trading-service.mjs';

const oldSchema = db => db.exec(`
  CREATE TABLE trading_sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE trading_daily_results (session_id TEXT NOT NULL, day TEXT NOT NULL, trade_id TEXT UNIQUE NOT NULL, value TEXT NOT NULL, PRIMARY KEY(session_id, day));
  CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, session_id TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
  INSERT INTO trading_sessions VALUES('s1','h1','Ada',1);
  INSERT INTO trading_daily_results VALUES('s1','2026-09-25','t1','{"pnl":5}');
  INSERT INTO accounts VALUES('a1','ada@example.com','salt','hash','s1',1);
`);

test('migrations apply once, in order, and are idempotent', () => {
  const db = new DatabaseSync(':memory:');
  assert.deepEqual(runMigrations(db), migrations.map(m => m.version));
  assert.deepEqual(runMigrations(db), []);
  assert.equal(db.prepare('SELECT max(version) v FROM schema_migrations').get().v, latestVersion);
  assert.deepEqual(migrations.map(m => m.version), migrations.map((_, i) => i + 1));
});

test('a database from before migrations upgrades without losing data', () => {
  const db = new DatabaseSync(':memory:');
  oldSchema(db);
  runMigrations(db);
  assert.equal(db.prepare('SELECT display_name FROM trading_sessions WHERE id=?').get('s1').display_name, 'Ada');
  assert.equal(db.prepare('SELECT trade_id FROM trading_daily_results').get().trade_id, 't1');
  const account = db.prepare('SELECT id, password_enabled FROM accounts').get();
  assert.equal(account.id, 'a1');
  assert.equal(account.password_enabled, 1);
});

test('a failing migration rolls back and is retried next start', () => {
  const db = new DatabaseSync(':memory:');
  const bad = [{ version: 1, name: 'bad', up: d => { d.exec('CREATE TABLE half (x)'); throw Error('boom'); } }];
  assert.throws(() => runMigrations(db, bad), /boom/);
  assert.equal(db.prepare("SELECT count(*) c FROM sqlite_master WHERE name='half'").get().c, 0);
  assert.equal(db.prepare('SELECT count(*) c FROM schema_migrations').get().c, 0);
});

test('uniqueness constraints reject duplicate emails, trade ids and daily results', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const account = (id, email) => db.prepare('INSERT INTO accounts(id,email,salt,password_hash,session_id,created) VALUES(?,?,?,?,?,1)').run(id, email, 's', 'h', 'sess-' + id);
  account('a1', 'Ada@Example.com');
  assert.throws(() => account('a2', 'ada@example.com'), /UNIQUE/);
  const result = (session, day, trade) => db.prepare('INSERT INTO trading_daily_results VALUES(?,?,?,?)').run(session, day, trade, '{}');
  result('s1', 'd1', 't1');
  assert.throws(() => result('s1', 'd1', 't2'), /UNIQUE/);
  assert.throws(() => result('s2', 'd1', 't1'), /UNIQUE/);
});

test('the case-insensitive email index is skipped, not fatal, when old duplicates exist', () => {
  const db = new DatabaseSync(':memory:');
  oldSchema(db);
  db.exec("INSERT INTO accounts VALUES('a2','ADA@example.com','s','h','s2',2)");
  runMigrations(db);
  assert.equal(db.prepare('SELECT count(*) c FROM accounts').get().c, 2);
});

test('services open a database through migrations', () => {
  const db = new DatabaseSync(':memory:');
  createTradingService(db, { env: {} });
  assert.equal(db.prepare('SELECT max(version) v FROM schema_migrations').get().v, latestVersion);
});

test('backup then restore returns the same accounts, quiz evidence, trades and streaks', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wicklume-'));
  const live = path.join(dir, 'live.db');
  const db = new DatabaseSync(live);
  runMigrations(db);
  db.exec(`
    INSERT INTO trading_sessions VALUES('s1','h1','Ada',1);
    INSERT INTO trading_learning VALUES('s1','{"completed":[1,2],"days":["2026-09-25"]}');
    INSERT INTO trading_daily_results VALUES('s1','2026-09-25','t1','{"pnl":5}');
    INSERT INTO trading_paper_trades VALUES('p1','s1','{"pnl":2}');
    INSERT INTO accounts(id,email,salt,password_hash,session_id,created) VALUES('a1','ada@example.com','x','y','s1',1);
  `);
  const backup = backupDatabase(db, path.join(dir, 'backups', 'b.db'));
  assert.throws(() => backupDatabase(db, backup), /already exists/);
  verifyBackup(backup);
  db.exec("DELETE FROM trading_learning; DELETE FROM accounts; INSERT INTO trading_sessions VALUES('s2','h2','New',2)");
  db.close();

  const result = restoreDatabase(backup, live);
  assert(existsSync(result.previousCopy));
  const restored = new DatabaseSync(live);
  assert.equal(restored.prepare('SELECT id FROM accounts').get().id, 'a1');
  assert.match(restored.prepare('SELECT value FROM trading_learning').get().value, /completed/);
  assert.equal(restored.prepare('SELECT trade_id FROM trading_daily_results').get().trade_id, 't1');
  assert.equal(restored.prepare('SELECT id FROM trading_paper_trades').get().id, 'p1');
  assert.equal(restored.prepare('SELECT count(*) c FROM trading_sessions').get().c, 1);
  restored.close();
});

test('restore refuses a file that is not a Wicklume database and leaves live data alone', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wicklume-'));
  const live = path.join(dir, 'live.db'), junk = path.join(dir, 'junk.db');
  const db = new DatabaseSync(live); runMigrations(db); db.close();
  const other = new DatabaseSync(junk); other.exec('CREATE TABLE x(a)'); other.close();
  assert.throws(() => restoreDatabase(junk, live), /missing table/);
  const check = new DatabaseSync(live);
  assert.equal(check.prepare("SELECT count(*) c FROM sqlite_master WHERE name='accounts'").get().c, 1);
  check.close();
});

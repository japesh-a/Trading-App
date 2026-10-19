// Personal rules checklist (F27). A learner keeps a short playbook of their own rules. Every save that changes
// the rules creates a new immutable version, and a check (daily decision or paper trade) stores a snapshot of
// the rule text and the learner's answers, so later edits never rewrite history. Rules are plain text: they
// carry no numbers the platform reads, so they cannot loosen the platform risk limits in scenario-attempt.mjs.
// The check records the learner's self-assessment. It does not certify a safe or profitable trade.
import { randomUUID } from 'node:crypto';

export const MAX_RULES = 8;
export const MAX_RULE_TEXT = 120;
export const MAX_NOTE = 200;
export const STATUSES = ['met', 'not_met', 'not_applicable'];
export const PROMPTS_VERSION = 'prompts-1';
// Reviewed educational starters. They are suggestions to adapt, not advice about any market.
export const PROMPTS = [
  { id: 'setup', title: 'Identify the setup', ask: 'Which pattern or situation am I looking at, and can I point to it on the chart?', starter: 'I can name the setup and show it on the chart.' },
  { id: 'invalidation', title: 'Describe invalidation', ask: 'What price action would show my idea is wrong?', starter: 'I know where my idea is proved wrong before I enter.' },
  { id: 'risk', title: 'Check simulated risk', ask: 'How much of the practice account am I risking, and is the stop sized for that?', starter: 'My simulated risk and stop distance are calculated before I commit.' },
  { id: 'why', title: 'Explain why it meets my rules', ask: 'In one sentence, why does this decision follow my own rules (or why is staying out the better choice)?', starter: 'I can explain in one sentence why this follows my rules.' },
];

export const playbookMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS playbook_versions (
    account_id TEXT NOT NULL, version INTEGER NOT NULL, rules TEXT NOT NULL, created INTEGER NOT NULL,
    PRIMARY KEY(account_id, version)
  );
  CREATE TABLE IF NOT EXISTS playbook_checks (
    account_id TEXT NOT NULL, context TEXT NOT NULL, ref TEXT NOT NULL, snapshot TEXT NOT NULL, created INTEGER NOT NULL,
    PRIMARY KEY(account_id, context, ref)
  );
`);

const fail = (status, message) => Object.assign(new Error(message), { status, clientSafe: true });
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const clean = (v, label, max, required) => {
  if (v === undefined || v === null || v === '') { if (required) throw fail(400, `${label} is needed.`); return ''; }
  if (typeof v !== 'string' || CONTROL.test(v) || v.trim().length > max) throw fail(400, `${label} must be text up to ${max} characters.`);
  if (required && !v.trim()) throw fail(400, `${label} is needed.`);
  return v.trim();
};

/** Normalises a rule list. Only `id` and `text` survive, so extra fields such as a risk number are dropped. */
export function cleanRules(rules, existingIds = new Set()) {
  if (!Array.isArray(rules) || rules.length > MAX_RULES) throw fail(400, `Keep your playbook to ${MAX_RULES} rules or fewer.`);
  const seen = new Set();
  return rules.map(r => {
    if (!r || typeof r !== 'object') throw fail(400, 'Each rule needs text.');
    const text = clean(r.text, 'Rule text', MAX_RULE_TEXT, true);
    const id = typeof r.id === 'string' && existingIds.has(r.id) && !seen.has(r.id) ? r.id : 'r_' + randomUUID().replaceAll('-', '').slice(0, 8);
    seen.add(id);
    return { id, text };
  });
}

const versionRow = (db, accountId, version) => db.prepare('SELECT * FROM playbook_versions WHERE account_id=? AND version=?').get(accountId, version);
const view = row => row ? { version: row.version, rules: JSON.parse(row.rules), updated: new Date(row.created).toISOString() } : { version: 0, rules: [], updated: null };

export function currentPlaybook(db, accountId) {
  return view(db.prepare('SELECT * FROM playbook_versions WHERE account_id=? ORDER BY version DESC LIMIT 1').get(accountId));
}

/** Saves the playbook. Unchanged rules keep the current version; any change creates the next version. */
export function savePlaybook(db, accountId, body, now = Date.now()) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = currentPlaybook(db, accountId);
    const rules = cleanRules(body?.rules, new Set(current.rules.map(r => r.id)));
    if (JSON.stringify(rules.map(r => [r.id, r.text])) === JSON.stringify(current.rules.map(r => [r.id, r.text]))) { db.exec('COMMIT'); return current; }
    const version = current.version + 1;
    db.prepare('INSERT INTO playbook_versions VALUES(?,?,?,?)').run(accountId, version, JSON.stringify(rules), now);
    db.exec('COMMIT');
    return view(versionRow(db, accountId, version));
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw error; }
}

/**
 * Builds the snapshot stored with a decision. Rule text comes from the saved version on the server, never
 * from the request, and every rule in that version needs an answer. "Not met" needs a short explanation.
 */
export function buildCheck(db, accountId, input) {
  if (!input || typeof input !== 'object') throw fail(400, 'Send your checklist answers.');
  const stored = Number.isInteger(input.version) ? versionRow(db, accountId, input.version) : null;
  if (!stored) throw fail(400, 'Save your playbook before checking it, then send its version.');
  const rules = JSON.parse(stored.rules);
  if (!Array.isArray(input.responses)) throw fail(400, 'Answer each rule.');
  const byId = new Map(input.responses.map(r => [r?.ruleId, r]));
  const responses = rules.map(rule => {
    const r = byId.get(rule.id);
    if (!r || !STATUSES.includes(r.status)) throw fail(400, `Choose met, not met or not applicable for "${rule.text}".`);
    const note = clean(r.note, 'Explanation', MAX_NOTE, r.status === 'not_met');
    return { ruleId: rule.id, text: rule.text, status: r.status, note };
  });
  return { version: stored.version, promptsVersion: PROMPTS_VERSION, responses, selfAssessed: true };
}

export function summariseCheck(check) {
  const count = s => check.responses.filter(r => r.status === s).length;
  return { version: check.version, met: count('met'), notMet: count('not_met'), notApplicable: count('not_applicable'), total: check.responses.length };
}

/** Stores a check for a paper trade. One per ref: repeats return the saved check, so history is not rewritten. */
export function recordCheck(db, accountId, { context, ref, check }, now = Date.now()) {
  if (context !== 'paper') throw fail(400, 'Unknown checklist context.');
  const key = clean(ref, 'Reference', 80, true);
  const info = db.prepare('INSERT OR IGNORE INTO playbook_checks VALUES(?,?,?,?,?)').run(accountId, context, key, JSON.stringify(check), now);
  const row = db.prepare('SELECT snapshot FROM playbook_checks WHERE account_id=? AND context=? AND ref=?').get(accountId, context, key);
  return { check: JSON.parse(row.snapshot), created: info.changes === 1 };
}

export const findCheck = (db, accountId, context, ref) => {
  const row = db.prepare('SELECT snapshot FROM playbook_checks WHERE account_id=? AND context=? AND ref=?').get(accountId, context, String(ref));
  return row ? JSON.parse(row.snapshot) : null;
};

export function exportPlaybook(db, accountId) {
  return {
    versions: db.prepare('SELECT version,rules,created FROM playbook_versions WHERE account_id=? ORDER BY version').all(accountId)
      .map(r => ({ version: r.version, rules: JSON.parse(r.rules), saved: new Date(r.created).toISOString() })),
    paperChecks: db.prepare('SELECT ref,snapshot FROM playbook_checks WHERE account_id=? ORDER BY created').all(accountId).map(r => ({ tradeId: r.ref, check: JSON.parse(r.snapshot) })),
  };
}

export function erasePlaybook(db, accountId) {
  db.prepare('DELETE FROM playbook_versions WHERE account_id=?').run(accountId);
  db.prepare('DELETE FROM playbook_checks WHERE account_id=?').run(accountId);
}

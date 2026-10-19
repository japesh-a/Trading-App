// Structured journal (F18). Each entry splits into immutable `facts` (execution facts copied from the
// server's own paper-trade record, or the plan as first written) and editable `notes` (plan, tags, emotion,
// reflection, drawings, snapshot). Edits carry the revision they were based on, so a stale device gets a
// 409 with the current entry instead of silently overwriting a newer edit. Provenance (verified, imported,
// synthetic, self_reported) is set by the server and cannot be edited. Entries are private to the account.
import { randomUUID } from 'node:crypto';
import { tradesCsv } from './public/journal-utils.js';

export const KINDS = ['paper', 'no_trade', 'manual'];
export const PROVENANCE = ['verified', 'imported', 'synthetic', 'self_reported'];
export const EMOTIONS = ['calm', 'confident', 'anxious', 'frustrated', 'excited', 'tired', 'bored'];
export const MAX_SNAPSHOT = 200000;
export const MAX_DRAWINGS = 50000;
const MAX_ENTRIES = 2000;
const MAX_TAGS = 10;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

export const journalMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    account_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, provenance TEXT NOT NULL,
    facts TEXT NOT NULL, notes TEXT NOT NULL, drawings TEXT NOT NULL DEFAULT '[]', snapshot TEXT,
    revision INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    PRIMARY KEY(account_id, id)
  );
`);

const fail = (status, message) => Object.assign(new Error(message), { status, clientSafe: true });
const text = (v, label, max) => {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || CONTROL.test(v) || v.length > max) throw fail(400, `${label} must be text up to ${max} characters.`);
  return v.trim();
};
const num = (v, label, { min = 0, max = 1e9 } = {}) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw fail(400, `${label} must be a number.`);
  return v;
};

/** Validates the editable fields. Only fields present in `input` are returned, so partial edits work. */
export function cleanNotes(input = {}) {
  const out = {};
  const has = key => Object.hasOwn(input, key);
  if (has('plan')) out.plan = text(input.plan, 'Plan', 4000);
  if (has('setup')) out.setup = text(input.setup, 'Setup tag', 60).toLowerCase();
  if (has('tags')) {
    if (!Array.isArray(input.tags) || input.tags.length > MAX_TAGS) throw fail(400, `Use up to ${MAX_TAGS} tags.`);
    out.tags = [...new Set(input.tags.map(t => text(t, 'Tag', 40).toLowerCase()).filter(Boolean))];
  }
  if (has('emotion')) {
    if (input.emotion !== null && input.emotion !== '' && !EMOTIONS.includes(input.emotion)) throw fail(400, 'Choose an emotion from the list, or leave it blank.');
    out.emotion = input.emotion || null;
  }
  if (has('selfAssessment')) out.selfAssessment = num(input.selfAssessment, 'Self-assessment', { min: 1, max: 5 });
  if (has('riskPercent')) out.riskPercent = num(input.riskPercent, 'Risk %', { min: 0, max: 100 });
  if (has('outcome')) out.outcome = text(input.outcome, 'Outcome', 1000);
  if (has('reflection')) out.reflection = text(input.reflection, 'Reflection', 4000);
  return out;
}

const DEFAULT_NOTES = { plan: '', setup: '', tags: [], emotion: null, selfAssessment: null, riskPercent: null, outcome: '', reflection: '' };

const view = row => row && ({
  id: row.id, kind: row.kind, provenance: row.provenance, facts: JSON.parse(row.facts), notes: { ...DEFAULT_NOTES, ...JSON.parse(row.notes) },
  drawings: JSON.parse(row.drawings), snapshot: row.snapshot ?? null, revision: row.revision,
  created: new Date(row.created).toISOString(), updated: new Date(row.updated).toISOString(),
});
const get = (db, accountId, id) => view(db.prepare('SELECT * FROM journal_entries WHERE account_id=? AND id=?').get(accountId, id));

function provenanceOf(trade) {
  if (trade.demo || trade.source === 'synthetic') return 'synthetic';
  return trade.serverVerified ? 'verified' : 'self_reported';
}

function cleanDrawings(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw fail(400, 'Drawings must be a list.');
  const json = JSON.stringify(value);
  if (json.length > MAX_DRAWINGS) throw fail(400, 'Drawings must be under 50 KB.');
  return json;
}
function cleanSnapshot(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || value.length > MAX_SNAPSHOT || !/^<svg[\s>]/.test(value) || /<script|\son\w+\s*=|javascript:/i.test(value)) throw fail(400, 'Snapshots must be a small SVG image.');
  return value;
}

/**
 * Creates an entry. Paper entries copy their facts from a trade the server itself recorded
 * (`paperTrade`), never from the request. No-trade and manual entries store what the learner wrote.
 */
export function createEntry(db, accountId, body, { paperTrade = null, now = Date.now() } = {}) {
  if (!KINDS.includes(body.kind)) throw fail(400, 'Choose paper, no_trade or manual.');
  if (db.prepare('SELECT COUNT(*) n FROM journal_entries WHERE account_id=?').get(accountId).n >= MAX_ENTRIES) throw fail(409, 'The journal is full. Delete old entries first.');
  const notes = { ...DEFAULT_NOTES, ...cleanNotes(body.notes) };
  let facts, provenance;
  if (body.kind === 'paper') {
    if (!paperTrade) throw fail(404, 'No closed paper trade with that id.');
    const t = paperTrade;
    facts = { tradeId: t.id, mode: t.mode, instrument: t.instrument?.id ?? null, side: t.side, entryTime: t.entryTime, entry: t.entry, stopLoss: t.stopLoss, takeProfit: t.takeProfit, quantity: t.quantity, exitTime: t.exitTime, exitPrice: t.exitPrice, exitReason: t.exitReason, pnl: t.pnl, plannedRR: t.plannedRR, realizedR: t.realizedR, reasoning: t.reasoning ?? '' };
    provenance = provenanceOf(t);
  } else {
    const f = body.facts ?? {};
    facts = { recordedAt: now, instrument: text(f.instrument, 'Market', 40) || null, decision: body.kind === 'no_trade' ? 'none' : text(f.decision, 'Decision', 20) || null };
    if (body.kind === 'manual') {
      for (const key of ['entry', 'stopLoss', 'takeProfit', 'exitPrice', 'pnl']) facts[key] = num(f[key], key, { min: -1e9 });
      if (f.side !== undefined && f.side !== null && !['buy', 'sell'].includes(f.side)) throw fail(400, 'Side must be buy or sell.');
      facts.side = f.side ?? null;
    }
    provenance = body.source === 'import' ? 'imported' : 'self_reported';
  }
  const id = 'je_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const drawings = cleanDrawings(body.drawings) ?? '[]', snapshot = cleanSnapshot(body.snapshot) ?? null;
  db.prepare('INSERT INTO journal_entries(account_id,id,kind,provenance,facts,notes,drawings,snapshot,revision,created,updated) VALUES(?,?,?,?,?,?,?,?,1,?,?)')
    .run(accountId, id, body.kind, provenance, JSON.stringify(facts), JSON.stringify(notes), drawings, snapshot, now, now);
  return get(db, accountId, id);
}

/**
 * Edits notes, drawings or the snapshot. `baseRevision` must match the stored revision, otherwise the
 * caller receives a conflict carrying the current entry and the fields that differ from what they sent.
 * Facts and provenance in the request are refused rather than ignored.
 */
export function updateEntry(db, accountId, body, now = Date.now()) {
  if (typeof body.id !== 'string') throw fail(400, 'Missing entry id.');
  if (Object.hasOwn(body, 'facts') || Object.hasOwn(body, 'provenance') || Object.hasOwn(body, 'kind')) throw fail(400, 'Execution facts, kind and provenance cannot be edited.');
  if (!Number.isInteger(body.baseRevision)) throw fail(400, 'Send the revision you edited from (baseRevision).');
  const notes = cleanNotes(body.notes), drawings = cleanDrawings(body.drawings), snapshot = cleanSnapshot(body.snapshot);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT * FROM journal_entries WHERE account_id=? AND id=?').get(accountId, body.id);
    if (!row) throw fail(404, 'No journal entry with that id.');
    if (row.revision !== body.baseRevision) {
      const current = view(row);
      const differing = Object.keys(notes).filter(k => JSON.stringify(notes[k]) !== JSON.stringify(current.notes[k]));
      if (drawings !== undefined && drawings !== row.drawings) differing.push('drawings');
      if (snapshot !== undefined && snapshot !== row.snapshot) differing.push('snapshot');
      db.exec('ROLLBACK');
      return { conflict: true, current, differing };
    }
    db.prepare('UPDATE journal_entries SET notes=?, drawings=?, snapshot=?, revision=revision+1, updated=? WHERE account_id=? AND id=?')
      .run(JSON.stringify({ ...JSON.parse(row.notes), ...notes }), drawings ?? row.drawings, snapshot === undefined ? row.snapshot : snapshot, now, accountId, body.id);
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw error; }
  return { conflict: false, entry: get(db, accountId, body.id) };
}

export const deleteEntry = (db, accountId, id) =>
  typeof id === 'string' && db.prepare('DELETE FROM journal_entries WHERE account_id=? AND id=?').run(accountId, id).changes === 1;

export const eraseJournal = (db, accountId) => db.prepare('DELETE FROM journal_entries WHERE account_id=?').run(accountId);

/** Entries, newest first. `since` (ms) supports cheap sync; list views flag snapshots instead of sending them. */
export function listEntries(db, accountId, { since = 0, snapshots = false } = {}) {
  return db.prepare('SELECT * FROM journal_entries WHERE account_id=? AND updated>? ORDER BY created DESC, id').all(accountId, since)
    .map(view).map(entry => snapshots ? entry : { ...entry, snapshot: entry.snapshot ? true : null });
}

/** Structured export for the data download: facts, notes, tags and drawings, with a flag instead of the image. */
export const exportJournal = (db, accountId) =>
  listEntries(db, accountId).map(({ snapshot, ...entry }) => ({ ...entry, hasSnapshot: Boolean(snapshot) }));

const CSV_FIELDS = {
  id: e => e.id, mode: e => e.kind, instrument: e => ({ id: e.facts.instrument }), side: e => e.facts.side, entry: e => e.facts.entry,
  stopLoss: e => e.facts.stopLoss, takeProfit: e => e.facts.takeProfit, exitPrice: e => e.facts.exitPrice, pnl: e => e.facts.pnl,
  plannedRR: e => e.facts.plannedRR, realizedR: e => e.facts.realizedR, reasoning: e => e.notes.plan || e.facts.reasoning,
  notes: e => [e.notes.setup, e.notes.reflection].filter(Boolean).join(' | '),
};

/** CSV through the shared exporter, so text beginning with = + - @ stays neutralised. Provenance is the last column. */
export function journalCsv(db, accountId) {
  const entries = listEntries(db, accountId);
  const rows = entries.map(e => Object.fromEntries(Object.entries(CSV_FIELDS).map(([k, fn]) => [k, fn(e)])));
  const lines = tradesCsv(rows).split('\r\n');
  return [lines[0] + ',provenance', ...lines.slice(1).map((line, i) => `${line},"${entries[i].provenance}"`)].join('\r\n');
}

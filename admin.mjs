// Protected administration (F23): small staff controls over reviewed content files, not a CMS.
// - Staff authenticate with tokens from WICKLUME_ADMIN_TOKENS ("name:role:token,..."), separate from learner
//   sessions. Roles: `content` (scenarios, questions) and `support` (journal access under a learner grant).
//   Both roles can read aggregate failures and handle user reports. No tokens configured = admin is off.
// - Published scenario versions are pinned by content hash. A pinned version whose content later changes is
//   withdrawn from use rather than silently altering completed results; publish a new version instead.
// - Every staff mutation and every support access is appended to admin_actions / support_access_log.
// - Staff can read a learner's journal only while that learner holds an unexpired, unrevoked support grant.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import questionBank from './question-bank.json' with { type: 'json' };
import { approvalProblems, contentHash, recordReview, validateScenario } from './scenario-bank.mjs';
import { listEntries } from './journal.mjs';

export const ROLES = ['content', 'support'];
export const REPORT_KINDS = ['scenario_problem', 'lesson_problem', 'bug', 'other'];
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];
export const GRANT_HOURS = 24;
export const GRANT_MAX_READS = 5;
const REPORT_LIMIT = 500;
const sha = value => createHash('sha256').update(String(value)).digest('hex');

export const adminMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS scenario_reviews (
    scenario_id TEXT NOT NULL, version INTEGER NOT NULL, decision TEXT NOT NULL, reviewer TEXT NOT NULL,
    reviewed_at TEXT NOT NULL, content_hash TEXT NOT NULL, PRIMARY KEY(scenario_id, version)
  );
  CREATE TABLE IF NOT EXISTS scenario_publications (
    scenario_id TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, published_at INTEGER NOT NULL,
    published_by TEXT NOT NULL, PRIMARY KEY(scenario_id, version)
  );
  CREATE TABLE IF NOT EXISTS scenario_retirements (
    scenario_id TEXT NOT NULL, version INTEGER NOT NULL, retired_at INTEGER NOT NULL, retired_by TEXT NOT NULL,
    reason TEXT NOT NULL, PRIMARY KEY(scenario_id, version)
  );
  CREATE TABLE IF NOT EXISTS question_versions (
    question_key TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, recorded_at INTEGER NOT NULL,
    recorded_by TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', PRIMARY KEY(question_key, version)
  );
  CREATE TABLE IF NOT EXISTS user_reports (
    id TEXT PRIMARY KEY, account_id TEXT, kind TEXT NOT NULL, scenario_id TEXT, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL, handled_at INTEGER, handled_by TEXT, note TEXT
  );
  CREATE INDEX IF NOT EXISTS user_reports_by_account ON user_reports(account_id);
  CREATE TABLE IF NOT EXISTS support_grants (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code_hash TEXT UNIQUE NOT NULL, created INTEGER NOT NULL,
    expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, reads INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS support_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, grant_id TEXT NOT NULL, account_id TEXT NOT NULL, at INTEGER NOT NULL,
    staff TEXT NOT NULL, reason TEXT NOT NULL, entries INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, staff TEXT NOT NULL, role TEXT NOT NULL,
    action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT ''
  );
`);

export const eraseAdminData = (db, accountId) => {
  db.prepare('DELETE FROM user_reports WHERE account_id=?').run(accountId);
  db.prepare('DELETE FROM support_access_log WHERE account_id=?').run(accountId);
  db.prepare('DELETE FROM support_grants WHERE account_id=?').run(accountId);
};

/** "alice:content:token,bob:support:token". Weak tokens and unknown roles are ignored, so a typo fails closed. */
export function parseStaff(value = '') {
  const staff = [];
  for (const part of String(value).split(',')) {
    const [name, role, token] = part.trim().split(':');
    if (name && /^[A-Za-z0-9._-]{2,30}$/.test(name) && ROLES.includes(role) && token && token.length >= 24) staff.push({ name, role, tokenHash: sha(token) });
  }
  return staff;
}

export function staffFor(req, staff) {
  const match = /^Admin (\S{24,200})$/.exec(String(req.headers.authorization || ''));
  if (!match) return null;
  const given = Buffer.from(sha(match[1]), 'hex');
  let found = null;
  for (const member of staff) if (timingSafeEqual(given, Buffer.from(member.tokenHash, 'hex'))) found = member;
  return found;
}

export const recordAction = (db, clock, staff, action, target = '', detail = '') =>
  db.prepare('INSERT INTO admin_actions(at,staff,role,action,target,detail) VALUES(?,?,?,?,?,?)').run(clock(), staff.name, staff.role, action, String(target).slice(0, 120), String(detail).slice(0, 300));

const dbReviews = db => Object.fromEntries(db.prepare('SELECT * FROM scenario_reviews').all().map(r => [`${r.scenario_id}@${r.version}`,
  { reviewer: r.reviewer, decision: r.decision, reviewedAt: r.reviewed_at, contentHash: r.content_hash }]));
const key = s => `${s.id}@${s.version}`;

/**
 * Scenario availability with admin state applied.
 * pool:   what new assignments may use (approved, published or file-approved, not retired, content matches its pin).
 * lookup: pool plus retired versions, so replays of completed attempts keep working; still requires an intact pin.
 */
export function scenarioSources(db, clock, loader) {
  const state = async () => {
    const { scenarios, reviews: fileReviews } = await loader();
    const merged = { ...dbReviews(db), ...fileReviews };
    const pins = new Map(db.prepare('SELECT * FROM scenario_publications').all().map(r => [`${r.scenario_id}@${r.version}`, r]));
    const retired = new Set(db.prepare('SELECT scenario_id, version FROM scenario_retirements').all().map(r => `${r.scenario_id}@${r.version}`));
    return { scenarios, fileReviews, merged, pins, retired };
  };
  const classify = (s, { fileReviews, merged, pins, retired }) => {
    const pin = pins.get(key(s));
    if (pin && pin.content_hash !== contentHash(s)) return { status: 'changed-after-publication', problems: ['content changed after publication; publish a new version'] };
    const problems = validateScenario(s);
    if (problems.length) return { status: 'invalid', problems };
    if (retired.has(key(s)) || s.status === 'retired') return { status: 'retired', problems: [], pinned: Boolean(pin) };
    const approval = approvalProblems(s, merged);
    if (approval.length) return { status: merged[key(s)] ? 'needs-review' : 'draft', problems: approval };
    const fileApproved = approvalProblems(s, fileReviews).length === 0;
    if (!pin && !fileApproved) return { status: 'approved', problems: [] };
    return { status: 'published', problems: [], pinned: Boolean(pin) };
  };
  const pool = async () => {
    const st = await state(), live = [];
    for (const s of st.scenarios) {
      if (classify(s, st).status !== 'published') continue;
      if (!st.pins.has(key(s))) db.prepare('INSERT OR IGNORE INTO scenario_publications VALUES(?,?,?,?,?)').run(s.id, s.version, contentHash(s), clock(), 'content-file');
      live.push(s);
    }
    return live;
  };
  const lookup = async () => {
    const st = await state();
    return st.scenarios.filter(s => {
      const c = classify(s, st);
      return c.status === 'published' || (c.status === 'retired' && c.pinned);
    });
  };
  return { pool, lookup, state, classify };
}

const questionRows = (bank = questionBank) => bank.flatMap((lesson, l) => lesson.map((q, i) =>
  ({ key: `L${l + 1}Q${i + 1}`, lesson: l + 1, question: q[0], hash: sha(JSON.stringify(q)) })));

function listQuestions(db, bank) {
  return questionRows(bank).map(q => {
    const rec = db.prepare('SELECT version, content_hash FROM question_versions WHERE question_key=? ORDER BY version DESC LIMIT 1').get(q.key);
    return { key: q.key, lesson: q.lesson, question: q.question, version: rec?.version ?? 0, changedSinceRecorded: !rec || rec.content_hash !== q.hash };
  });
}

export function recordQuestionVersions(db, staff, clock, note = '', bank) {
  const changed = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const q of questionRows(bank)) {
      const last = db.prepare('SELECT version, content_hash FROM question_versions WHERE question_key=? ORDER BY version DESC LIMIT 1').get(q.key);
      if (last?.content_hash === q.hash) continue;
      const version = (last?.version ?? 0) + 1;
      db.prepare('INSERT INTO question_versions VALUES(?,?,?,?,?,?)').run(q.key, version, q.hash, clock(), staff.name, note);
      changed.push({ key: q.key, version });
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return changed;
}

/** Aggregate-only: counts by route/status and per-scenario attempts. No account, session, email or journal text. */
export function aggregateFailures(db, now, days = 7) {
  const since = now - days * 86400000;
  const errors = db.prepare(`SELECT event, detail status, COUNT(*) count FROM audit_log
    WHERE at>=? AND CAST(detail AS INTEGER)>=400 GROUP BY event, detail ORDER BY count DESC, event LIMIT 50`).all(since);
  const reports = db.prepare('SELECT kind, status, COUNT(*) count FROM user_reports GROUP BY kind, status ORDER BY kind, status').all();
  const attempts = db.prepare('SELECT scenario_id, scenario_version version, COUNT(*) attempts FROM scenario_attempts GROUP BY scenario_id, scenario_version ORDER BY scenario_id, version').all();
  return { days, errors, reports, attempts };
}

const attemptCounts = db => new Map(db.prepare('SELECT scenario_id, scenario_version v, COUNT(*) n FROM scenario_attempts GROUP BY scenario_id, scenario_version').all().map(r => [`${r.scenario_id}@${r.v}`, r.n]));

// ---- learner-facing parts (mounted after sign-in) ----

export function fileReport(db, session, body, clock, fail) {
  if (!REPORT_KINDS.includes(body.kind)) fail(400, 'Choose what kind of problem this is.');
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 10 || message.length > REPORT_LIMIT || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(message)) fail(400, `Describe the problem in 10 to ${REPORT_LIMIT} characters.`);
  const scenarioId = typeof body.scenarioId === 'string' && /^[a-z0-9][a-z0-9-]{2,60}$/.test(body.scenarioId) ? body.scenarioId : null;
  if (session.account_id && db.prepare("SELECT COUNT(*) n FROM user_reports WHERE account_id=? AND status='open'").get(session.account_id).n >= 20)
    fail(429, 'You have several open reports already. Please wait for a reply.');
  const id = randomUUID();
  db.prepare('INSERT INTO user_reports(id,account_id,kind,scenario_id,message,created) VALUES(?,?,?,?,?,?)').run(id, session.account_id ?? null, body.kind, scenarioId, message, clock());
  return { id, status: 'open' };
}

export const myReports = (db, accountId) =>
  db.prepare('SELECT id, kind, scenario_id scenarioId, message, status, created, note FROM user_reports WHERE account_id=? ORDER BY created DESC LIMIT 50').all(accountId);

export function supportAccessView(db, accountId, now) {
  return {
    grants: db.prepare('SELECT id, created, expires, revoked, reads FROM support_grants WHERE account_id=? ORDER BY created DESC LIMIT 10').all(accountId)
      .map(g => ({ ...g, revoked: Boolean(g.revoked), active: !g.revoked && g.expires > now && g.reads < GRANT_MAX_READS })),
    accessLog: db.prepare('SELECT at, staff, reason, entries FROM support_access_log WHERE account_id=? ORDER BY at DESC LIMIT 50').all(accountId),
    scope: `Support staff with the code you share can read your journal text (not chart images) up to ${GRANT_MAX_READS} times in ${GRANT_HOURS} hours. Every read is listed here.`,
  };
}

export function createGrant(db, accountId, clock) {
  db.prepare('UPDATE support_grants SET revoked=1 WHERE account_id=? AND revoked=0').run(accountId);
  const code = 'WS-' + randomBytes(5).toString('hex').toUpperCase();
  const expires = clock() + GRANT_HOURS * 3600000;
  db.prepare('INSERT INTO support_grants(id,account_id,code_hash,created,expires) VALUES(?,?,?,?,?)').run(randomUUID(), accountId, sha(code), clock(), expires);
  return { code, expires, scope: supportAccessView(db, accountId, clock()).scope };
}

export const revokeGrants = (db, accountId) => db.prepare('UPDATE support_grants SET revoked=1 WHERE account_id=? AND revoked=0').run(accountId).changes;

// ---- staff routes ----

export async function handleAdmin({ db, route, req, send, fail, requestBody, clock, env, ip, rateLimit, sources, questions }) {
  if (!route.startsWith('/admin')) return false;
  const staffList = parseStaff(env.WICKLUME_ADMIN_TOKENS);
  rateLimit(`admin:${ip}`, 60);
  if (!staffList.length) fail(403, 'Administration is not enabled on this server.');
  const staff = staffFor(req, staffList);
  if (!staff) { rateLimit(`admin-bad:${ip}`, 10); fail(401, 'Staff credentials required.'); }
  const need = role => { if (staff.role !== role) fail(403, `This action needs the ${role} role.`); };
  const act = (action, target, detail) => recordAction(db, clock, staff, action, target, detail);
  const query = new URL(req.url, 'http://x').searchParams;
  const find = async body => {
    const st = await sources.state();
    const s = st.scenarios.find(x => x.id === body.id && x.version === body.version);
    if (!s) fail(404, 'No such scenario version.');
    return { s, st };
  };

  if (route === '/admin/me' && req.method === 'GET') return send({ name: staff.name, role: staff.role });

  if (route === '/admin/scenarios' && req.method === 'GET') {
    need('content');
    const st = await sources.state(), counts = attemptCounts(db);
    return send({ scenarios: st.scenarios.map(s => {
      const c = sources.classify(s, st), review = st.merged[key(s)];
      return { id: s.id, version: s.version, family: s.family, difficulty: s.difficulty, author: s.provenance?.author, status: c.status, problems: c.problems, attempts: counts.get(key(s)) ?? 0,
        review: review ? { reviewer: review.reviewer, decision: review.decision, reviewedAt: review.reviewedAt } : null };
    }) });
  }
  if (route === '/admin/scenarios/review' && req.method === 'POST') {
    need('content');
    const body = await requestBody(req), { s, st } = await find(body);
    if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'Decision must be approved or rejected.');
    if (st.pins.has(key(s))) fail(409, 'This version is published and fixed. Create a new version to change it.');
    if (body.decision === 'approved') {
      const problems = validateScenario(s);
      if (problems.length) fail(400, 'Fix these before approval: ' + problems.join('; '));
      if (staff.name === s.provenance.author) fail(409, 'A reviewer cannot approve their own scenario.');
    }
    const r = recordReview(s, staff.name, body.decision, new Date(clock()));
    db.prepare('INSERT OR REPLACE INTO scenario_reviews VALUES(?,?,?,?,?,?)').run(s.id, s.version, r.decision, r.reviewer, r.reviewedAt, r.contentHash);
    act('scenario.review', key(s), body.decision);
    return send({ id: s.id, version: s.version, decision: r.decision });
  }
  if (route === '/admin/scenarios/publish' && req.method === 'POST') {
    need('content');
    const { s, st } = await find(await requestBody(req));
    if (st.pins.has(key(s))) fail(409, 'This version is already published.');
    if (st.retired.has(key(s))) fail(409, 'Retired versions cannot be republished. Create a new version.');
    const problems = [...validateScenario(s), ...approvalProblems(s, st.merged)];
    if (problems.length) fail(409, 'Not ready to publish: ' + problems.join('; '));
    db.prepare('INSERT INTO scenario_publications VALUES(?,?,?,?,?)').run(s.id, s.version, contentHash(s), clock(), staff.name);
    act('scenario.publish', key(s), contentHash(s).slice(0, 12));
    return send({ id: s.id, version: s.version, published: true }, 201);
  }
  if (route === '/admin/scenarios/retire' && req.method === 'POST') {
    need('content');
    const body = await requestBody(req), { s } = await find(body);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (reason.length < 5) fail(400, 'Give a reason of at least 5 characters.');
    db.prepare('INSERT OR IGNORE INTO scenario_retirements VALUES(?,?,?,?,?)').run(s.id, s.version, clock(), staff.name, reason);
    act('scenario.retire', key(s), reason);
    return send({ id: s.id, version: s.version, retired: true });
  }
  if (route === '/admin/questions' && req.method === 'GET') { need('content'); return send({ questions: listQuestions(db, questions) }); }
  if (route === '/admin/questions/record' && req.method === 'POST') {
    need('content');
    const body = await requestBody(req), note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
    const changed = recordQuestionVersions(db, staff, clock, note, questions);
    act('questions.record', String(changed.length), note);
    return send({ changed });
  }
  if (route === '/admin/failures' && req.method === 'GET')
    return send(aggregateFailures(db, clock(), Math.min(90, Math.max(1, Number(query.get('days')) || 7))));
  if (route === '/admin/reports' && req.method === 'GET') {
    const status = REPORT_STATUSES.includes(query.get('status')) ? query.get('status') : null;
    // Reporter is shown as a short opaque reference, never an email or name.
    const rows = db.prepare(`SELECT id, kind, scenario_id scenarioId, message, status, created, handled_by handledBy, note,
      CASE WHEN account_id IS NULL THEN 'guest' ELSE substr(account_id,1,8) END reporter
      FROM user_reports WHERE (? IS NULL OR status=?) ORDER BY created DESC LIMIT 100`).all(status, status);
    return send({ reports: rows });
  }
  if (route === '/admin/reports/handle' && req.method === 'POST') {
    const body = await requestBody(req);
    if (!['resolved', 'dismissed'].includes(body.status)) fail(400, 'Status must be resolved or dismissed.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    const done = db.prepare("UPDATE user_reports SET status=?, note=?, handled_at=?, handled_by=? WHERE id=? AND status='open'").run(body.status, note, clock(), staff.name, String(body.id));
    if (!done.changes) fail(404, 'No open report with that id.');
    act('report.handle', String(body.id), body.status);
    return send({ id: body.id, status: body.status });
  }
  if (route === '/admin/support/journal' && req.method === 'POST') {
    need('support');
    const body = await requestBody(req);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (reason.length < 10) fail(400, 'Record why you need access (at least 10 characters).');
    rateLimit(`support-code:${ip}`, 10);
    const grant = db.prepare('SELECT * FROM support_grants WHERE code_hash=?').get(sha(String(body.code || '').trim().toUpperCase()));
    if (!grant || grant.revoked || grant.expires <= clock() || grant.reads >= GRANT_MAX_READS) { act('support.denied', '', reason); fail(403, 'That access code is invalid, expired or revoked.'); }
    const entries = listEntries(db, grant.account_id).map(e => ({ id: e.id, kind: e.kind, facts: e.facts, notes: e.notes, created: e.created, updated: e.updated }));
    db.prepare('UPDATE support_grants SET reads=reads+1 WHERE id=?').run(grant.id);
    db.prepare('INSERT INTO support_access_log(grant_id,account_id,at,staff,reason,entries) VALUES(?,?,?,?,?,?)').run(grant.id, grant.account_id, clock(), staff.name, reason, entries.length);
    act('support.journal', grant.id, reason);
    return send({ entries });
  }
  if (route === '/admin/actions' && req.method === 'GET')
    return send({ actions: db.prepare('SELECT at, staff, role, action, target, detail FROM admin_actions ORDER BY id DESC LIMIT 100').all() });
  fail(404, 'Unknown admin route.');
}

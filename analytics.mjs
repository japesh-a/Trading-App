// Privacy-conscious analytics and operations (F24).
// - Product events are counted per UTC day against a keyed pseudonym of the account, only for accounts that
//   switched analytics ON (off by default). They carry an event name and a day, never text, emails, scores,
//   prices or journal content. No third party, no advertising identifiers, no cross-site tracking.
// - Operational counters (server errors, client sync failures, AI calls and estimated tokens) are anonymous
//   hourly totals and need no consent because they identify nobody.
// - Both kinds are deleted on a schedule (see `retention`) and the pseudonymous rows with the account.
import { createHmac, randomBytes } from 'node:crypto';

export const EVENTS = ['course_completed', 'daily_review_completed', 'return_visit', 'journal_reflection'];
export const FAILURE_KINDS = ['sync_failure', 'api_failure_client'];
export const OPS_KINDS = ['api_5xx', 'sync_failure', 'api_failure_client', 'ai_call', 'ai_failure', 'ai_tokens'];
export const retention = { eventDays: 180, opsDays: 90 };
const DAY = 86400000, HOUR = 3600000;
const hourKey = ms => new Date(ms).toISOString().slice(0, 13);
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);

export const analyticsMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_consent (account_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS analytics_events (
    day TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(day, name, subject)
  );
  CREATE TABLE IF NOT EXISTS ops_counters (hour TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(hour, kind));
  CREATE TABLE IF NOT EXISTS ops_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);
`);

// The pseudonym key lives in the database so it is backed up with the data but never exported or sent anywhere.
function pseudonymKey(db, now) {
  const row = db.prepare("SELECT value FROM ops_meta WHERE key='pseudonym_key'").get();
  if (row) return row.value;
  const value = randomBytes(32).toString('hex');
  db.prepare("INSERT OR IGNORE INTO ops_meta(key,value,updated) VALUES('pseudonym_key',?,?)").run(value, now);
  return db.prepare("SELECT value FROM ops_meta WHERE key='pseudonym_key'").get().value;
}
const subjectFor = (db, accountId, now) => createHmac('sha256', pseudonymKey(db, now)).update(String(accountId)).digest('hex').slice(0, 24);

export const analyticsEnabled = (db, accountId) =>
  Boolean(accountId && db.prepare('SELECT enabled FROM analytics_consent WHERE account_id=?').get(accountId)?.enabled);

export function analyticsSettings(db, accountId) {
  return { enabled: analyticsEnabled(db, accountId), events: EVENTS, note: 'Optional and off by default. Counts only that something happened on a day; never your answers, journal text or scores.' };
}

export function setAnalyticsConsent(db, accountId, enabled, now) {
  db.prepare('INSERT INTO analytics_consent(account_id,enabled,updated) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET enabled=excluded.enabled, updated=excluded.updated').run(accountId, enabled ? 1 : 0, now);
  // Switching off also forgets what was already counted for this account.
  if (!enabled) eraseAnalyticsEvents(db, accountId, now);
  return analyticsSettings(db, accountId);
}

/** Counts one product event. Returns false (and stores nothing) without consent or for unknown names. */
export function recordEvent(db, accountId, name, now) {
  if (!EVENTS.includes(name) || !analyticsEnabled(db, accountId)) return false;
  const subject = subjectFor(db, accountId, now);
  const day = name === 'course_completed' ? '0000-00-00' : dayKey(now); // completion is once per learner, not per day
  db.prepare('INSERT INTO analytics_events(day,name,subject,count) VALUES(?,?,?,1) ON CONFLICT(day,name,subject) DO UPDATE SET count=count+1').run(day, name, subject);
  return true;
}

export function recordOps(db, kind, now, amount = 1) {
  if (!OPS_KINDS.includes(kind) || !Number.isFinite(amount) || amount <= 0) return;
  db.prepare('INSERT INTO ops_counters(hour,kind,count) VALUES(?,?,?) ON CONFLICT(hour,kind) DO UPDATE SET count=count+excluded.count').run(hourKey(now), kind, Math.round(amount));
}

export function eraseAnalyticsEvents(db, accountId, now = Date.now()) {
  const row = db.prepare("SELECT value FROM ops_meta WHERE key='pseudonym_key'").get();
  if (!row) return;
  db.prepare('DELETE FROM analytics_events WHERE subject=?').run(subjectFor(db, accountId, now));
}
export function eraseAnalytics(db, accountId) {
  eraseAnalyticsEvents(db, accountId);
  db.prepare('DELETE FROM analytics_consent WHERE account_id=?').run(accountId);
}
export const exportAnalytics = (db, accountId) => ({ enabled: analyticsEnabled(db, accountId), note: 'Counts are stored under a pseudonym and cannot be read back as your own events.' });

export function purgeAnalytics(db, now = Date.now()) {
  const events = db.prepare("DELETE FROM analytics_events WHERE day<? AND day<>'0000-00-00'").run(dayKey(now - retention.eventDays * DAY)).changes;
  const ops = db.prepare('DELETE FROM ops_counters WHERE hour<?').run(hourKey(now - retention.opsDays * DAY)).changes;
  return { events, ops };
}

const uniq = (db, name, from, to) => db.prepare('SELECT COUNT(DISTINCT subject) n FROM analytics_events WHERE name=? AND day>=? AND day<=?').get(name, from, to).n;

/** Aggregate counts for staff. Small groups are shown, not hidden: the pilot has few users and subjects are pseudonymous. */
export function analyticsSummary(db, now, days = 7) {
  const to = dayKey(now), from = dayKey(now - (days - 1) * DAY);
  const consented = db.prepare('SELECT COUNT(*) n FROM analytics_consent WHERE enabled=1').get().n;
  const accounts = db.prepare('SELECT COUNT(*) n FROM accounts').get().n;
  const sinceHour = hourKey(now - days * DAY);
  const ops = Object.fromEntries(OPS_KINDS.map(k => [k, db.prepare('SELECT COALESCE(SUM(count),0) n FROM ops_counters WHERE kind=? AND hour>=?').get(k, sinceHour).n]));
  return {
    days, from, to,
    consent: { accountsOptedIn: consented, accounts },
    usage: {
      courseCompletions: db.prepare("SELECT COUNT(DISTINCT subject) n FROM analytics_events WHERE name='course_completed'").get().n,
      dailyReviewLearners: uniq(db, 'daily_review_completed', from, to),
      returningLearners: uniq(db, 'return_visit', from, to),
      journalReflectionLearners: uniq(db, 'journal_reflection', from, to),
    },
    reliability: { serverErrors: ops.api_5xx, syncFailures: ops.sync_failure, clientApiFailures: ops.api_failure_client },
    ai: { calls: ops.ai_call, failures: ops.ai_failure, estimatedTokens: ops.ai_tokens },
    note: 'Usage covers only learners who opted in. Reliability and AI figures are anonymous totals.',
  };
}

// ---- reliability: backups, rehearsals, alerts, public service state ----

export const setMeta = (db, key, now, value = '') =>
  db.prepare('INSERT INTO ops_meta(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated').run(key, String(value), now);
export const getMeta = (db, key) => db.prepare('SELECT value, updated FROM ops_meta WHERE key=?').get(key) ?? null;

const num = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
export const thresholds = (env = {}) => ({
  serverErrorsPerHour: num(env.WICKLUME_ALERT_5XX_PER_HOUR, 10),
  syncFailuresPerHour: num(env.WICKLUME_ALERT_SYNC_FAILURES_PER_HOUR, 20),
  backupMaxAgeHours: num(env.WICKLUME_BACKUP_MAX_AGE_HOURS, 36),
  rehearsalMaxAgeDays: num(env.WICKLUME_REHEARSAL_MAX_AGE_DAYS, 35),
  aiTokensPerDay: num(env.WICKLUME_ALERT_AI_TOKENS_PER_DAY, 200000),
});

/** Conditions a named operator should act on. Messages hold counts and ages only, never user data. */
export function evaluateAlerts(db, now, env = {}, health = { database: 'ok' }) {
  const t = thresholds(env), alerts = [];
  const add = (key, severity, message) => alerts.push({ key, severity, message });
  if (health.database !== 'ok') add('database', 'critical', 'The database health check is failing.');
  const hour = hourKey(now), count = kind => db.prepare('SELECT COALESCE(SUM(count),0) n FROM ops_counters WHERE hour=? AND kind=?').get(hour, kind).n;
  const errors = count('api_5xx'), syncs = count('sync_failure');
  if (errors >= t.serverErrorsPerHour) add('server-errors', 'high', `${errors} server errors this hour (limit ${t.serverErrorsPerHour}).`);
  if (syncs >= t.syncFailuresPerHour) add('sync-failures', 'medium', `${syncs} save/sync failures reported this hour (limit ${t.syncFailuresPerHour}).`);
  const tokens = db.prepare('SELECT COALESCE(SUM(count),0) n FROM ops_counters WHERE kind=? AND hour>=?').get('ai_tokens', dayKey(now) + 'T00').n;
  if (tokens >= t.aiTokensPerDay) add('ai-cost', 'medium', `Estimated AI tokens today: ${tokens} (limit ${t.aiTokensPerDay}).`);
  const backup = getMeta(db, 'last_backup');
  if (!backup) add('backup-missing', 'high', 'No backup has been recorded yet.');
  else if (now - backup.updated > t.backupMaxAgeHours * HOUR) add('backup-stale', 'high', `The last backup is older than ${t.backupMaxAgeHours} hours.`);
  const rehearsal = getMeta(db, 'last_rehearsal');
  if (!rehearsal) add('rehearsal-missing', 'medium', 'No restore rehearsal has been recorded yet.');
  else if (now - rehearsal.updated > t.rehearsalMaxAgeDays * DAY) add('rehearsal-stale', 'medium', `The last restore rehearsal is older than ${t.rehearsalMaxAgeDays} days.`);
  return alerts;
}

/**
 * Sends alerts to WICKLUME_ALERT_WEBHOOK (a feature flag: nothing leaves the machine unless it is set).
 * Each alert key is re-sent at most every `repeatHours`. Returns the alerts actually sent.
 */
export async function dispatchAlerts(alerts, { env = process.env, fetchImpl = fetch, sent = new Map(), now = Date.now(), repeatHours = 6 } = {}) {
  const url = String(env.WICKLUME_ALERT_WEBHOOK || '');
  if (!/^https:\/\//.test(url)) return [];
  const fresh = alerts.filter(a => now - (sent.get(a.key) ?? 0) >= repeatHours * HOUR);
  if (!fresh.length) return [];
  try {
    const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ text: 'Wicklume alert: ' + fresh.map(a => `[${a.severity}] ${a.message}`).join(' '), service: 'wicklume', alerts: fresh }) });
    if (!response.ok) return [];
  } catch { return []; }
  for (const alert of fresh) sent.set(alert.key, now);
  return fresh;
}

/** Visible service state for learners: free hosts pause, and the app should say so rather than look broken. */
export function serviceStatus(env = {}, health = { database: 'ok' }) {
  const declared = String(env.WICKLUME_SERVICE_STATE || '').toLowerCase();
  const state = health.database !== 'ok' ? 'degraded' : ['paused', 'degraded'].includes(declared) ? declared : 'ok';
  const notice = String(env.WICKLUME_SERVICE_NOTICE || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240);
  const messages = {
    ok: '',
    degraded: 'Some features may be slow or unavailable right now. Your work on this device is safe.',
    paused: 'The practice service is paused (free hosting limits). You can keep reading lessons; saving to your account resumes when it is back.',
  };
  return { state, message: notice || messages[state] };
}

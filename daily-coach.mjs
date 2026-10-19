// Daily learning coach (F16): three short items a day after the course is finished.
// One weak-topic question (F29 concept evidence, else lowest-accuracy skill), one spaced-repetition
// question from completed lessons (least recently asked first) and one reflection. The reflection is
// saved as the learner's own text and is never scored, gated or sent to an AI.
// Sessions are saved per account per day so a learner can resume; recently asked questions are avoided.
import { createHash } from 'node:crypto';
import { correctIndex } from './curriculum.mjs';
import { weakTopicForCoach, sectionOf } from './revision.mjs';
import { masteryReport } from './mastery.mjs';
import { SKILLS } from './public/skill-profile.js';

export const RECENT_DAYS = 14;
export const MAX_REFLECTION = 600;

export const coachMigration = db => db.exec(`
  CREATE TABLE IF NOT EXISTS daily_coach_sessions (
    account_id TEXT NOT NULL, day TEXT NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL,
    PRIMARY KEY(account_id, day)
  );
`);

const hash = value => parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
const key = (lesson, question) => `L${lesson}.Q${question}`;
const dayMinus = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

/** question key -> most recent day it was asked, over the recent window. */
function history(db, accountId, day) {
  const seen = new Map();
  for (const row of db.prepare('SELECT day,payload FROM daily_coach_sessions WHERE account_id=? AND day<? AND day>=? ORDER BY day').all(accountId, day, dayMinus(day, RECENT_DAYS)))
    for (const item of JSON.parse(row.payload).items) if (item.question !== undefined) seen.set(key(item.lesson, item.question), row.day);
  return seen;
}

/** Never/least recently asked first, then a stable per-account/day order. */
function pick(candidates, seen, salt, taken) {
  const fresh = candidates.filter(c => !taken.has(key(c.lesson, c.question)));
  const pool = fresh.length ? fresh : candidates;
  return [...pool].sort((a, b) => (seen.get(key(a.lesson, a.question)) ?? '').localeCompare(seen.get(key(b.lesson, b.question)) ?? '')
    || hash(salt + key(a.lesson, a.question)) - hash(salt + key(b.lesson, b.question)))[0];
}

const allQuestions = (course, lesson, section) => Array.from({ length: course[lesson].questions.length }, (_, question) => ({ lesson, question }))
  .filter(c => section === undefined || sectionOf(c.question) === section);

function objective(course, kind, c, reason) {
  const [prompt, ...raw] = course[c.lesson].questions[c.question];
  return {
    kind, lesson: c.lesson, question: c.question, prompt, reason,
    options: [0, 1, 2].map(choice => raw[(choice + c.question) % 3]),
    link: { lesson: c.lesson, slide: sectionOf(c.question), title: course[c.lesson].title },
  };
}

function buildItems({ db, accountId, day, progress, course }) {
  const seen = history(db, accountId, day), taken = new Set(), salt = `${accountId}|${day}|`;
  const completed = (progress.completed ?? []).filter(id => course[id]);
  // Weak topic: F29 concept evidence first, then the lowest skill by first-answer accuracy, then any completed lesson.
  const weak = weakTopicForCoach(progress, course);
  let candidates, reason;
  if (weak) {
    candidates = allQuestions(course, weak.lesson, weak.section);
    reason = `You missed ${weak.errors} different questions on this idea.`;
  } else {
    const report = masteryReport(progress, course);
    const lowest = report.skills.filter(skill => skill.score !== null).sort((a, b) => a.score - b.score)[0];
    const lessonIds = lowest ? (progress.completed ?? []).filter(id => course[id] && SKILLS.find(skill => skill.id === lowest.id)?.lessons.includes(id)) : [];
    const pool = lessonIds.length ? lessonIds : completed;
    candidates = pool.flatMap(id => allQuestions(course, id));
    reason = lowest ? `${lowest.name} is your lowest area so far (${lowest.score}%).` : 'A refresher on a lesson you completed.';
  }
  const w = pick(candidates, seen, salt + 'weak', taken);
  taken.add(key(w.lesson, w.question));
  const others = completed.filter(id => id !== w.lesson);
  const s = pick((others.length ? others : completed).flatMap(id => allQuestions(course, id)), seen, salt + 'spaced', taken);
  return [objective(course, 'weak', w, reason), objective(course, 'spaced', s, 'Spaced review: a question you have not seen for a while.'), { kind: 'reflection' }]
    .map(item => ({ ...item, answer: null, text: null }));
}

function reflectionPrompt(db, accountId, day) {
  const recent = db.prepare('SELECT day FROM scenario_attempts WHERE account_id=? AND day<=? AND day>? ORDER BY day DESC LIMIT 1').get(accountId, day, dayMinus(day, 7));
  if (recent) return { prompt: `Think about your daily challenge from ${recent.day}. What did your plan say before you committed, and what would you keep or change next time? Write a sentence or two.`, basis: 'recent-practice' };
  return {
    prompt: 'Illustrative example: a trader buys after three green candles, with no stop, because the move "looks strong". The price then reverses. Which rule from the course would have helped most, and why?',
    basis: 'generic-historical-example',
  };
}

function view(session, day, course) {
  const items = session.items.map((item, index) => {
    if (item.kind === 'reflection') return { index, kind: 'reflection', prompt: item.prompt, basis: item.basis, optional: true, done: typeof item.text === 'string', text: item.text };
    const { answer, ...rest } = item;
    const out = { index, ...rest, done: answer !== null, chosen: answer };
    if (answer !== null) {
      const expected = correctIndex(item.lesson, item.question);
      out.result = { correct: answer === expected, answer: expected, explanation: `The correct answer is: ${course[item.lesson].questions[item.question][1]}. ${course[item.lesson].slides[sectionOf(item.question)][1]}` };
    }
    return out;
  });
  const done = items.filter(item => item.done).length;
  return {
    day, items, done, total: items.length, complete: done === items.length, minutes: '3-5',
    note: 'Optional and private. Questions are objective; the reflection is your own writing and is not scored.',
  };
}

const load = (db, accountId, day) => {
  const row = db.prepare('SELECT payload FROM daily_coach_sessions WHERE account_id=? AND day=?').get(accountId, day);
  return row ? JSON.parse(row.payload) : null;
};

/** Today's session: created once (INSERT OR IGNORE keeps concurrent callers consistent), then resumed. */
export function todaySession({ db, accountId, day, progress, course, now }) {
  let session = load(db, accountId, day);
  if (!session) {
    const items = buildItems({ db, accountId, day, progress, course });
    Object.assign(items[2], reflectionPrompt(db, accountId, day));
    db.prepare('INSERT OR IGNORE INTO daily_coach_sessions VALUES(?,?,?,?)').run(accountId, day, JSON.stringify({ items }), now);
    session = load(db, accountId, day);
  }
  return view(session, day, course);
}

/** Records one answer. Objective items accept one answer; the reflection may be rewritten the same day. */
export function answerItem({ db, accountId, day, index, body, course, now }) {
  const session = load(db, accountId, day);
  if (!session) return { status: 404, error: "Open today's questions first." };
  const item = session.items[index];
  if (!item) return { status: 400, error: 'Unknown item.' };
  if (item.kind === 'reflection') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_REFLECTION || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return { status: 400, error: `Write up to ${MAX_REFLECTION} characters.` };
    item.text = text;
  } else {
    if (!Number.isInteger(body.answer) || body.answer < 0 || body.answer > 2) return { status: 400, error: 'Invalid answer.' };
    if (item.answer !== null) return { status: 409, error: 'Already answered today.' };
    item.answer = body.answer;
  }
  db.prepare('UPDATE daily_coach_sessions SET payload=?, updated=? WHERE account_id=? AND day=?').run(JSON.stringify(session), now, accountId, day);
  return { status: 200, session: view(session, day, course) };
}

export const exportCoach = (db, accountId) =>
  db.prepare('SELECT day,payload FROM daily_coach_sessions WHERE account_id=? ORDER BY day').all(accountId).map(row => ({ day: row.day, items: JSON.parse(row.payload).items }));

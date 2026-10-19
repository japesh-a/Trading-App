// Course completion and mastery evidence (F15).
// Completion means every question in the required lessons was answered; mastery
// evidence is first-answer accuracy. The two are reported separately. Graduation is
// recorded once on the server and is never revoked when optional lessons are added.
import { SKILLS } from './public/skill-profile.js';

export const REQUIRED_LESSONS = 21;
export const REQUIRED_COURSE_VERSION = 1;
export const WEAK_BELOW = 75;
export const MIN_EVIDENCE = 5;

const correctChoice = question => (3 - question % 3) % 3;
const validAnswer = answer => Number.isInteger(answer) && answer >= 0 && answer <= 2;

function lessonEvidence(progress, id, questionCount) {
  const answers = Array.isArray(progress?.answers?.[id]) ? progress.answers[id].slice(0, questionCount) : [];
  let correct = 0, answered = 0;
  answers.forEach((answer, question) => { if (!validAnswer(answer)) return; answered++; if (answer === correctChoice(question)) correct++; });
  return { id, answered, correct, total: questionCount, complete: answered === questionCount && !!progress?.completed?.includes(id) };
}

const requiredEvidence = (progress, course) =>
  Array.from({ length: Math.min(REQUIRED_LESSONS, course.length) }, (_, id) => lessonEvidence(progress, id, course[id].questions.length));

export function requiredComplete(progress, course) {
  const lessons = requiredEvidence(progress, course);
  return lessons.length === REQUIRED_LESSONS && lessons.every(lesson => lesson.complete);
}

/** Records graduation the first time the required curriculum is complete. Returns true if newly recorded. */
export function recordGraduation(progress, course, now) {
  if (progress.graduation || !requiredComplete(progress, course)) return false;
  progress.graduation = {
    at: new Date(now).toISOString(), courseVersion: REQUIRED_COURSE_VERSION, requiredLessons: REQUIRED_LESSONS,
    firstAnswerAccuracy: masteryReport(progress, course).evidence.accuracy,
  };
  return true;
}

export function masteryReport(progress, course) {
  const lessons = requiredEvidence(progress, course);
  const completed = lessons.filter(lesson => lesson.complete).length;
  const answered = lessons.reduce((sum, lesson) => sum + lesson.answered, 0), correct = lessons.reduce((sum, lesson) => sum + lesson.correct, 0);
  const skills = SKILLS.map(skill => {
    const own = lessons.filter(lesson => skill.lessons.includes(lesson.id));
    const a = own.reduce((sum, lesson) => sum + lesson.answered, 0), c = own.reduce((sum, lesson) => sum + lesson.correct, 0);
    const score = a >= MIN_EVIDENCE ? Math.round(c / a * 100) : null;
    return { id: skill.id, name: skill.name, answered: a, score, weak: score !== null && score < WEAK_BELOW, lessons: own };
  });
  // Weakest lessons inside weak skills, so revision points at specific lessons.
  const revision = skills.filter(skill => skill.weak).flatMap(skill => skill.lessons
    .filter(lesson => lesson.answered > 0 && lesson.correct / lesson.answered < WEAK_BELOW / 100)
    .map(lesson => ({ lesson: lesson.id, title: course[lesson.id].title, skill: skill.id, accuracy: Math.round(lesson.correct / lesson.answered * 100) })))
    .sort((a, b) => a.accuracy - b.accuracy);
  return {
    required: { lessons: REQUIRED_LESSONS, completed, complete: completed === REQUIRED_LESSONS, courseVersion: REQUIRED_COURSE_VERSION },
    evidence: { answered, correct, accuracy: answered ? Math.round(correct / answered * 100) : null, basis: 'first answers only' },
    mastery: {
      note: 'Completion means every question was answered. Accuracy is first-answer quiz evidence, not trading ability or profit.',
      weakSkills: skills.filter(skill => skill.weak).map(({ id, name, score }) => ({ id, name, score })),
    },
    graduation: progress.graduation ?? null,
    dailyReviewUnlocked: !!progress.graduation,
    revision: { recommended: revision.length > 0, lessons: revision.slice(0, 5) },
    skills: skills.map(({ lessons: _lessons, ...rest }) => rest),
  };
}

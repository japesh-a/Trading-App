// Targeted revision for repeated misunderstandings (F29).
// Evidence is the first answer to each distinct reviewed question (the answer route
// refuses re-answers, and practice answers here are never stored as evidence). A concept
// is a lesson section; two independent errors on it trigger a private suggestion.
// Only objective answers count: free-text notes and AI output never feed this.
import { correctIndex } from './curriculum.mjs';

export const REVISION_ERRORS_DEFAULT = 2;
export const PRACTICE_QUESTIONS = 3;
export const QUESTIONS_PER_SECTION = 4;

export const sectionOf = question => Math.min(2, Math.floor(question / QUESTIONS_PER_SECTION));
export const conceptId = (lesson, question) => `L${lesson}.S${sectionOf(question)}`;

/** The misconception a wrong answer represents: the text of the option picked. Displayed option `answer` is raw[(answer + question) % 3]. */
function pickedOption(course, lesson, question, answer) {
  const [, ...raw] = course[lesson].questions[question];
  return raw[(answer + question) % 3];
}

export function revisionThreshold(env = process.env) {
  const value = Number(env.WICKLUME_REVISION_ERRORS);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : REVISION_ERRORS_DEFAULT;
}

/** Concept evidence from first answers: one entry per distinct question. */
export function conceptEvidence(progress, course) {
  const concepts = new Map();
  for (const [key, answers] of Object.entries(progress?.answers ?? {})) {
    const lesson = Number(key);
    if (!Number.isInteger(lesson) || !course[lesson] || !Array.isArray(answers)) continue;
    answers.slice(0, course[lesson].questions.length).forEach((answer, question) => {
      if (!Number.isInteger(answer) || answer < 0 || answer > 2) return;
      const id = conceptId(lesson, question);
      if (!concepts.has(id)) concepts.set(id, { id, lesson, section: sectionOf(question), answered: 0, errors: [] });
      const concept = concepts.get(id);
      concept.answered++;
      if (answer !== correctIndex(lesson, question)) concept.errors.push({ question, misconception: pickedOption(course, lesson, question, answer) });
    });
  }
  return [...concepts.values()];
}

function practiceFor(course, lesson, section, avoid) {
  const all = Array.from({ length: course[lesson].questions.length }, (_, q) => q).filter(q => !avoid.includes(q));
  // Same section first, then the rest of the lesson, so the questions differ from those answered wrong.
  const ordered = [...all.filter(q => sectionOf(q) === section), ...all.filter(q => sectionOf(q) !== section)].slice(0, PRACTICE_QUESTIONS);
  return ordered.map(question => {
    const [prompt, ...raw] = course[lesson].questions[question];
    return { question, prompt, options: [0, 1, 2].map(choice => raw[(choice + question) % 3]) };
  });
}

function build(course, concept, reason) {
  const slideIndex = Math.min(concept.section, course[concept.lesson].slides.length - 1), slide = course[concept.lesson].slides[slideIndex];
  const wrong = concept.errors.map(error => error.question);
  return {
    concept: concept.id, reason, lesson: concept.lesson, lessonTitle: course[concept.lesson].title, section: concept.section,
    link: { lesson: concept.lesson, slide: slideIndex },
    evidence: { answered: concept.answered, errors: concept.errors.length, questions: wrong, misconceptions: concept.errors.map(error => error.misconception) },
    explanation: reason === 'repeated-errors'
      ? `You missed ${concept.errors.length} different questions on this idea. This is private to you and only a suggestion.`
      : 'You asked for help with this topic.',
    recap: { title: slide?.[0] ?? course[concept.lesson].title, text: slide?.[1] ?? '' },
    practice: practiceFor(course, concept.lesson, concept.section, wrong),
  };
}

/** Private revision suggestions for concepts with enough independent errors, most errors first. Available during the course. */
export function revisionSuggestions(progress, course, { threshold = REVISION_ERRORS_DEFAULT, topic } = {}) {
  const concepts = conceptEvidence(progress, course);
  const suggestions = concepts.filter(concept => concept.errors.length >= threshold)
    .sort((a, b) => b.errors.length - a.errors.length || a.id.localeCompare(b.id))
    .map(concept => build(course, concept, 'repeated-errors'));
  if (topic) {
    const lesson = Number(topic.lesson), section = Number(topic.section ?? 0), id = `L${lesson}.S${section}`;
    if (Number.isInteger(lesson) && course[lesson] && Number.isInteger(section) && section >= 0 && section <= 2 && !suggestions.some(item => item.concept === id)) {
      const known = concepts.find(concept => concept.id === id) ?? { id, lesson, section, answered: 0, errors: [] };
      suggestions.push(build(course, known, 'requested'));
    }
  }
  return { threshold, suggestions, basis: 'Objective first answers only; revision never lowers a score or blocks progress.' };
}

/** Weak-topic input for the daily coach (F16): the strongest triggered concept, or null. */
export function weakTopicForCoach(progress, course, options) {
  const first = revisionSuggestions(progress, course, { ...options, topic: undefined }).suggestions[0];
  return first ? { concept: first.concept, lesson: first.lesson, section: first.section, errors: first.evidence.errors } : null;
}

/** Checks a practice answer. Never stored and never changes first-answer evidence. */
export function checkPractice(course, lesson, question, answer) {
  const expected = correctIndex(lesson, question);
  return { correct: answer === expected, answer: expected, countsAsEvidence: false, explanation: `The correct answer is: ${course[lesson].questions[question][1]}.` };
}

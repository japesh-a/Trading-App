import questionBank from './question-bank.json' with { type: 'json' };
import { lessonContent } from './lesson-content.mjs';
import { lessonNotes } from './lesson-notes.mjs';

// The correct choice is stored first. The API rotates displayed choices and
// checks answers without exposing the answer key before a learner responds.
export const lessons = lessonContent.map(([title, minutes, slides], index) => ({
  title, minutes: minutes + 4, slides, notes: lessonNotes[index], questions: questionBank[index]
}));

export function publicLessons() {
  return lessons.map(({ title, minutes, slides, notes, questions }) => ({
    title, minutes, slides, notes,
    questions: questions.map(([prompt, correct, wrongA, wrongB], index) => ({
      prompt,
      options: [correct, wrongA, wrongB].map((_, choice) =>
        [correct, wrongA, wrongB][(choice + index) % 3])
    }))
  }));
}

export function correctIndex(lessonIndex, questionIndex) {
  return (3 - questionIndex % 3) % 3;
}

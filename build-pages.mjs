import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lessons, publicLessons, correctIndex } from './curriculum.mjs';
import { series } from './scenarios.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = path.join(root, 'dist');
mkdirSync(output, { recursive: true });
for (const file of ['app.js', 'style.css', 'pages-adapter.js', 'lesson-visuals.js']) {
  copyFileSync(path.join(root, 'public', file), path.join(output, file));
}
const source = readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const html = source
  .replace('href="/style.css"', 'href="./style.css"')
  .replace('Built for better decisions.<span>', 'Built for better decisions. <a href="https://github.com/japesh-a/Trading-App/issues" target="_blank" rel="noopener noreferrer">Share feedback on GitHub ↗</a><span>')
  .replace('<script type="module" src="/app.js"></script>',
    '<script>window.__WICKLUME_STATIC__=true</script><script src="./pages-adapter.js?v=lesson-depth"></script><script type="module" src="./app.js?v=lesson-depth"></script>');
if (html === source || !html.includes('__WICKLUME_STATIC__')) throw Error('Static HTML transformation failed');
writeFileSync(path.join(output, 'index.html'), html);
writeFileSync(path.join(output, 'site-data.json'), JSON.stringify({
  lessons: publicLessons(),
  correct: lessons.map((lesson, id) => lesson.questions.map((_, question) => correctIndex(id, question))),
  series
}));
writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Built GitHub Pages site with ${lessons.length} lessons in dist/`);

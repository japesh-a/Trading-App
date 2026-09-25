import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lessons, publicLessons, correctIndex } from './curriculum.mjs';
import { series } from './scenarios.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = path.join(root, 'dist');
mkdirSync(output, { recursive: true });
const files = readdirSync(path.join(root,'public')).filter(file=>/\.(js|css|json)$/.test(file));
const version = createHash('sha256').update(files.map(file=>readFileSync(path.join(root,'public',file),'utf8')).join('')).digest('hex').slice(0,12);
for(const file of files){
  let content=readFileSync(path.join(root,'public',file),'utf8');
  if(file.endsWith('.js'))content=content.replace(/from '(\.\/[^']+\.js)'/g,(_,name)=>"from '"+name+"?v="+version+"'");
  writeFileSync(path.join(output,file),content);
}
const source=readFileSync(path.join(root,'public','index.html'),'utf8');
const html=source
 .replace('href="/style.css"', 'href="./style.css?v='+version+'"')
 .replace('<script type="module" src="/app.js"></script>',
  '<script>window.__WICKLUME_STATIC__=true</script><script src="./pages-adapter.js?v='+version+'"></script><script type="module" src="./app.js?v='+version+'"></script>');
if(!html.includes('__WICKLUME_STATIC__'))throw Error('Static HTML transformation failed');
writeFileSync(path.join(output,'index.html'),html);
writeFileSync(path.join(output,'site-data.json'),JSON.stringify({
 lessons:publicLessons(),correct:lessons.map((lesson,id)=>lesson.questions.map((_,q)=>correctIndex(id,q))),series
}));
writeFileSync(path.join(output,'.nojekyll'),'');
console.log('Built GitHub Pages site with '+lessons.length+' lessons and trading workspace in dist/');

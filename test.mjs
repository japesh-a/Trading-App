import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { lessonVisual } from './public/lesson-visuals.js';

const port=5187,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,WICKLUME_PORT:String(port),WICKLUME_DB:':memory:'},stdio:'ignore'});
async function call(url,body){const response=await fetch(base+url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:response.status,data:await response.json()}}
try{
 let ready=false;
 for(let attempt=0;attempt<30;attempt++){try{const response=await fetch(base);if(response.ok){ready=true;break}}catch{}await delay(100)}
 assert(ready,'Test server did not start');
 const course=await call('/api/lessons');
 assert.equal(course.data.length,18);
 assert(course.data.every(lesson=>lesson.slides.length===3&&lesson.questions.length===10));
 assert(course.data.every(lesson=>lesson.notes.length===3&&lesson.notes.every(note=>note.length>150)));
 const visualTitles=new Set();
 for(let id=0;id<18;id++)for(let slide=0;slide<3;slide++){
  const diagram=lessonVisual(id,slide);
  assert(diagram.includes('<svg')&&diagram.includes('<figcaption>'),`Diagram ${id+1}.${slide+1}`);
  if(slide===0)visualTitles.add(diagram.match(/class="visual-title">([^<]+)/)[1]);
 }
 assert.equal(visualTitles.size,18,'Every lesson should have a distinct diagram subject');
 const laterLesson=await call('/api/answer',{id:17,question:0,answer:0});
 assert.equal(laterLesson.status,200,'Any lesson should be available from the start');
 assert.deepEqual(laterLesson.data.progress.completed,[],'Opening a lesson does not complete it');
 assert.equal((await call('/api/answer',{id:0,question:1,answer:0})).status,400);
 for(let id=0;id<18;id++){
  for(let question=id===17?1:0;question<10;question++){
   const result=await call('/api/answer',{id,question,answer:0});
   assert.equal(result.status,200,`Lesson ${id+1}, question ${question+1}`);
   assert.equal(result.data.completed,question===9);
   assert.equal(result.data.progress.completed.length,id+(question===9?1:0));
  }
 }
 assert.equal((await call('/api/answer',{id:17,question:9,answer:0})).status,400);
 assert.equal((await call('/api/progress')).data.attempts,180);
 assert.equal((await call('/api/scenario?id=0')).data.candles.length,16);
 const chart=await call('/api/decision',{id:0,choice:'Buy',reason:0});
 assert.equal(chart.data.candles.length,23);
 const frontend=await (await fetch(base+'/app.js')).text();
 assert(frontend.includes('fill="#ff6b78"'));
 assert.equal((await fetch(base+'/lesson-visuals.js')).status,200);
 console.log('PASS: 18 detailed lessons, 54 lesson diagrams, 180 ordered questions, completion and chart practice.');
}finally{child.kill()}

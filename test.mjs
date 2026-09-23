import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

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
 assert.equal((await call('/api/answer',{id:1,question:0,answer:0})).status,400);
 assert.equal((await call('/api/answer',{id:0,question:1,answer:0})).status,400);
 for(let id=0;id<18;id++){
  for(let question=0;question<10;question++){
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
 console.log('PASS: 18 lessons, 180 ordered questions, ten-question completion, no duplicate scoring, red hero candle, hidden chart future.');
}finally{child.kill()}

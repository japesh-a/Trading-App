import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, watch, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lessons, publicLessons, correctIndex } from './curriculum.mjs';
import { series } from './scenarios.mjs';
import { createTradingService } from './trading-service.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const dataDir=process.env.WICKLUME_DATA_DIR||path.join(root,'data');
const port=Number(process.env.WICKLUME_PORT||process.env.PORT)||5173;
const host=process.env.WICKLUME_HOST||'127.0.0.1';
mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(process.env.WICKLUME_DB||path.join(dataDir,'wicklume.db'));
db.exec('CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO progress VALUES(1,?)').run(JSON.stringify({completed:[],challenges:[],attempts:0,correct:0,days:[]}));
const get=()=>JSON.parse(db.prepare('SELECT value FROM progress WHERE id=1').get().value);
const handleTradingRequest=createTradingService(db);
const publicFiles=new Set(['index.html',...readdirSync(path.join(root,'public')).filter(file=>/\.(js|css|json)$/.test(file))]);
const clients=new Set();watch(path.join(root,'public'),()=>clients.forEach(client=>{try{client.write('data: reload\n\n')}catch{clients.delete(client)}}));
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(await handleTradingRequest(req,res,url))return;
 if(url.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
 if(url.pathname==='/api/progress'&&req.method==='GET')return json(get());
 if(url.pathname==='/api/lessons'&&req.method==='GET')return json(publicLessons());
 if(url.pathname==='/api/scenario'){const id=Number(url.searchParams.get('id'));if(!Number.isInteger(id)||id<0||id>2)return json({error:'Invalid scenario'},400);return json({candles:series[id].slice(0,16)});}
 if(req.method==='POST'&&['/api/answer','/api/decision'].includes(url.pathname)){
 try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Request too large');}const body=JSON.parse(raw),s=get(),id=body.id;if(!Number.isInteger(id)||id<0||id>=(url.pathname==='/api/answer'?lessons.length:3))throw Error('Invalid activity');let result;
 if(url.pathname==='/api/answer'){
  const q=body.question,answer=body.answer,lesson=lessons[id];
  if(!Number.isInteger(q)||q<0||q>=lesson.questions.length||!Number.isInteger(answer)||answer<0||answer>2)throw Error('Invalid answer');
  s.answers??={};s.answers[id]??=[];
  if(q!==s.answers[id].length)throw Error('Answer the questions in order');
  const correctAnswer=correctIndex(id,q),correct=answer===correctAnswer;
  s.answers[id].push(answer);s.attempts++;if(correct)s.correct++;
  const complete=s.answers[id].length===lesson.questions.length;
  if(complete&&!s.completed.includes(id))s.completed.push(id);
  result={correct,answer:correctAnswer,completed:complete,explanation:`The correct answer is: ${lesson.questions[q][1]}. ${lesson.slides[Math.min(2,Math.floor(q/4))][1]}`};
 }
 else{if(!['Buy','No trade','Sell'].includes(body.choice)||!Number.isInteger(body.reason)||body.reason<0||body.reason>2)throw Error('Choose a decision and reason');const best=['Buy','Sell','No trade'][id];if(!s.challenges.includes(id))s.challenges.push(id);result={best,candles:series[id],aligned:body.choice===best&&body.reason===id};}
 const day=new Date().toISOString().slice(0,10);if(!s.days.includes(day))s.days.push(day);db.prepare('UPDATE progress SET value=? WHERE id=1').run(JSON.stringify(s));return json({...result,progress:s});
 }catch(e){return json({error:e.message},400);}}
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!publicFiles.has(file)){res.writeHead(404);return res.end('Not found');}try{const content=readFileSync(path.join(root,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'text/html','Cache-Control':'no-store'});res.end(content)}catch{if(!res.headersSent){res.writeHead(500);res.end('Unable to load page')}}
}).listen(port,host,()=>console.log(`Wicklume server: http://${host}:${port}`));

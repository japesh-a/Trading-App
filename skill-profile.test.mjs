import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publicLessons,correctIndex} from './curriculum.mjs';
import {SKILLS,skillProfile,skillProfileHtml} from './public/skill-profile.js';
const course=publicLessons();
const answers=(id,count=10)=>Array.from({length:count},(_,q)=>correctIndex(id,q));

test('each course lesson contributes to exactly one skill and completion alone gives no score',()=>{
  const ids=SKILLS.flatMap(s=>s.lessons).sort((a,b)=>a-b);
  assert.deepEqual(ids,course.map((_,id)=>id));
  assert(skillProfile({completed:ids,correct:210,attempts:210},course).every(s=>s.score===null));
});
test('first answers set independent scores with an evidence minimum and meaningful bands',()=>{
  const progress={answers:{0:answers(0,4),11:answers(11),15:[0,0,0,0,0,0,0,0,0,0],16:Array(10).fill(2),17:answers(17)}};
  const skills=skillProfile(progress,course);
  assert.equal(skills[0].score,null);
  assert.equal(skills[1].score,100);
  assert.equal(skills[1].band,'strong');
  assert.equal(skills[2].score,40);
  assert.equal(skills[2].band,'building');
  assert.equal(skills[3].score,30);
  assert.equal(skills[4].score,100);
  progress.answers[0]=answers(0,5);
  assert.equal(skillProfile(progress,course)[0].score,100);
  assert.equal(skillProfile(progress,course)[1].score,100);
});
test('scores count valid evidence only and weight questions rather than averaging lesson percentages',()=>{
  const progress={answers:{0:answers(0),1:[1,1,1,1,1],16:[null,-1,3,'0'],999:answers(0)}};
  const skills=skillProfile(progress,course);
  assert.equal(skills[0].answered,15);
  assert.equal(skills[0].score,73);
  assert.equal(skills[0].band,'developing');
  assert.equal(skills[3].score,null);
  assert.equal(skills[3].answered,0);
});
test('profile provides accessible scores, honest empty states and a personalised next lesson',()=>{
  const empty=skillProfileHtml({},course);
  assert.equal((empty.match(/Not assessed yet/g)||[]).length,5);
  assert(!empty.includes('role="meter"'));
  const profile=skillProfileHtml({answers:{16:Array(10).fill(2)}},course);
  assert(profile.includes('aria-valuenow="30"'));
  assert(profile.includes('Strengthen journaling and review'));
  assert(profile.includes('data-lesson="16"'));
  assert(profile.includes('not trading ability or profit'));
});

export const SKILLS = Object.freeze([
  {id:'charts',name:'Chart reading',lessons:[0,1,2,3,4,5,6,7,8,9,10,18],description:'Candles, structure, timeframes and Fibonacci.'},
  {id:'risk',name:'Risk management',lessons:[11,12,13,14],description:'Orders, sizing, stops and reward-to-risk.'},
  {id:'planning',name:'Trade planning',lessons:[15,19],description:'Setups, triggers, invalidation and exits.'},
  {id:'journal',name:'Journaling and review',lessons:[16],description:'Recording decisions and reviewing evidence.'},
  {id:'discipline',name:'Discipline',lessons:[17,20],description:'Patience, trading rules and standing aside.'}
]);

// First-answer accuracy measures quiz understanding, not trading performance.
// The course rotates the first (correct) choice by question index.
export function skillProfile(progress, course) {
  return SKILLS.map(skill=>{
    const available=skill.lessons.filter(id=>course[id]);
    let answered=0,correct=0;
    for(const id of available){
      const answers=progress?.answers?.[id];
      if(!Array.isArray(answers))continue;
      answers.slice(0,course[id].questions.length).forEach((answer,q)=>{
        if(!Number.isInteger(answer)||answer<0||answer>2)return;
        answered++;
        if(answer===(3-q%3)%3)correct++;
      });
    }
    const total=available.reduce((sum,id)=>sum+course[id].questions.length,0);
    const score=answered>=5?Math.round(correct/answered*100):null;
    const band=score===null?'unassessed':score<50?'building':score<75?'developing':'strong';
    const label={unassessed:'Not assessed yet',building:'Building foundations',developing:'Developing',strong:'Strong understanding'}[band];
    const next=available.find(id=>!Array.isArray(progress?.answers?.[id])||progress.answers[id].length<course[id].questions.length)??available[0];
    return {...skill,answered,correct,total,score,band,label,next};
  });
}

export function skillProfileHtml(progress,course){
  const skills=skillProfile(progress,course);
  const assessed=skills.filter(skill=>skill.score!==null);
  const focus=assessed.filter(skill=>skill.score<75).sort((a,b)=>a.score-b.score)[0]
    ??skills.find(skill=>skill.score===null)??skills.find(skill=>skill.answered<skill.total)??skills[0];
  return `<section class="skill-profile" aria-labelledby="skills-title">
    <div class="section-heading"><div><div class="eyebrow">YOUR SKILL PROFILE</div><h2 id="skills-title">See where you are growing.</h2></div><span class="pill">${assessed.length} / 5 assessed</span></div>
    <p class="skill-explanation">Scores show first-answer quiz accuracy, not trading ability or profit. Each skill needs at least 5 answers. More answers give a fuller picture; lesson completion alone does not raise a score.</p>
    <div class="skill-grid">${skills.map(skill=>`<article class="panel skill-card skill-${skill.band}">
      <h3>${skill.name}</h3><p>${skill.description}</p>
      <div class="skill-score">${skill.score===null?'—':skill.score}<span>${skill.score===null?'Awaiting evidence':'/ 100'}</span></div>
      <strong class="skill-label">${skill.label}</strong>
      ${skill.score===null?'<div class="skill-meter skill-empty" aria-hidden="true"></div>':`<div class="skill-meter" role="meter" aria-label="${skill.name} quiz accuracy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${skill.score}"><i style="width:${skill.score}%"></i></div>`}
      <small>${skill.answered} / ${skill.total} questions answered${skill.score===null?` · ${5-skill.answered} more to assess`:skill.answered<skill.total?' · Early evidence':' · All quiz evidence collected'}</small>
      ${Number.isInteger(skill.next)?`<button class="link" data-lesson="${skill.next}">${skill.answered===skill.total?'Review':'Practise'} ${skill.name.toLowerCase()} →</button>`:''}
    </article>`).join('')}</div>
    ${Number.isInteger(focus.next)?`<div class="panel skill-next"><div><div class="eyebrow">YOUR NEXT STEP</div><h3>${focus.score===null?'Start building evidence in':focus.score<75?'Strengthen':'Keep practising'} ${focus.name.toLowerCase()}</h3><p>${course[focus.next].title}. Review the examples, then apply the idea in chart practice. Reviewing completed quizzes does not change your first-answer score.</p></div><button class="btn primary" data-lesson="${focus.next}">Open lesson →</button></div>`:''}
    <p class="skill-explanation">Journaling and discipline currently reflect quiz understanding. Challenge reviews and personalised daily questions will add practical evidence in a future update.</p>
  </section>`;
}

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COSTUMES,unlockedCostumes,selectedCostume,equipCostume,avatarSvg} from './public/avatar.js';
import {setAccountScope,saveSession} from './public/trade-store.js';

test('costumes unlock on distinct completed lessons and stay separate between accounts', () => {
  const previous=globalThis.localStorage, values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const progress=count=>({completed:Array.from({length:count},(_,i)=>i)});
  try {
    setAccountScope(null);
    assert.equal(selectedCostume(progress(0)).id,'grey');
    assert.equal(equipCostume('hoodie',progress(0)),false);
    for(const costume of COSTUMES){
      assert(unlockedCostumes(progress(costume.lessons)).some(c=>c.id===costume.id));
      if(costume.lessons)assert(!unlockedCostumes(progress(costume.lessons-1)).some(c=>c.id===costume.id));
    }
    assert.equal(unlockedCostumes({completed:[0,0,-1,21,'1',null]}).length,2);
    assert(equipCostume('scarf',progress(1)));
    setAccountScope('a');assert.equal(selectedCostume(progress(18)).id,'grey');
    assert.equal(equipCostume('graduate',progress(18)),false);
    assert(equipCostume('graduate',progress(21)));
    setAccountScope('b');assert.equal(selectedCostume(progress(18)).id,'grey');
    setAccountScope('a');assert.equal(selectedCostume(progress(21)).id,'graduate');
    assert.equal(selectedCostume(progress(0)).id,'grey','A locked saved costume cannot bypass progress');
    saveSession('avatar',{costume:'<script>bad</script>'});
    assert.equal(selectedCostume(progress(18)).id,'grey');
    assert(!avatarSvg('<script>').includes('<script>'));
    setAccountScope(null);assert.equal(selectedCostume(progress(1)).id,'scarf');
  } finally {globalThis.localStorage=previous;setAccountScope(null);}
});

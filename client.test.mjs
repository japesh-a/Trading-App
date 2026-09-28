import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { tradesCsv, matchesTradeSearch } from './public/journal-utils.js';

test('journal export neutralizes text formulas while retaining numeric losses and quoted notes', () => {
  const csv = tradesCsv([{ id: 'trade-1', pnl: -12.5, instrument: { id: 'BTC' }, reasoning: '\t=HYPERLINK("https://example.com")', notes: 'Waited, then wrote "no trade"\nReview next day.' }]);
  assert(csv.includes('"-12.5"'), 'A numeric trading loss remains numeric');
  assert(csv.includes('"\'\t=HYPERLINK(""https://example.com"")"'), 'A spreadsheet formula is exported as text');
  assert(csv.includes('Waited, then wrote ""no trade""\nReview next day.'));
  const trade = { instrument: { id: 'GBPUSD', label: 'GBP / USD' }, side: 'sell', mode: 'paper', notes: 'Waited for the retest', exitTime: Date.parse('2026-09-28') / 1000 };
  assert(matchesTradeSearch(trade, 'short retest 2026-09-28'));
  assert(!matchesTradeSearch(trade, 'BTC retest'));
  assert(matchesTradeSearch({ ...trade, exitTime: 1e30 }, 'retest'), 'An invalid archived timestamp cannot break journal searching');
});

async function clientFixture({ blockedStorage = false, stale = false } = {}) {
  const original = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage };
  let sessions = 0, configs = 0, staleRequests = 0, savedToken = stale ? 'stale-token' : null, releaseRenewal;
  const firstRenewal = new Promise(resolve => { releaseRenewal = resolve; });
  const headers = [];
  globalThis.window = { __WICKLUME_STATIC__: true };
  globalThis.localStorage = {
    getItem() { if (blockedStorage) throw Error('Storage blocked'); return savedToken; },
    setItem(key, value) { if (blockedStorage) throw Error('Storage blocked'); savedToken = value; },
    removeItem() { savedToken = null; },
  };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('runtime-config.json')) { configs++; return Response.json({ apiBase: 'https://test.example' }); }
    if (String(url).endsWith('/session')) { sessions++; return Response.json({ token: 'shared-guest-token' }); }
    headers.push(options.headers.Authorization);
    if (options.headers.Authorization === 'Bearer stale-token') { if (++staleRequests > 1) await firstRenewal; return Response.json({ error: 'This session has expired or is not recognised.' }, { status: 401 }); }
    releaseRenewal();
    return Response.json({ owner: options.headers.Authorization || 'cookie-account' });
  };
  const client = await import('./public/market-data.js?fixture=' + Math.random());
  return { client, headers, sessions: () => sessions, configs: () => configs, close() { for (const key of Object.keys(original)) { if (original[key] === undefined) delete globalThis[key]; else globalThis[key] = original[key]; } } };
}

test('parallel startup and blocked storage share one guest identity; signed-in users need no guest token', async () => {
  const f = await clientFixture({ blockedStorage: true });
  try {
    const results = await Promise.all([f.client.requestService('/progress'), f.client.requestService('/lessons'), f.client.requestService('/journal')]);
    assert.equal(f.sessions(), 1);
    assert.equal(f.configs(), 1);
    assert(results.every(result => result.owner === 'Bearer shared-guest-token'));
    f.client.setServiceAccount({ id: 'account' });
    assert.equal((await f.client.requestService('/progress')).owner, 'cookie-account');
    assert.equal(f.sessions(), 1);
  } finally { f.close(); }
});

test('a removed server guest session can be renewed without trapping startup in a reload loop', async () => {
  const f = await clientFixture({ stale: true });
  try {
    assert.equal((await f.client.requestService('/progress')).owner, 'Bearer shared-guest-token');
    assert.equal(f.sessions(), 1);
    assert.deepEqual(f.headers, ['Bearer stale-token', 'Bearer shared-guest-token']);
  } finally { f.close(); }
});

test('a delayed rejection of an old token cannot replace an already renewed guest identity', async () => {
  const f = await clientFixture({ stale: true });
  try {
    const results = await Promise.all([f.client.requestService('/progress'), f.client.requestService('/lessons')]);
    assert.equal(f.sessions(), 1);
    assert(results.every(result => result.owner === 'Bearer shared-guest-token'));
  } finally { f.close(); }
});

test('Pages learning progresses when storage is blocked and malformed saved data cannot crash the workspace', async () => {
  const source = readFileSync(new URL('./public/pages-adapter.js', import.meta.url), 'utf8');
  const lessons = [{ questions: Array.from({ length: 10 }, () => ({ options: ['Correct', 'Wrong', 'Wrong'] })), slides: [['Heading', 'Explanation']] }];
  const exercise = async blocked => {
    const events = [];
    const window = { __WICKLUME_STATIC__: true, fetch: async () => Response.json({ lessons, correct: [Array(10).fill(0)], series: [] }), addEventListener() {}, dispatchEvent: event => events.push(event) };
    vm.runInNewContext(source, { window, document: { currentScript: { src: 'https://test.example/Trading-App/pages-adapter.js' } }, location: { href: 'https://test.example/Trading-App/', origin: 'https://test.example' }, localStorage: { getItem() { if (blocked) throw Error('Blocked'); return '{"completed":[],"challenges":[],"days":null}'; }, setItem() { throw Error('Blocked'); } }, Response, URL, structuredClone, CustomEvent: class { constructor(type, options) { this.type=type;this.detail=options.detail; } } });
    const call = (url, body) => window.fetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : {});
    assert.equal((await (await call('/api/progress')).json()).attempts, 0);
    assert.equal((await call('/api/answer', { id: 0, question: 0, answer: 0 })).status, 200);
    const second = await call('/api/answer', { id: 0, question: 1, answer: 0 });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).progress.attempts, 2);
    assert.equal(events.filter(event => event.type === 'wicklume:storage-warning').length, 1);
  };
  await exercise(true); await exercise(false);
});

test('Pages retains original and newly appended lesson progress across reloads', async () => {
  const source = readFileSync(new URL('./public/pages-adapter.js', import.meta.url), 'utf8');
  const {publicLessons, lessons, correctIndex} = await import('./curriculum.mjs');
  const data = {lessons: publicLessons(), correct: lessons.map((lesson,id)=>lesson.questions.map((_,q)=>correctIndex(id,q))), series: []};
  let saved = JSON.stringify({completed:[17],answers:{17:Array(10).fill(0)},challenges:[],days:[],attempts:10,correct:4});
  const load = () => {
    const window = {__WICKLUME_STATIC__:true,fetch:async()=>Response.json(data),addEventListener(){},dispatchEvent(){}};
    vm.runInNewContext(source,{window,document:{currentScript:{src:'https://test.example/pages-adapter.js'}},location:{href:'https://test.example/',origin:'https://test.example'},localStorage:{getItem:()=>saved,setItem:(_,value)=>{saved=value;}},Response,URL,structuredClone});
    return async (body) => (await window.fetch(body?'/api/answer':'/api/progress',body?{method:'POST',body:JSON.stringify(body)}:{})).json();
  };
  let call=load();
  assert.deepEqual((await call()).completed,[17]);
  for(let id=18;id<21;id++)for(let question=0;question<10;question++){
    const result=await call({id,question,answer:correctIndex(id,question)});
    assert.equal(result.correct,true);
  }
  call=load();
  const restored=await call();
  assert.deepEqual(restored.completed,[17,18,19,20]);
  assert.equal(restored.attempts,40);
  assert.equal(restored.correct,34);
});

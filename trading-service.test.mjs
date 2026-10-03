import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createTradingService } from './trading-service.mjs';

async function fixture(overrides = {}) {
  let now = Date.parse('2026-09-25T12:00:00Z'), price = 100, coachPayload;
  const day = '2026-09-25', midnight = Date.parse(day + 'T00:00:00Z') / 1000;
  const candles = Array.from({ length: 144 }, (_, i) => ({
    time: midnight - 36 * 3600 + i * 900, open: 100, high: i === 51 ? 112 : 103, low: 98, close: 102, volume: 1,
  }));
  const challenge = { id: day + '-BTC-15m', day, marketDate: '2026-09-24', instrument: 'BTC', interval: 900,
    history: candles.slice(0, 48), future: candles.slice(48), source: 'Verified test provider', demo: false, selection: 'Fixed UTC session' };
  const db = new DatabaseSync(':memory:');
  const env = overrides.env || {};
  const service = createTradingService(db, {
    clock: () => now, env,
    challengeProvider: async () => challenge,
    quoteProvider: async () => ({ price, time: now / 1000, source: 'Quote fixture', demo: false }),
    marketProvider: async () => ({ candles: [{ time: Math.floor(now / 60000) * 60, open: price, high: price + 1, low: price - 1, close: price, volume: 1 }], price, time: now / 1000, source: 'Market fixture', demo: false, interval: 60 }),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      coachPayload = { headers: options.headers, ...JSON.parse(options.body) };
      return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Review the invalidation level before the result.' }] }] }) };
    },
    ...overrides,
  });
  const server = http.createServer(async (req, res) => {
    if (!await service(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/trading`;
  const call = async (route, body, token, headers = {}) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  return { call, base, db, challenge, now: () => now, tick: (ms = 61000) => { now += ms; }, setPrice: value => { price = value; }, coachPayload: () => coachPayload,
    close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
const order = { side: 'buy', entry: 102, stopLoss: 97, takeProfit: 110, quantity: 10 };
const decision = { challengeId: '2026-09-25-BTC-15m', order, reasoning: 'I will invalidate below the range low and size the risk first.', displayName: 'Alex' };

test('email accounts persist progress across logins and isolate guests and other accounts', async () => {
  const f = await fixture();
  const credentials = { email: 'Alice@Example.com', password: 'a-long-test-password', displayName: 'Alice' };
  const cookie = response => response.headers.get('set-cookie').split(';')[0];
  try {
    const guest = (await f.call('/session', {})).data.token;
    assert.equal((await f.call('/auth/me')).data.account, null);
    assert.equal((await f.call('/auth/register', { ...credentials, password: 'short' })).status, 400);
    const registered = await f.call('/auth/register', credentials);
    assert.equal(registered.status, 201);
    assert.equal(registered.data.account.email, 'alice@example.com');
    assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    assert.equal(registered.data.token, undefined, 'Account credentials are never returned to browser JavaScript');
    const alice = { Cookie: cookie(registered) };
    const stored = f.db.prepare('SELECT * FROM accounts').get();
    assert.notEqual(stored.password_hash, credentials.password);
    assert.equal(stored.password_hash.length, 128);
    assert.equal(stored.salt.length, 32);
    assert.equal((await f.call('/auth/me', undefined, undefined, alice)).data.account.id, registered.data.account.id);
    const answer = await f.call('/answer', { id: 0, question: 0, answer: 0 }, guest, alice);
    assert.equal(answer.status, 200);
    assert.equal(answer.data.progress.attempts, 1);
    assert.equal((await f.call('/progress', undefined, guest)).data.attempts, 0, 'Cookie identity does not mutate the guest bearer session');
    assert.equal((await f.call('/auth/register', credentials)).status, 409);
    assert.equal((await f.call('/auth/login', { ...credentials, password: 'wrong-long-password' })).status, 401);
    assert.equal((await f.call('/auth/login', { ...credentials, email: 'missing@example.com' })).status, 401);
    const login = await f.call('/auth/login', credentials);
    assert.equal(login.status, 200);
    const secondDevice = { Cookie: cookie(login) };
    assert.equal((await f.call('/progress', undefined, undefined, secondDevice)).data.attempts, 1);
    const bobResponse = await f.call('/auth/register', { ...credentials, email: 'bob@example.com', displayName: 'Bob' });
    assert.equal(bobResponse.status, 201);
    const bob = { Cookie: cookie(bobResponse) };
    assert.equal((await f.call('/progress', undefined, undefined, bob)).data.attempts, 0);
    const accountSession = f.db.prepare('SELECT session_id FROM accounts WHERE id=?').get(registered.data.account.id).session_id;
    const savedTrade = { id: 'alice-trade', mode: 'paper', status: 'closed', pnl: 10 };
    f.db.prepare('INSERT INTO trading_paper_trades VALUES(?,?,?)').run(savedTrade.id, accountSession, JSON.stringify(savedTrade));
    assert.deepEqual((await f.call('/journal', undefined, undefined, secondDevice)).data.trades, [savedTrade]);
    assert.deepEqual((await f.call('/journal', undefined, undefined, bob)).data.trades, []);
    const logout = await f.call('/auth/logout', {}, undefined, secondDevice);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await f.call('/progress', undefined, undefined, secondDevice)).status, 401, 'Logout revokes the server session');
    assert.equal((await f.call('/progress', undefined, undefined, alice)).status, 200, 'Other devices stay signed in');
    f.tick(8 * 86400000);
    assert.equal((await f.call('/progress', undefined, undefined, alice)).status, 401, 'Sessions expire on the server');
    assert.equal((await f.call('/auth/logout', {}, undefined, alice)).status, 200, 'An expired login can be cleared');
  } finally { await f.close(); }
});

test('Google sign in creates a separate account, restores it by Google ID, and never grants password access', async () => {
  const f = await fixture({ env: { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' },
    googleVerifier: async credential => {
      if (credential === 'invalid') throw Error('Bad signature');
      if (credential === 'unverified') return { sub: 'google-2', email: 'new@example.com', email_verified: false };
      return { sub: 'google-1', email: credential === 'renamed' ? 'changed@example.com' : 'new@example.com', email_verified: true, name: 'New learner' };
    } });
  const origin = { Origin: 'https://japesh-a.github.io' };
  const cookie = response => ({ ...origin, Cookie: response.headers.get('set-cookie').split(';')[0] });
  try {
    assert.equal((await f.call('/config')).data.googleClientId, 'test-client.apps.googleusercontent.com');
    assert.equal((await f.call('/auth/google', { credential: 'valid' })).status, 403, 'An origin is required');
    assert.equal((await f.call('/auth/google', { credential: 'valid' }, undefined, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await f.call('/auth/google', { credential: 'invalid' }, undefined, origin)).status, 401);
    assert.equal((await f.call('/auth/google', { credential: 'unverified' }, undefined, origin)).status, 401);
    const created = await f.call('/auth/google', { credential: 'valid' }, undefined, origin);
    assert.equal(created.status, 200);
    assert.equal(created.data.account.hasPassword, false);
    assert.equal(created.data.account.googleLinked, true);
    assert.equal((await f.call('/auth/me', undefined, undefined, cookie(created))).data.account.id, created.data.account.id);
    assert.equal((await f.call('/auth/login', { email: 'new@example.com', password: 'any-long-password' })).status, 401);
    assert.equal((await f.call('/auth/password', { currentPassword: 'any-long-password', newPassword: 'another-long-password' }, undefined, cookie(created))).status, 400);
    const again = await f.call('/auth/google', { credential: 'renamed' }, undefined, origin);
    assert.equal(again.data.account.id, created.data.account.id, 'Google sub, not email, identifies a returning account');
  } finally { await f.close(); }
});

test('Google identity links only after password sign in and never merges accounts by email', async () => {
  const f = await fixture({ env: { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' },
    googleVerifier: async credential => ({ sub: credential, email: 'existing@example.com', email_verified: true, name: 'Existing' }) });
  const origin = { Origin: 'https://japesh-a.github.io' };
  try {
    const registered = await f.call('/auth/register', { email: 'existing@example.com', password: 'existing-long-password', displayName: 'Existing' });
    const cookie = { ...origin, Cookie: registered.headers.get('set-cookie').split(';')[0] };
    assert.equal((await f.call('/auth/google', { credential: 'google-1' }, undefined, origin)).status, 409);
    assert.equal((await f.call('/auth/google', { credential: 'google-1', link: true }, undefined, origin)).status, 401);
    const linked = await f.call('/auth/google', { credential: 'google-1', link: true }, undefined, cookie);
    assert.equal(linked.status, 200);
    assert.equal(linked.data.account.id, registered.data.account.id);
    assert.equal(linked.data.account.googleLinked, true);
    assert.equal((await f.call('/auth/google', { credential: 'google-2', link: true }, undefined, cookie)).status, 409);
    const signedIn = await f.call('/auth/google', { credential: 'google-1' }, undefined, origin);
    assert.equal(signedIn.data.account.id, registered.data.account.id);
    assert.equal(signedIn.data.account.hasPassword, true);
  } finally { await f.close(); }
});

test('account routes reject hostile origins, use production Secure cookies and throttle login attempts', async () => {
  const f = await fixture({ env: { NODE_ENV: 'production', WICKLUME_COOKIE_SAME_SITE: 'none' } });
  const credentials = { email: 'secure@example.com', password: 'another-long-password', displayName: 'Secure user' };
  try {
    assert.equal((await f.call('/auth/register', credentials, undefined, { Origin: 'https://attacker.invalid' })).status, 403);
    const registered = await f.call('/auth/register', credentials, undefined, { Origin: 'https://japesh-a.github.io' });
    assert.equal(registered.status, 201);
    assert.match(registered.headers.get('set-cookie'), /SameSite=None; Max-Age=604800; Secure/);
    assert.equal(registered.headers.get('access-control-allow-credentials'), 'true');
    const hostedOrigin = 'https://' + new URL(f.base).host;
    assert.equal((await f.call('/config', undefined, undefined, { Origin: hostedOrigin })).status, 200, 'The HTTPS site works behind a TLS-terminating proxy');
    for (let i = 0; i < 11; i++) assert.equal((await f.call('/auth/login', { ...credentials, password: 'an-incorrect-password' })).status, 401);
    assert.equal((await f.call('/auth/login', credentials)).status, 429);
  } finally { await f.close(); }
});

test('account profile names stay authoritative and password changes revoke other devices', async () => {
  const f = await fixture();
  const credentials = { email: 'profile@example.com', password: 'initial-long-password', displayName: 'Alice' };
  const cookie = response => ({ Cookie: response.headers.get('set-cookie').split(';')[0] });
  try {
    assert.equal((await f.call('/auth/password', { currentPassword: credentials.password, newPassword: 'replacement-password' })).status, 401);
    const registered = await f.call('/auth/register', credentials);
    const original = cookie(registered);
    const otherDevice = cookie(await f.call('/auth/login', credentials));
    assert.equal((await f.call('/profile', { displayName: ' ' }, undefined, original)).status, 400);
    assert.equal((await f.call('/profile', { displayName: 'Alice charts' }, undefined, original)).data.displayName, 'Alice charts');
    const opened = await f.call('/paper/open', { symbol: 'BTC', order: { side: 'buy', entry: 100, stopLoss: 95, takeProfit: 110, quantity: 1 }, displayName: 'You' }, undefined, original);
    assert.equal(opened.status, 200);
    assert.equal((await f.call('/auth/me', undefined, undefined, original)).data.account.displayName, 'Alice charts', 'A trade cannot overwrite the account profile with an old local name');
    const change = { currentPassword: credentials.password, newPassword: 'replacement-long-password' };
    assert.equal((await f.call('/auth/password', { ...change, currentPassword: 'incorrect-password' }, undefined, original)).status, 401);
    assert.equal((await f.call('/auth/password', { ...change, newPassword: credentials.password }, undefined, original)).status, 400);
    const changed = await f.call('/auth/password', change, undefined, original);
    assert.equal(changed.status, 200);
    const fresh = cookie(changed);
    assert.equal((await f.call('/auth/me', undefined, undefined, otherDevice)).status, 401);
    assert.equal((await f.call('/auth/me', undefined, undefined, original)).status, 401);
    assert.equal((await f.call('/auth/me', undefined, undefined, fresh)).status, 200);
    assert.equal((await f.call('/auth/login', credentials)).status, 401);
    assert.equal((await f.call('/auth/login', { ...credentials, password: change.newPassword })).status, 200);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, undefined, fresh)).data.trade.id, opened.data.trade.id, 'Changing passwords preserves trading data');
    await f.call('/paper/close', {}, undefined, fresh);
    assert.deepEqual((await f.call('/progress', undefined, undefined, fresh)).data.days, [f.challenge.day]);
  } finally { await f.close(); }
});

test('sessions are authenticated, token hashes persist, and CORS/body limits apply', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/challenge')).status, 401);
    assert.equal((await f.call('/challenge', undefined, 'invented')).status, 401);
    const session = await f.call('/session', {});
    assert.equal(session.status, 201);
    assert.match(session.data.token, /^[A-Za-z0-9_-]{43}$/);
    const saved = f.db.prepare('SELECT * FROM trading_sessions').get();
    assert.notEqual(saved.token_hash, session.data.token);
    assert.equal(saved.token_hash.length, 64);
    const blocked = await f.call('/config', undefined, undefined, { Origin: 'https://attacker.invalid' });
    assert.equal(blocked.status, 403);
    const allowed = await f.call('/config', undefined, undefined, { Origin: 'https://japesh-a.github.io' });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://japesh-a.github.io');
    assert.equal(allowed.data.coach, false);
    assert.equal(allowed.data.paperRanked, true);
    assert.equal(allowed.data.lessonGateVerified, false);
    assert.equal(allowed.data.paperTradingOpen, true);
    assert.equal((await f.call('/session', { value: 'a'.repeat(17000) })).status, 413);
  } finally { await f.close(); }
});

test('chart history supports every paper timeframe without changing the execution feed', async () => {
  const requests = [];
  const f = await fixture({ marketProvider: async (symbol, timeframe = '1m') => {
    requests.push([symbol, timeframe]);
    const seconds = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[timeframe];
    return { candles: [{ time: Date.parse('2026-09-25T12:00:00Z') / 1000 - seconds,
      open: 100, high: 101, low: 99, close: 100, volume: 1 }],
    price: 100, time: Date.parse('2026-09-25T12:00:00Z') / 1000, source: 'Market fixture', demo: false };
  } });
  try {
    const token = (await f.call('/session', {})).data.token;
    for (const [timeframe, interval] of Object.entries({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 })) {
      const result = await f.call('/market?symbol=BTC&timeframe=' + timeframe, undefined, token);
      assert.equal(result.status, 200);
      assert.equal(result.data.interval, interval);
      assert.equal(result.data.candles.length, 1);
    }
    const cached = await f.call('/market?symbol=BTC&timeframe=1h', undefined, token);
    assert.equal(cached.data.interval, 3600, 'Cached chart history keeps its requested interval');
    assert.equal(requests.filter(([, frame]) => frame === '1h').length, 1);
    assert.equal((await f.call('/market?symbol=BTC&timeframe=2h', undefined, token)).status, 400);
    assert.equal((await f.call('/market?symbol=BTC', undefined, token)).data.interval, 60);
  } finally { await f.close(); }
});

test('default Twelve Data adapter preserves provider daily dates/OHLC and intraday session timestamps for every market',async()=>{
  const requests=[],now=Date.parse('2026-09-25T12:00:00Z')/1000;
  const f=await fixture({
    env:{TWELVE_DATA_API_KEY:'test-only-not-a-real-key'},marketProvider:undefined,
    quoteProvider:async()=>({price:5405,time:now,source:'Provider quote fixture'}),
    fetchImpl:async url=>{
      const parsed=new URL(url);requests.push(parsed);
      assert.equal(parsed.origin,'https://api.twelvedata.com');
      assert.equal(parsed.searchParams.get('timezone'),'UTC');
      return{ok:true,json:async()=>({values:[
        {datetime:parsed.searchParams.get('interval')==='1day'?'2026-09-24':'2026-09-24 13:30:00',open:'5400',high:'5412.5',low:'5388.25',close:'5405.75',volume:'1200'},
        {datetime:parsed.searchParams.get('interval')==='1day'?'2026-09-23':'2026-09-23 13:30:00',open:'5390',high:'5401',low:'5382',close:'5398',volume:'1100'},
      ]})};
    },
  });
  try{
    const token=(await f.call('/session',{})).data.token;
    for(const symbol of ['US500','XAUUSD','GBPUSD'])for(const timeframe of ['1m','5m','15m','1h','4h','1d']){
      const result=await f.call('/market?symbol='+symbol+'&timeframe='+timeframe,undefined,token);
      assert.equal(result.status,200);
      assert.deepEqual(result.data.candles.map(c=>[c.open,c.high,c.low,c.close]),[[5390,5401,5382,5398],[5400,5412.5,5388.25,5405.75]],'Provider OHLC stays exact, with chronological ordering');
      assert.equal(result.data.candles.at(-1).time,Date.parse(timeframe==='1d'?'2026-09-24T00:00:00Z':'2026-09-24T13:30:00Z')/1000);
      assert.equal(result.data.demo,false);
    }
    assert.equal(requests.length,18);
    assert(requests.filter(r=>r.searchParams.get('symbol')==='SPX').some(r=>r.searchParams.get('interval')==='1day'));
  }finally{await f.close();}
});

test('daily routes hide future bars, enforce entry/risk/one attempt, and calculate P/L themselves', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const challenge = await f.call('/challenge', undefined, token);
    assert.equal(challenge.status, 200);
    assert.equal(challenge.data.history.length, 48);
    assert.equal(challenge.data.future, undefined);
    assert.equal(challenge.data.submitted, false);
    assert.equal((await f.call('/daily/submit', { ...decision, order: { ...order, entry: 1 } }, token)).status, 400);
    assert.equal((await f.call('/daily/submit', { ...decision, order: { ...order, quantity: 100 } }, token)).status, 400);
    assert.equal((await f.call('/daily/submit', { ...decision, order: { ...order, stopLoss: 105 } }, token)).status, 400);
    const result = await f.call('/daily/submit', { ...decision, pnl: 999999, trade: { pnl: 999999 } }, token);
    assert.equal(result.status, 200);
    assert.equal(result.data.future.length, 96);
    assert.equal(result.data.trade.pnl, 80);
    assert.equal(result.data.trade.realizedR, 1.6);
    assert.equal(result.data.trade.serverVerified, true);
    assert.equal((await f.call('/daily/submit', decision, token)).status, 409);
    const restore = await f.call('/daily/result', undefined, token);
    assert.equal(restore.data.trade.id, result.data.trade.id);
    assert.equal((await f.call('/challenge', undefined, token)).data.submitted, true);
    const board = await f.call('/leaderboard?mode=daily', undefined, token);
    assert.deepEqual(board.data.entries, [{ displayName: 'Alex', pnl: 80, realizedR: 1.6, count: 1, isYou: true }]);
    assert.deepEqual((await f.call('/progress', undefined, token)).data.days, [f.challenge.day], 'Completing practice counts towards the streak');
    const other = (await f.call('/session', {})).data.token;
    assert.equal((await f.call('/daily/result', undefined, other)).status, 404);
    assert.equal((await f.call('/leaderboard?mode=daily', undefined, other)).data.entries.length, 1);
    assert.equal((await f.call('/leaderboard?mode=daily', undefined, other)).data.entries[0].isYou, false);
  } finally { await f.close(); }
});

test('concurrent daily submissions produce only one result', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const results = await Promise.all([f.call('/daily/submit', decision, token), f.call('/daily/submit', decision, token)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trading_daily_results').get().n, 1);
  } finally { await f.close(); }
});

test('paper is open immediately, uses provider market entry and exits, and isolates accounts', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const other = (await f.call('/session', {})).data.token;
    const paperOrder = { side: 'buy', entry: 1, stopLoss: 95, takeProfit: 110, quantity: 2 };
    const opened = await f.call('/paper/open', { symbol: 'BTC', order: paperOrder, displayName: 'Alex' }, token);
    assert.equal(opened.status, 200);
    assert.equal((await f.call('/progress', { completed: [1, 2, 3] }, token)).status, 404);
    assert.equal((await f.call('/answer', { id: 0, question: 1, answer: 0 }, token)).status, 409);
    assert.equal((await f.call('/answer', { id: 0, question: 0, answer: 0 }, token)).status, 200);
    assert.equal((await f.call('/progress', undefined, token)).data.answers[0].length, 1);
    assert.equal((await f.call('/progress', undefined, other)).data.completed.length, 0);
    assert.equal((await f.call('/answer', { id: 0, question: 9, answer: 0 }, token)).status, 409);
    assert.equal(opened.data.trade.entry, 100, 'Client entry prices are not trusted');
    assert.equal(opened.data.balance, 10000);
    assert.equal(opened.data.trade.initialRisk, 10);
    assert.equal((await f.call('/paper/open', { symbol: 'BTC', order: paperOrder }, token)).status, 409);
    assert.equal((await f.call('/paper/close', {}, other)).status, 409);
    f.setPrice(106); f.tick(3000);
    const state = await f.call('/paper/state?symbol=BTC', undefined, token);
    assert.equal(state.data.trade.unrealizedPnl, 12);
    const closed = await f.call('/paper/close', { price: 9999, pnl: 999999 }, token);
    assert.equal(closed.status, 200);
    assert.equal(closed.data.trade.pnl, 12);
    assert.equal(closed.data.trade.exitPrice, 106);
    assert.equal(closed.data.balance, 10012);
    assert.equal((await f.call('/paper/close', {}, token)).status, 409);
    const board = await f.call('/leaderboard?mode=paper', undefined, token);
    assert.equal(board.data.entries[0].pnl, 12);
    assert.equal(board.data.entries[0].count, 1);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, other)).data.balance, 10000);
  } finally { await f.close(); }
});

test('chosen-price paper entries wait for a quote crossing and can be cancelled', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const order = { side: 'buy', entry: 105, stopLoss: 95, takeProfit: 115, quantity: 2 };
    const placed = await f.call('/paper/open', { symbol: 'BTC', order, entryType: 'trigger' }, token);
    assert.equal(placed.status, 200);
    assert.equal(placed.data.trade.status, 'pending');
    assert.equal(placed.data.trade.entry, 105);
    f.setPrice(103); f.tick(3000);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, token)).data.trade.status, 'pending');
    f.setPrice(106); f.tick(3000);
    const filled = await f.call('/paper/state?symbol=BTC', undefined, token);
    assert.equal(filled.data.trade.status, 'open');
    assert.equal(filled.data.trade.entry, 105);
    assert.equal(filled.data.trade.unrealizedPnl, 0);
    f.setPrice(108); f.tick(3000);
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, token)).data.trade.unrealizedPnl, 6);
    assert.equal((await f.call('/paper/close', {}, token)).data.trade.pnl, 6);
    const again = await f.call('/paper/open', { symbol: 'BTC', order, entryType: 'trigger' }, token);
    assert.equal(again.data.trade.status, 'pending');
    const cancelled = await f.call('/paper/close', {}, token);
    assert.equal(cancelled.data.trade.status, 'cancelled');
    assert.equal((await f.call('/paper/state?symbol=BTC', undefined, token)).data.trade, null);
    assert.equal((await f.call('/leaderboard?mode=paper', undefined, token)).data.entries[0].count, 1);
  } finally { await f.close(); }
});

test('daily chosen-price entry is verified and an untouched level records no fill', async () => {
  const f = await fixture();
  try {
    const token = (await f.call('/session', {})).data.token;
    const chosen = await f.call('/daily/submit', { ...decision, entryType: 'trigger', order: { ...order, entry: 108, stopLoss: 100, takeProfit: 112, quantity: 2 } }, token);
    assert.equal(chosen.status, 200);
    assert.equal(chosen.data.trade.entryFilled, true);
    assert.equal(chosen.data.trade.entry, 108);
    const other = (await f.call('/session', {})).data.token;
    const unfilled = await f.call('/daily/submit', { ...decision, entryType: 'trigger', order: { ...order, entry: 200, stopLoss: 190, takeProfit: 220, quantity: 2 } }, other);
    assert.equal(unfilled.status, 200);
    assert.equal(unfilled.data.trade.entryFilled, false);
    assert.equal(unfilled.data.trade.pnl, 0);
    assert.equal(unfilled.data.trade.exitReason, 'entry-not-reached');
  } finally { await f.close(); }
});

test('stale providers cannot open orders and provider errors do not expose keys', async () => {
  const f = await fixture({
    env: { TWELVE_DATA_API_KEY: 'private-data-key' },
    quoteProvider: async () => { throw Error('Failed request with apikey=private-data-key'); },
  });
  try {
    const token = (await f.call('/session', {})).data.token;
    const result = await f.call('/quote?symbol=XAUUSD', undefined, token);
    assert.equal(result.status, 503);
    assert(!JSON.stringify(result.data).includes('private-data-key'));
    const config = await f.call('/config');
    assert(!JSON.stringify(config.data).includes('private-data-key'));
    assert.equal((await f.call('/market?symbol=UNSUPPORTED', undefined, token)).status, 400);
  } finally { await f.close(); }
  const stale = await fixture({ quoteProvider: async () => ({ price: 100, time: 1000, source: 'Stale' }) });
  try {
    const token = (await stale.call('/session', {})).data.token;
    assert.equal((await stale.call('/quote?symbol=BTC', undefined, token)).status, 503);
  } finally { await stale.close(); }
});

test('coach is optional, uses owned server trades, and keeps credentials on the server', async () => {
  const disconnected = await fixture();
  try {
    const token = (await disconnected.call('/session', {})).data.token;
    assert.equal((await disconnected.call('/coach', { question: 'Review my reasoning.' }, token)).status, 503);
  } finally { await disconnected.close(); }
  const f = await fixture({ env: { OPENAI_API_KEY: 'private-openai-key', OPENAI_MODEL: 'configured-model' } });
  try {
    const token = (await f.call('/session', {})).data.token;
    const other = (await f.call('/session', {})).data.token;
    const result = await f.call('/daily/submit', decision, token);
    assert.equal((await f.call('/coach', { tradeId: result.data.trade.id, question: 'Review my reasoning.' }, other)).status, 404);
    const review = await f.call('/coach', { tradeId: result.data.trade.id, question: 'Review my reasoning.' }, token);
    assert.equal(review.status, 200);
    assert(review.data.text.includes('invalidation'));
    assert.equal(review.data.serverVerified, true);
    assert(!JSON.stringify(review.data).includes('private-openai-key'));
    assert(!JSON.stringify((await f.call('/config')).data).includes('private-openai-key'));
    const payload = f.coachPayload();
    assert.equal(payload.model, 'configured-model');
    assert.equal(payload.store, false);
    assert.deepEqual(payload.tools, []);
    assert.equal(payload.headers.Authorization, 'Bearer private-openai-key');
    assert.equal(JSON.parse(payload.input).trade.pnl, 80);
    assert.equal((await f.call('/coach', { tradeId: result.data.trade.id, question: 'a'.repeat(601) }, token)).status, 400);
  } finally { await f.close(); }
});

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cwd = import.meta.dirname;
const server = spawn(process.execPath, ['server.mjs'], { cwd, env: { ...process.env, WICKLUME_PORT: '5191', WICKLUME_DB: ':memory:' }, stdio: 'ignore' });
const preview = spawn(process.execPath, ['preview-pages.mjs'], { cwd, stdio: 'ignore' });
const profile = mkdtempSync(path.join(tmpdir(), 'wicklume-browser-'));
const browser = spawn(process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9331', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let ws;
try {
  let tabs;
  for (let i = 0; i < 100; i++) {
    try { tabs = (await (await fetch('http://127.0.0.1:9331/json/list')).json()).filter(tab => tab.type === 'page'); if (tabs.length) break; } catch {}
    await delay(100);
  }
  assert(tabs?.length, 'Headless browser started');
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); ws.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
    console.log(await evaluate('JSON.stringify({url:location.href,body:document.body.innerText})'), errors);
    throw Error('Timed out waiting for ' + expression);
  };
  const screenshot = async name => writeFileSync(path.join(cwd, 'dist', name), Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await command('Runtime.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: 'http://127.0.0.1:5191' });
  await until('document.querySelector(".hero") && document.querySelector("#account-button").onclick');
  const mount = async (url = '/trading-chart.js') => {
    await evaluate(`(async () => {
      const {TradingChart} = await import('${url}');
      window.testChart?.destroy();
      const host = document.createElement('div'); host.style.height='440px';
      document.getElementById('app').replaceChildren(host);
      window.bars = Array.from({length:100},(_,i)=>({time:1800000000+i*900,open:100+i*.1,high:104+i*.1,low:96+i*.1,close:101+i*.1,volume:100+i}));
      window.levelUpdates=[];
      window.testChart = new TradingChart(host,{symbol:'BTC',candles:bars.slice(0,80),levels:{entry:105,stopLoss:98,takeProfit:115},onLevelChange:levels=>levelUpdates.push(levels)});
    })()`);
    await delay(250);
  };
  const mouse = async (type,x,y,buttons=0) => command('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount:type==='mouseMoved'?0:1});
  const coords = async (x,y) => evaluate(`(() => {const b=testChart.svg.getBoundingClientRect();return {x:b.left+${x},y:b.top+${y}}})()`);
  const clickPoint = async (x,y) => { const p=await coords(x,y); await mouse('mousePressed',p.x,p.y,1); await mouse('mouseReleased',p.x,p.y); await delay(80); };
  await mount();
  assert.equal(await evaluate('testChart.series.data().length'),80,'Only revealed candles reach the chart');
  assert.equal(await evaluate('testChart.series.data().at(-1).time'),1800000000+79*900);
  assert.equal(await evaluate('testChart.volumeSeries.data().length'),80);
  assert(await evaluate('Math.abs(testChart.priceAt(testChart.y(105))-105)<.00001'),'Price conversions agree');
  assert(await evaluate('Math.abs(testChart.indexAt(testChart.x(45))-45)<.00001'),'Time conversions agree');
  assert(await evaluate('testChart.attribution.getBoundingClientRect().bottom<=testChart.container.getBoundingClientRect().bottom'),'Notice is visible inside the chart');
  // Test actual pointer delivery through the SVG to the trading callbacks.
  const level=await evaluate('({x:180,y:testChart.y(98)})');
  const p=await coords(level.x,level.y);
  assert.equal(await evaluate(`document.elementFromPoint(${p.x},${p.y}).closest('[data-level]')?.dataset.level`),'stopLoss');
  await mouse('mousePressed',p.x,p.y,1); await mouse('mouseMoved',p.x,p.y-20,1); await mouse('mouseReleased',p.x,p.y-20);
  await delay(120);
  assert(await evaluate('testChart.levels.stopLoss>98&&levelUpdates.length>0'),'SL drag changes the plan');
  await evaluate('testChart.setLevels({entry:105,stopLoss:98,takeProfit:115},{editable:false})'); await delay(80);
  await mouse('mousePressed',p.x,p.y,1); await mouse('mouseMoved',p.x,p.y-20,1); await mouse('mouseReleased',p.x,p.y-20);
  assert.equal(await evaluate('testChart.levels.stopLoss'),98,'Locked trade levels cannot change');
  await evaluate('testChart.setLevels({}, {editable:true});testChart.setTool("trend")'); await delay(80);
  await clickPoint(150,140); await clickPoint(260,200);
  await evaluate('testChart.setTool("fib")'); await clickPoint(310,150); await clickPoint(410,220);
  await evaluate('testChart.setTool("horizontal")'); await clickPoint(200,260);
  await evaluate('testChart.setLabel("Retest <safe>");testChart.setTool("label")'); await clickPoint(470,150);
  assert.deepEqual(await evaluate('testChart.getDrawings().map(d=>d.type)'),['trend','fib','horizontal','label']);
  const anchors=await evaluate('testChart.getDrawings()');
  await evaluate('testChart.setTool("cursor");testChart.setData(bars.slice(0,81))'); await delay(150);
  assert.equal(await evaluate('testChart.series.data().length'),81,'Replay adds one candle');
  assert.deepEqual(await evaluate('testChart.getDrawings()'),anchors,'Replay keeps saved drawing anchors');
  const before=await evaluate('testChart.viewCount');
  const w=await coords(280,200);
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:w.x,y:w.y,deltaX:0,deltaY:-150});await delay(150);
  assert(await evaluate(`Math.abs(testChart.viewCount-${before})>1`),'Native wheel zoom works');
  const panBefore=await evaluate('testChart.viewStart');
  const pan=await coords(300,310);
  await mouse('mousePressed',pan.x,pan.y,1);await mouse('mouseMoved',pan.x+10,pan.y,1);await mouse('mouseMoved',pan.x+60,pan.y,1);await mouse('mouseMoved',pan.x+90,pan.y,1);await mouse('mouseReleased',pan.x+90,pan.y);await delay(150);
  assert(await evaluate(`Math.abs(testChart.viewStart-${panBefore})>.1`),'Native pan works');
  assert.deepEqual(await evaluate('testChart.getDrawings()'),anchors,'Zoom and pan leave drawing anchors unchanged');
  await evaluate('testChart.wrapper.dispatchEvent(new KeyboardEvent("keydown",{key:"+",bubbles:true}));');await delay(100);
  await evaluate('testChart.setData(bars.filter((_,i)=>i%4===0));testChart.resetView()');await delay(150);
  assert.equal(await evaluate('testChart.series.data().length'),25,'A timeframe replacement clears the old series');
  assert.deepEqual(await evaluate('testChart.getDrawings()'),anchors,'Timeframe replacement retains drawings');
  // The journal consumes this as an SVG image, including its embedded candle screenshot.
  assert(await evaluate(`(async()=>{const svg=testChart.snapshot();if(!svg.includes('data:image/png;base64,')||!svg.includes('Retest &lt;safe&gt;'))return false;const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();return img.naturalWidth===testChart.width})()`),'Journal snapshot decodes with candles and annotations');
  await screenshot('lightweight-charts-desktop.png');
  for(const theme of ['dark','light']){
    await evaluate(`document.documentElement.dataset.theme='${theme}';window.dispatchEvent(new Event('wicklume:theme'))`);await delay(80);
    assert.equal(await evaluate('testChart.engine.options().layout.background.color'),theme==='light'?'#ffffff':'#0a1220');
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile chart has no horizontal overflow');
    assert(await evaluate('Math.abs(testChart.engine.timeScale().width()-testChart.geometry().right)<1'),'Resize keeps overlay aligned');
    await screenshot(`lightweight-charts-mobile-${theme}.png`);
  }
  await evaluate('testChart.destroy()');
  assert.equal(await evaluate('document.querySelector(".wl-chart")'),null,'Chart is disposed on navigation');
  // Check the actual desks and controls, not just the standalone chart API.
  await command('Page.navigate',{url:'http://127.0.0.1:5191'});
  await until('document.querySelector(".hero")&&document.querySelector("#account-button").onclick');
  await evaluate(`(async()=>{const {TradingChart}=await import('/trading-chart.js');const original=TradingChart.prototype.setData;TradingChart.prototype.setData=function(bars){window.deskChart=this;return original.call(this,bars)}})()`);
  const openDesk=async page=>{
    await evaluate(`location.hash='${page}'`);
    await until('document.querySelector("#use-training-feed")||document.querySelector("#training-mode")');
    await evaluate('document.querySelector("#use-training-feed")?.click();document.querySelector("#training-mode")?.click()');
    await until('document.querySelector("#place-order")&&window.deskChart&&!deskChart.destroyed');
  };
  await openDesk('practice');
  for(const theme of ['light','dark']){
    await evaluate(`document.documentElement.dataset.theme='${theme}';dispatchEvent(new Event('wicklume:theme'))`);
    for(const tf of ['15m','1h','4h','1d']){
      await evaluate(`document.querySelector('[data-timeframe="${tf}"]').click()`);
      await until(`document.querySelector('[data-timeframe="${tf}"]').getAttribute('aria-pressed')==='true'`);await delay(70);
      assert(await evaluate(`(async()=>{
        const {getSession}=await import('/trade-store.js');const {utcDay}=await import('/market-data.js');const {aggregateCandles,TIMEFRAMES}=await import('/timeframes.js');
        const saved=getSession('daily-'+utcDay()+'-training');const d=saved.data;const revealed=[...d.history,...d.future.slice(0,saved.cursor)];
        const expected='${tf}'==='15m'?revealed:aggregateCandles([...(d.context||[]).filter(c=>c.time<revealed[0].time),...revealed],TIMEFRAMES['${tf}']).slice(-180);
        const actual=deskChart.series.data();return actual.length===expected.length&&actual.every((c,i)=>['open','high','low','close'].every(k=>c[k]===expected[i][k])&&c.time===expected[i].time)
      })()`),`${tf} daily chart shows exact revealed OHLC in ${theme} theme`);
      assert(await evaluate('deskChart.series.data().length>=2'),'Higher daily views have earlier context');
    }
  }
  await evaluate(`document.querySelector('#trade-reasoning').value='I see a higher low and a retest. I will enter at this price, with a stop below the low and a target at the preceding high.';document.querySelector('#trade-reasoning').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#place-order').click()`);
  await until('!document.querySelector("#next-bar").disabled');
  for(let step=0;step<8;step++)await evaluate('document.querySelector("#next-bar").click()');
  for(const tf of ['15m','1h','4h','1d']){
    await evaluate(`document.querySelector('[data-timeframe="${tf}"]').click()`);await delay(90);
    assert(await evaluate(`(async()=>{const {getSession}=await import('/trade-store.js');const {utcDay}=await import('/market-data.js');const {aggregateCandles,TIMEFRAMES}=await import('/timeframes.js');const s=getSession('daily-'+utcDay()+'-training');const d=s.data;const revealed=[...d.history,...d.future.slice(0,s.cursor)];const e='${tf}'==='15m'?revealed:aggregateCandles([...(d.context||[]).filter(c=>c.time<revealed[0].time),...revealed],TIMEFRAMES['${tf}']).slice(-180);return s.cursor===8&&deskChart.series.data().length===e.length&&deskChart.series.data().every((c,i)=>c.time===e[i].time&&c.close===e[i].close&&c.high===e[i].high&&c.low===e[i].low)})()`),`${tf} replay excludes unrevealed future after stepping`);
  }
  await openDesk('paper');
  for(const theme of ['light','dark']){
    await evaluate(`document.documentElement.dataset.theme='${theme}';dispatchEvent(new Event('wicklume:theme'))`);
    for(const symbol of ['BTC','US500','XAUUSD','GBPUSD']){
      await evaluate(`document.querySelector('[data-market="${symbol}"]').click()`);
      await until(`document.querySelector('[data-market="${symbol}"]')?.classList.contains('active')&&document.querySelector('#place-order')`);
      for(const tf of ['1m','5m','15m','1h','4h','1d']){
        await evaluate(`document.querySelector('[data-timeframe="${tf}"]').click()`);
        await until(`document.querySelector('[data-timeframe="${tf}"]').getAttribute('aria-pressed')==='true'`);await delay(60);
        assert(await evaluate(`(async()=>{const {TIMEFRAMES}=await import('/timeframes.js');const c=deskChart.series.data();return c.length>=2&&c.length<=180&&c.every((b,i)=>b.time%TIMEFRAMES['${tf}']===0&&(!i||b.time>c[i-1].time)&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))})()`),`${symbol} ${tf} has valid aligned candles in ${theme}`);
        assert(await evaluate('deskChart.series.options().priceFormat.precision===('+ (symbol==='GBPUSD'?5:symbol==='BTC'?2:symbol==='US500'?2:2) +')'),'Instrument price precision is retained');
        assert(await evaluate('document.querySelector(".chart-feed-note").textContent.includes("not real market history")&&deskChart.symbol.includes("SYNTHETIC")'),'Training data is labelled directly on the chart');
        if(tf==='1d'){
          assert(await evaluate(`(async()=>{const {TRAINING_BASES}=await import('/market-data.js');const base=TRAINING_BASES['${symbol}'];const bars=deskChart.series.data();return bars.length===31&&bars.every(c=>c.low>base*.7&&c.high<base*1.3)&&Math.abs(bars.at(-1).close-Number(document.querySelector('.metric-strip .metric strong').textContent.replace(/,/g,'')))<10**(-deskChart.decimals)})()`),`${symbol} daily prices have no runaway synthetic drift and match the current quote`);
          if(symbol==='US500'){
            await evaluate('document.querySelector("#trading-chart").scrollIntoView({block:"center",behavior:"instant"})');await delay(80);
            await screenshot(`us500-daily-corrected-${theme}.png`);
            await evaluate('window.scrollTo({top:0,behavior:"instant"})');
          }
        }
      }
    }
  }
  await evaluate(`(async()=>{const {saveSession}=await import('/trade-store.js');saveSession('paper-US500-training',{feedVersion:1,orderType:'trigger',entryDraft:12000,orderDraft:{stopLoss:11900,takeProfit:12300,risk:100},reasoning:'Keep my notes',drawings:[]});document.querySelector('[data-market="US500"]').click()})()`);
  await until('document.querySelector("[data-market=US500]")?.classList.contains("active")&&document.querySelector("#order-stop")');
  assert(await evaluate('Number(document.querySelector("#order-stop").value)<6000&&document.querySelector("#order-type").value==="market"'),'A legacy training draft cannot distort the corrected price scale');
  assert.equal(await evaluate('document.querySelector("#trade-reasoning").value'),'Keep my notes','Feed migration preserves trade notes');
  await screenshot('checked-paper-timeframes.png');
  await evaluate(`(async()=>{
    const {saveSession}=await import('/trade-store.js');
    saveSession('paper-US500',{trade:{id:'connected-position',status:'open',demo:false,entry:12000},reasoning:'Connected plan stays separate'});
    document.querySelector('#refresh-market').click();
  })()`);
  await until('document.querySelector("#retry-market-feed")');
  assert(await evaluate('document.querySelector(".empty-state").textContent.includes("Real US500 market history is unavailable")&&!document.querySelector(".wl-chart")'),'Missing providers cannot silently display a fake US500 chart');
  await evaluate('document.querySelector("#use-training-feed").click()');await until('document.querySelector("#place-order")');
  assert.equal(await evaluate('document.querySelector("#position-status").textContent'),'Ready to plan');
  assert(await evaluate(`(async()=>{const {getSession}=await import('/trade-store.js');return getSession('paper-US500').trade.status==='open'})()`),'Connected positions remain untouched by synthetic training mode');
  await evaluate('location.hash="profile"');await until('document.querySelector(".wardrobe")');
  assert.equal(await evaluate('document.querySelectorAll("[data-costume]:not(:disabled)").length'),1,'New users start with the grey figure');
  // Complete real lesson records through the service; incorrect answers still complete a lesson.
  await evaluate(`(async()=>{const {requestService}=await import('/market-data.js');for(let id=0;id<3;id++)for(let question=0;question<10;question++)await requestService('/answer',{id,question,answer:0})})()`);
  await command('Page.reload');await until('document.querySelector(".wardrobe")&&document.querySelector("#account-button").onclick');
  assert.equal(await evaluate('document.querySelectorAll("[data-costume]:not(:disabled)").length'),3,'Three lessons unlock the scarf and hoodie');
  await evaluate('document.querySelector("[data-costume=hoodie]").click()');
  assert.equal(await evaluate('document.querySelector("[data-costume=hoodie]").getAttribute("aria-pressed")'),'true');
  await command('Page.reload');await until('document.querySelector(".wardrobe")');
  assert.equal(await evaluate('document.querySelector("[data-costume=hoodie]").getAttribute("aria-pressed")'),'true','Outfit persists across reload');
  for(const theme of ['light','dark'])for(const width of [390,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await evaluate(`document.documentElement.dataset.theme='${theme}';dispatchEvent(new Event('wicklume:theme'))`);await delay(80);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Wardrobe fits mobile and desktop');
    await evaluate('document.querySelector(".wardrobe").scrollIntoView({block:"start",behavior:"instant"})');await delay(80);
    await screenshot(`figure-wardrobe-${theme}-${width}.png`);
  }
  console.log('PASS: daily 15m/1h/4h/1d revealed OHLC before and after replay; all four paper markets at all six timeframes in both themes; costume locks, unlocks, equip/reload and mobile wardrobe.');

  await command('Page.navigate',{url:'http://127.0.0.1:5188'});
  await until('document.getElementById("app")&&document.getElementById("theme-toggle")');
  await until('document.querySelector("[data-lesson]")');
  for(const width of [390,1440])for(const lesson of [19,20,21]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await evaluate(`location.hash='lesson/${lesson}'`);
    await until(`document.querySelector('.lesson-layout')&&document.body.innerText.includes('LESSON ${lesson} OF 21')`);
    for(let slide=0;slide<3;slide++){
      assert(await evaluate('Boolean(document.querySelector(".lesson-visual svg")&&document.querySelector(".worked-example"))'),'New lesson renders its diagram and worked example');
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'New lesson fits mobile and desktop');
      if(slide<2)await evaluate('document.querySelector("[data-slide=next]").click()');
    }
    await evaluate('document.querySelector("[data-slide=next]").click()');
    await until('document.querySelector("[data-answer]")');
    await evaluate('document.querySelector("[data-slide=restart]")?.click();location.hash="learn"');
    await until('document.querySelector(".lesson-search")');
    // Reset the saved slide so the next viewport starts at slide one.
    await evaluate(`(async()=>{const {saveSession}=await import('./trade-store.js');saveSession('lesson-${lesson-1}',{slide:0})})()`);
  }
  await mount('./trading-chart.js');
  assert.equal(await evaluate('testChart.series.data().length'),80,'Pages loads the bundled ESM library');
  assert.deepEqual(errors,[],'No browser errors');
  console.log('PASS: chart replay boundary, incremental candles/volume, native pan/zoom, draggable and locked levels, all drawing tools, timeframe anchors, image snapshots, themes, mobile sizing, disposal and Pages build.');
} finally { if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id:9999,method:'Browser.close'}));ws?.close();browser.kill();server.kill();preview.kill(); }


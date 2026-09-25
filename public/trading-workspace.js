import {TradingChart} from './trading-chart.js';
import {INSTRUMENTS,validateOrder,openTrade,advanceTrade,markToMarket,closeTrade,summarizeTrades} from './trade-engine.js';
import {loadAccount,getTrades,recordTrade,getSession,saveSession,saveAccount,updateTradeNotes} from './trade-store.js';
import {loadDaily,loadPaperMarket,paperQuote,requestService,serviceConfig,utcDay} from './market-data.js';

export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(n)||0);
const num=(n,d=2)=>Number.isFinite(n)?Number(n).toFixed(d):'—';
const stamp=t=>new Date(t*1000).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC';
const metric=(name,value,small='')=>`<div class="metric"><span>${name}</span><strong>${value}</strong>${small?`<small>${small}</small>`:''}</div>`;
const errorText=error=>escapeHTML(error.message||String(error));
function reviewText(trade){
  const words=String(trade.reasoning||'').trim().split(/\s+/).length;
  const risk=trade.initialRisk||Math.abs(trade.entry-trade.stopLoss)*trade.quantity;
  return `Your ${trade.side==='buy'?'long':'short'} plan risked ${money(risk)} for ${num(trade.plannedRR)}R of planned reward. The trade finished at ${money(trade.pnl)} (${num(trade.realizedR)}R). ${words<20?'Your explanation is brief. Next time, name the market structure, the entry trigger and the price that would invalidate the idea.':'Review whether the structure and trigger you described were visible before the trade. A detailed explanation is useful when it names evidence that could also disprove the idea.'} A profitable outcome does not by itself validate the reasoning. Compare your original plan with the result chart.`;
}
export function renderTrading(container,{mode='daily',progress,lessonCount,onToast=()=>{}}){
  let disposed=false,chart,timer,poller,data,instrument=INSTRUMENTS.BTC,trade=null,cursor=0,speed=1,side='buy',running=false,drawings=[],reasoning='',price=0,stale=false,sessionKey='',resultSaved=false,official=null,balance=loadAccount().balance;
  let generation=0;
  const q=s=>container.querySelector(s);
  const account=loadAccount();
  const completed=new Set(progress?.completed||[]);
  if(mode==='paper'&&Array.from({length:lessonCount},(_,i)=>i).some(id=>!completed.has(id))){
    container.innerHTML=`<div class="page-header"><div class="eyebrow">YOUR NEXT MILESTONE</div><h1>Paper trading</h1><p>Trade the markets with a $10,000 practice account after completing the learning path.</p></div><section class="unlock-card"><div class="unlock-icon">◇</div><h2>Build your foundation first</h2><p>${completed.size} of ${lessonCount} lessons complete. Finish the remaining knowledge checks to unlock BTC, US500, gold and GBP/USD.</p><div class="progress-track"><i style="width:${completed.size/lessonCount*100}%"></i></div><button class="btn primary" data-page="learn">Continue learning →</button><button class="btn" data-page="practice">Try the daily challenge</button></section>`;
    return()=>{};
  }
  container.innerHTML=`<div class="page-header"><div class="eyebrow">${mode==='daily'?'DAILY CHALLENGE':'PAPER TRADING'}</div><h1>${mode==='daily'?'One setup. Your decision.':'Your market workspace.'}</h1><p>${mode==='daily'?'Plan a trade, record your reasoning, then replay the next 24 hours.':'A $10,000 simulated account. Build consistency across four markets.'}</p></div><div id="workspace-body"><div class="empty-state">Loading market data…</div></div>`;
  async function load(symbol='BTC'){
    const token=++generation;clearInterval(timer);clearInterval(poller);chart?.destroy();chart=null;running=false;stale=false;trade=null;cursor=0;resultSaved=false;data=null;
    q('#workspace-body').innerHTML='<div class="empty-state">Loading market data…</div>';
    instrument=INSTRUMENTS[symbol];
    sessionKey=mode==='daily'?'daily-'+utcDay():'paper-'+symbol;
    const saved=getSession(sessionKey);
    try{
      let loaded=mode==='daily'?(saved?.data||await loadDaily()):await loadPaperMarket(symbol);
      if(disposed||token!==generation)return;
      if(mode==='paper'&&loaded.connected){
        const state=await requestService('/paper/state?symbol='+encodeURIComponent(symbol));
        if(disposed||token!==generation)return;
        balance=state.balance;
        loaded.price=state.quote.price;
        loaded.time=state.quote.time;
        for(const closed of state.trades||[])if(!getTrades().some(t=>t.id===closed.id))recordTrade({...closed,verified:true});
        if(state.trade?.status==='open'&&state.trade.instrument.id!==symbol){symbol=state.trade.instrument.id;instrument=INSTRUMENTS[symbol];sessionKey='paper-'+symbol;loaded=await loadPaperMarket(symbol);if(disposed||token!==generation)return;}
        if(state.trade?.status==='open'){trade=state.trade;const stored=getSession(sessionKey);reasoning=stored?.reasoning||trade.reasoning||'';drawings=stored?.drawings||[];}
        else if(state.trade?.status==='closed'&&!getTrades().some(t=>t.id===state.trade.id))recordTrade({...state.trade,source:loaded.source,verified:true});
      }
      data=loaded;
      if(mode==='daily'&&saved){({trade,cursor=0,speed=1,drawings=[],reasoning='',resultSaved=false,official=null}=saved);}
      if(mode==='daily'&&data.ranked&&data.submitted&&!trade){const result=await requestService('/daily/result');if(disposed||token!==generation)return;data.future=result.future;official=result.trade;trade=result.trade;cursor=result.future.length;resultSaved=true;reasoning=trade.reasoning||'';}
      if(mode==='paper'&&!data.connected&&saved?.trade?.status==='open'){trade=saved.trade;reasoning=saved.reasoning||'';drawings=saved.drawings||[];}
      price=mode==='daily'?visible().at(-1).close:data.price;
      if(trade)side=trade.side;
      render();
      if(mode==='daily'&&resultSaved&&trade&&!getTrades().some(t=>t.id===trade.id))recordTrade({...trade,snapshot:chart.snapshot(),drawings,reasoning,verified:true,source:data.source});
      if(mode==='paper')poller=setInterval(()=>tickPaper(token),data.demo?1000:8000);
    }catch(error){if(!disposed)q('#workspace-body').innerHTML=`<div class="empty-state"><h2>Market data is unavailable</h2><p>${errorText(error)}</p><button class="btn" data-page="${mode==='daily'?'practice':'paper'}">Try again</button></div>`;}
  }
  function persist(){if(!data)return;saveSession(sessionKey,{data:mode==='daily'?data:undefined,trade,cursor,speed,drawings,reasoning,resultSaved,official});}
  function visible(){return mode==='daily'?[...data.history,...(data.future||[]).slice(0,cursor)]:data.candles;}
  function formatPrice(value){return num(value,instrument.decimals);}
  function render(){
    chart?.destroy();chart=null;
    const hasTrade=!!trade;const available=mode==='daily'?10000:data.connected?balance:loadAccount().balance;
    q('#workspace-body').innerHTML=`<div class="account-bar"><span><b>${mode==='daily'?'Daily allocation':'Paper balance'}</b> ${money(available)}</span><span class="status-pill ${data.demo?'demo':'live'}">${escapeHTML(data.source)}</span><span id="feed-status">${mode==='daily'?escapeHTML(data.marketDate)+' · 15-minute candles':'Quotes refresh every 8 seconds'}</span></div>${mode==='paper'?`<div class="market-tabs">${Object.values(INSTRUMENTS).map(i=>`<button data-market="${i.id}" class="${i.id===instrument.id?'active':''}">${escapeHTML(i.label||i.id)}</button>`).join('')}</div>`:''}<div class="metric-strip">${metric('Last price',formatPrice(price),'USD quote')}${metric('Open P/L','<span id="trade-pnl">$0.00</span>','Updates with the market')}${metric('Planned R:R','<span id="planned-rr">—</span>','Reward ÷ initial risk')}${metric(mode==='daily'?'Replay progress':'Account mode',mode==='daily'?'<span id="replay-progress">0 / 96 bars</span>':data.demo?'Training feed':'Live quotes',mode==='daily'?'24-hour session':'Simulated execution')}</div><div class="terminal-grid"><div class="terminal-main"><section class="terminal-card"><div class="terminal-head"><div><b>${escapeHTML(instrument.label||instrument.id)}</b><span> ${mode==='daily'?'15m · Replay':'1m · Paper'}</span></div><span class="status-pill" id="position-status">${trade?trade.status==='closed'?'Closed':'Position open':'Ready to plan'}</span></div><div class="chart-toolbar"><div class="chart-tools"><button class="active" data-tool="cursor" title="Move and inspect chart">↖ Inspect</button><button data-tool="trend">╱ Trend line</button><button data-tool="horizontal">― Level</button><button data-tool="label">T Label</button><button id="clear-drawings">Clear</button></div><input id="chart-label" aria-label="Chart label text" maxlength="48" placeholder="Label text" value="My level"></div><div class="chart-area" id="trading-chart"></div><div class="replay-controls">${mode==='daily'?`<button class="btn primary" id="play-replay" ${!hasTrade||resultSaved?'disabled':''}>▶ ${cursor?'Resume':'Play replay'}</button><button class="btn" id="next-bar" ${!hasTrade||resultSaved?'disabled':''}>Next bar →</button><label>Speed <select id="replay-speed">${[1,2,5,10].map(n=>`<option ${speed===n?'selected':''} value="${n}">${n}×</option>`).join('')}</select></label><span id="replay-time">${stamp(visible().at(-1).time)}</span>`:`<span>${data.demo?'Synthetic prices for practising execution.':'Live market quotes with simulated fills.'}</span><button class="btn" id="close-position" ${trade?.status==='open'?'':'disabled'}>Close position</button>`}</div></section><section class="reasoning-panel"><div class="section-heading"><h3>${mode==='daily'?'Your trade thesis':'Trade notes'}</h3><span>${mode==='daily'?'Recorded before the reveal':'Saved in your journal'}</span></div><label for="trade-reasoning">Describe the structure, entry trigger and what would invalidate your idea.</label><textarea id="trade-reasoning" rows="4" maxlength="2500" placeholder="I see… My entry is based on… This idea would be wrong if…" ${hasTrade&&mode==='daily'?'readonly':''}>${escapeHTML(reasoning)}</textarea></section><div id="trade-review"></div></div><aside class="order-ticket"><div class="eyebrow">ORDER TICKET</div><h3>Plan your position</h3><div class="side-toggle"><button data-order-side="buy" class="${side==='buy'?'active':''}">Buy / Long</button><button data-order-side="sell" class="${side==='sell'?'active':''}">Sell / Short</button></div><div class="form-field"><label>Entry · current market</label><input id="order-entry" type="number" readonly></div><div class="form-field"><label for="order-stop">Stop loss</label><input id="order-stop" type="number" step="any"></div><div class="form-field"><label for="order-target">Take profit</label><input id="order-target" type="number" step="any"></div><div class="form-field"><label for="order-risk">Risk amount · USD</label><input id="order-risk" type="number" min="1" max="${mode==='daily'?100:Math.max(1,available)}" step="1" value="100"></div><p class="ticket-hint">Drag the SL and TP lines on the chart, or enter exact prices above.</p><div id="order-summary"></div><p id="order-error" role="alert"></p><button class="btn primary full" id="place-order" ${hasTrade||available<=0?'disabled':''}>${mode==='daily'?'Lock trade & start replay':'Open paper position'}</button><details class="execution-notes"><summary>How fills and results work</summary><p>Market entry at the displayed quote. Stop gaps fill at the next available open; targets fill at their level. If a replay candle touches both, the stop is counted first. Zero fees and spread in this simulation. P/L is in USD; one index point uses a $1 multiplier per unit.</p><p>${mode==='daily'?'One recorded attempt per UTC day in this browser. An online leaderboard uses server-checked results.':'Keep this workspace open for quote-based execution. Reopening reconciles completed candles; execution is approximate, especially across disconnections.'}</p></details>${data.demo?`<p class="connection-note">${escapeHTML(data.message||'This is a synthetic practice sample. It is excluded from online rankings.')}</p>`:''}</aside></div>`;
    chart=new TradingChart(q('#trading-chart'),{candles:visible(),symbol:instrument.id,decimals:instrument.decimals,drawings,onDrawingsChange:value=>{drawings=value;persist();},onLevelChange:levels=>{if(trade){setChartLevels();return;}q('#order-stop').value=formatPrice(levels.stopLoss);q('#order-target').value=formatPrice(levels.takeProfit);updateDraft();}});
    defaults();wire();updateUI();if(resultSaved)showResult();
    if(mode==='paper'&&!data.connected&&trade?.status==='open'){
      for(const bar of data.candles.filter(c=>c.time>trade.entryTime&&c.time+60<Date.now()/1000)){trade=advanceTrade(trade,bar);if(trade.status==='closed')break;}
      if(trade.status==='closed')finish();else persist();
    }
  }
  function defaults(){
    const delta=price*(instrument.id==='GBPUSD'?.001:.003);
    q('#order-entry').value=formatPrice(trade?.entry??price);
    q('#order-stop').value=formatPrice(trade?.stopLoss??price+(side==='buy'?-delta:delta));
    q('#order-target').value=formatPrice(trade?.takeProfit??price+(side==='buy'?delta*2:-delta*2));
    if(trade)q('#order-risk').value=num(trade.initialRisk,2);
    for(const el of container.querySelectorAll('[data-order-side],#order-stop,#order-target,#order-risk'))el.disabled=!!trade;
    updateDraft();
  }
  function draft(){const entry=mode==='daily'?data.history.at(-1).close:Number(q('#order-entry').value),stopLoss=Number(q('#order-stop').value),takeProfit=Number(q('#order-target').value),risk=Number(q('#order-risk').value);return{side,entry,stopLoss,takeProfit,quantity:risk/Math.abs(entry-stopLoss)};}
  function setChartLevels(){const order=trade||draft();chart?.setLevels({entry:order.entry,stopLoss:order.stopLoss,takeProfit:order.takeProfit},{editable:!trade});}
  function updateDraft(){
    const o=draft(),errors=validateOrder(o);const risk=Number(q('#order-risk').value);
    if(!Number.isFinite(risk)||risk<=0)errors.push('Enter a positive risk amount.');
    if(mode==='daily'&&risk>100)errors.push('Daily challenge risk is capped at $100.');
    q('#order-error').textContent=errors[0]||'';
    q('#planned-rr').textContent=errors.length?'—':num(Math.abs(o.takeProfit-o.entry)/Math.abs(o.entry-o.stopLoss))+':1';
    q('#order-summary').innerHTML=errors.length?'':`<div class="ticket-row"><span>Quantity</span><b>${num(o.quantity,4)}</b></div><div class="ticket-row"><span>Planned loss</span><b>${money(risk)}</b></div><div class="ticket-row"><span>Planned reward</span><b>${money(Math.abs(o.takeProfit-o.entry)*o.quantity)}</b></div>`;
    setChartLevels();
  }
  function wire(){
    container.querySelectorAll('[data-market]').forEach(b=>b.onclick=()=>{persist();load(b.dataset.market);});
    container.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{container.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x===b));chart.setLabel(q('#chart-label').value);chart.setTool(b.dataset.tool);});
    q('#chart-label').oninput=()=>chart.setLabel(q('#chart-label').value);
    q('#clear-drawings').onclick=()=>chart.clearDrawings();
    container.querySelectorAll('[data-order-side]').forEach(b=>b.onclick=()=>{if(trade)return;side=b.dataset.orderSide;container.querySelectorAll('[data-order-side]').forEach(x=>x.classList.toggle('active',x===b));defaults();});
    ['#order-stop','#order-target','#order-risk'].forEach(s=>q(s).oninput=updateDraft);
    q('#trade-reasoning').oninput=()=>{reasoning=q('#trade-reasoning').value;persist();};
    q('#place-order').onclick=place;
    if(mode==='daily'){
      q('#play-replay').onclick=()=>{running?pause():play();};q('#next-bar').onclick=()=>{pause();step();};
      q('#replay-speed').onchange=()=>{speed=Number(q('#replay-speed').value);persist();if(running){pause();play();}};
    }else q('#close-position').onclick=async()=>{if(trade?.status!=='open'||stale)return;const button=q('#close-position');button.disabled=true;try{if(data.connected){const result=await requestService('/paper/close',{});official=result.trade;trade=result.trade;price=result.quote.price;balance=result.balance;}else trade=closeTrade(trade,price,Date.now()/1000,'manual');finish();}catch(error){onToast(error.message);button.disabled=false;}};
  }
  async function place(){
    if(trade||stale)return;const order=draft();const risk=Number(q('#order-risk').value);const errors=validateOrder(order);
    if(!Number.isFinite(risk)||risk<=0||risk>(mode==='daily'?100:data.connected?balance:loadAccount().balance))errors.push('Risk amount exceeds your available allocation.');
    reasoning=q('#trade-reasoning').value.trim();if(mode==='daily'&&reasoning.length<30)errors.push('Write at least 30 characters explaining your trade before the reveal.');
    if(errors.length){q('#order-error').textContent=errors[0];return;}
    q('#place-order').disabled=true;
    try{
      if(mode==='daily'&&data.ranked){const result=await requestService('/daily/submit',{challengeId:data.id,order,reasoning,displayName:loadAccount().displayName});data.future=result.future;official=result.trade;}
      if(mode==='paper'&&data.connected){const result=await requestService('/paper/open',{symbol:instrument.id,order,reasoning,displayName:loadAccount().displayName});trade=result.trade;price=result.quote.price;balance=result.balance;}
      else trade=openTrade(order,{instrument,mode,challengeId:data.id,time:mode==='daily'?data.history.at(-1).time:Date.now()/1000,reasoning,balance:mode==='daily'?10000:loadAccount().balance});
      if(mode==='daily'&&official)trade.id=official.id;
      trade.source=data.source;trade.demo=!!data.demo;
      persist();render();if(mode==='daily')play();
    }catch(error){q('#order-error').textContent=error.message;q('#place-order').disabled=false;}
  }
  function pause(){running=false;clearInterval(timer);if(q('#play-replay'))q('#play-replay').textContent='▶ Resume';}
  function play(){if(!trade||resultSaved)return;running=true;q('#play-replay').textContent='Ⅱ Pause';clearInterval(timer);timer=setInterval(step,1000/speed);}
  function step(){
    if(disposed||resultSaved||!trade)return;
    const bar=data.future?.[cursor];if(!bar)return;cursor++;price=bar.close;
    if(trade.status==='open')trade=advanceTrade(trade,bar);
    chart.setData(visible());updateUI();persist();
    if(cursor>=data.future.length){if(trade.status==='open')trade=closeTrade(trade,bar.close,bar.time,'session-end');finish();}
  }
  function updateUI(){
    if(!q('#trade-pnl'))return;
    const pnl=trade?(trade.status==='closed'?trade.pnl:markToMarket(trade,price)):0;
    q('#trade-pnl').textContent=money(pnl);q('#trade-pnl').className=pnl<0?'negative':'positive';
    const last=container.querySelector('.metric-strip .metric strong');if(last)last.textContent=formatPrice(price);
    q('#position-status').textContent=trade?(trade.status==='open'?'Position open':'Closed · '+(trade.exitReason||'')):'Ready to plan';
    if(mode==='daily'){q('#replay-progress').textContent=`${cursor} / ${data.future?.length||96} bars`;q('#replay-time').textContent=stamp(visible().at(-1).time);}
  }
  async function tickPaper(token){
    if(disposed||token!==generation)return;
    try{
      let quote;
      if(data.demo){const wave=Math.sin(Date.now()/13000)*.00013+(Math.random()-.5)*.0002;quote={price:price*(1+wave),time:Date.now()/1000};}
      else if(data.connected){const state=await requestService('/paper/state?symbol='+encodeURIComponent(instrument.id));quote=state.quote;balance=state.balance;if(state.trade?.status==='open')trade=state.trade;else if(state.trade?.status==='closed'&&trade?.status==='open'){official=state.trade;trade=state.trade;}else if(!state.trade&&trade?.status==='open'){const closed=state.trades?.find(t=>t.id===trade.id);if(closed){official=closed;trade=closed;}}}
      else quote=await paperQuote(instrument.id);
      if(disposed||token!==generation)return;
      price=quote.price;stale=false;q('#feed-status').textContent=(data.demo?'Training tick · ':'Last quote · ')+stamp(quote.time);
      if(data.connected)q('.account-bar span').innerHTML='<b>Paper balance</b> '+money(balance);
      const bucket=Math.floor(quote.time/60)*60,last=data.candles.at(-1);
      if(last.time===bucket){last.high=Math.max(last.high,price);last.low=Math.min(last.low,price);last.close=price;}else data.candles.push({time:bucket,open:last.close,high:Math.max(last.close,price),low:Math.min(last.close,price),close:price,volume:0});
      data.candles=data.candles.slice(-180);chart.setData(data.candles);
      if(trade?.status==='open'&&!data.connected){trade=advanceTrade(trade,{time:quote.time,open:price,high:price,low:price,close:price,volume:0});if(trade.status==='closed')finish();}
      else if(trade?.status==='closed'&&!resultSaved)finish();
      else if(!trade){q('#order-entry').value=formatPrice(price);updateDraft();}
      updateUI();persist();
    }catch(error){if(disposed||token!==generation)return;stale=true;q('#feed-status').textContent=error.message;onToast('Quotes interrupted. New orders are paused.');}
  }
  function finish(){
    if(resultSaved)return;pause();resultSaved=true;
    trade={...trade,snapshot:chart.snapshot(),drawings,reasoning,source:data.source,demo:!!data.demo,verified:!!official,challengeId:data.id||null};
    if(official)trade={...trade,pnl:official.pnl,realizedR:official.realizedR,exitReason:official.exitReason,exitPrice:official.exitPrice,exitTime:official.exitTime};
    recordTrade(trade);persist();updateUI();
    if(mode==='daily'){q('#play-replay').disabled=true;q('#next-bar').disabled=true;}else q('#close-position').disabled=true;
    showResult();onToast('Trade saved to your journal.');
  }
  function showResult(){
    const pnl=Number(trade.pnl)||0;
    q('#trade-review').innerHTML=`<section class="trade-results"><div class="eyebrow">${mode==='daily'?'SESSION COMPLETE':'TRADE CLOSED'}</div><h2 class="${pnl<0?'negative':'positive'}">${money(pnl)}</h2><div class="metric-strip">${metric('Realised R',num(trade.realizedR)+'R')}${metric('Exit',escapeHTML(trade.exitReason))}${metric('Direction',trade.side==='buy'?'Long':'Short')}</div><div class="result-actions"><button class="btn primary" data-page="journal">View trade journal →</button><button class="btn" data-page="leaderboard">View leaderboard</button>${mode==='paper'?'<button class="btn" id="new-paper-trade">New trade</button>':''}</div></section>${mode==='daily'?`<section class="review-panel"><div class="section-heading"><h3>Trade review</h3><span id="coach-mode">Structured review</span></div><div class="coach-message" id="coach-output">${escapeHTML(reviewText(trade))}</div><p class="ticket-hint">AI feedback becomes available when the online coach is connected.</p><form id="coach-form"><label for="coach-question">Ask about this trade</label><div class="form-row"><input id="coach-question" maxlength="600" placeholder="How could I improve my reasoning?"><button class="btn" type="submit">Ask coach</button></div></form></section>`:''}`;
    if(mode==='paper'){q('#new-paper-trade').onclick=()=>{trade=null;resultSaved=false;drawings=[];reasoning='';persist();render();};return;}
    q('#coach-form').onsubmit=async event=>{event.preventDefault();const question=q('#coach-question').value.trim();if(!question)return;const button=q('#coach-form button');button.disabled=true;
      try{const result=await requestService('/coach',{tradeId:official?.id,trade,question});if(disposed)return;q('#coach-mode').textContent='AI trade coach';q('#coach-output').textContent=result.text;}
      catch(error){if(!disposed){q('#coach-mode').textContent='Structured review · AI offline';q('#coach-output').textContent=reviewText(trade)+' Online AI feedback is not connected yet.';}}
      finally{if(!disposed)button.disabled=false;}
    };
  }
  load();return()=>{disposed=true;generation++;clearInterval(timer);clearInterval(poller);persist();chart?.destroy();};
}

function exportTrades(trades){
  const fields=['id','mode','instrument','side','entryTime','entry','stopLoss','takeProfit','quantity','exitTime','exitPrice','exitReason','pnl','plannedRR','realizedR','reasoning','notes'];
  const csv=[fields.join(','),...trades.map(t=>fields.map(k=>'"'+String(k==='instrument'?t.instrument?.id:t[k]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='wicklume-trades-'+utcDay()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function renderJournal(container){
  let filter='all';
  function render(){
    const all=getTrades(),trades=all.filter(t=>filter==='all'||t.mode===filter),stats=summarizeTrades(trades),recent=[...trades].sort((a,b)=>b.exitTime-a.exitTime).slice(0,10);
    const points=trades.slice().sort((a,b)=>a.exitTime-b.exitTime).reduce((a,t)=>{a.push(a.at(-1)+t.pnl);return a;},[0]);const low=Math.min(...points,0),high=Math.max(...points,1),range=Math.max(1,high-low);const path=points.map((p,i)=>`${i?'L':'M'}${20+i/Math.max(1,points.length-1)*720} ${150-(p-low)/range*120}`).join(' ');
    container.innerHTML=`<div class="page-header"><div class="eyebrow">TRADE JOURNAL</div><h1>Turn experience into evidence.</h1><p>Your last ten trades in detail, with performance across your full history.</p></div><div class="section-heading"><div class="market-tabs">${['all','daily','paper'].map(x=>`<button data-filter="${x}" class="${x===filter?'active':''}">${x==='all'?'All trades':x==='daily'?'Daily challenge':'Paper trading'}</button>`).join('')}</div><button class="btn" id="export-journal" ${all.length?'':'disabled'}>Export CSV ↓</button></div><div class="stat-grid">${metric('Net P/L',money(stats.netPnl))}${metric('Win rate',num(stats.winRate)+'%')}${metric('Average realised R',num(stats.avgR)+'R')}${metric('Average planned R:R',num(stats.avgPlannedRR)+':1')}${metric('Profit factor',Number.isFinite(stats.profitFactor)?num(stats.profitFactor):stats.wins?'∞':'—')}${metric('Max drawdown',money(stats.maxDrawdown))}</div><section class="terminal-card equity-chart"><div class="terminal-head"><b>Cumulative P/L</b><span>${trades.length} closed trades · USD</span></div><svg viewBox="0 0 760 180" role="img" aria-label="Cumulative realised profit and loss"><path d="M20 150H740" stroke="#334155"/><path d="${path}" fill="none" stroke="#39d6b5" stroke-width="3"/><text x="20" y="173" fill="#94a3b8" font-size="11">First trade</text><text x="700" y="173" fill="#94a3b8" font-size="11">Latest</text></svg></section>${recent.length?`<div class="section-heading"><h2>Recent trades</h2><span>Showing ${recent.length} of ${trades.length}</span></div><div class="journal-grid">${recent.map(t=>`<article class="journal-card"><div class="section-heading"><h3>${escapeHTML(t.instrument?.label||t.instrument?.id||'Market')} <span class="status-pill">${t.side==='buy'?'LONG':'SHORT'}</span></h3><strong class="${t.pnl<0?'negative':'positive'}">${money(t.pnl)}</strong></div><p>${stamp(t.entryTime)} · ${t.mode==='daily'?'Daily challenge':'Paper trading'}${t.demo?' · Synthetic sample':''}</p>${t.snapshot?`<img class="journal-snapshot" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(t.snapshot)}" alt="Saved chart with trade levels and annotations">`:''}<div class="journal-trade-details"><span>Entry <b>${num(t.entry,t.instrument?.decimals||2)}</b></span><span>Exit <b>${num(t.exitPrice,t.instrument?.decimals||2)}</b></span><span>Stop <b>${num(t.stopLoss,t.instrument?.decimals||2)}</b></span><span>Target <b>${num(t.takeProfit,t.instrument?.decimals||2)}</b></span><span>Result <b>${num(t.realizedR)}R</b></span><span>Exit reason <b>${escapeHTML(t.exitReason)}</b></span></div><h4>Original reasoning</h4><p class="journal-reasoning">${escapeHTML(t.reasoning||'No reasoning recorded.')}</p><label for="notes-${escapeHTML(t.id)}">Review notes</label><textarea id="notes-${escapeHTML(t.id)}" data-notes="${escapeHTML(t.id)}" rows="3" maxlength="2500" placeholder="What went well? What would you change?">${escapeHTML(t.notes||'')}</textarea><small>Notes save when you leave this field.</small></article>`).join('')}</div>`:`<section class="empty-state"><h2>Your first trade starts the story.</h2><p>Complete a daily replay or close a paper position to see the chart, notes and result here.</p><button class="btn primary" data-page="practice">Open daily challenge →</button></section>`}`;
    container.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});container.querySelector('#export-journal').onclick=()=>exportTrades(trades);container.querySelectorAll('[data-notes]').forEach(input=>input.onchange=()=>updateTradeNotes(input.dataset.notes,input.value));
  }render();return()=>{};
}

export function renderLeaderboard(container){
  let disposed=false,mode='daily';
  async function render(){
    const account=loadAccount(),daily=getTrades().filter(t=>t.mode==='daily'&&t.challengeId?.startsWith(utcDay())),paper=getTrades().filter(t=>t.mode==='paper');
    container.innerHTML=`<div class="page-header"><div class="eyebrow">LEADERBOARDS</div><h1>Consistency over one lucky trade.</h1><p>Daily challenge results and accumulated paper performance.</p></div><div class="section-heading"><div class="market-tabs"><button data-board="daily" class="${mode==='daily'?'active':''}">Daily challenge</button><button data-board="paper" class="${mode==='paper'?'active':''}">Paper trading</button></div><span class="status-pill">${utcDay()} UTC</span></div><section class="terminal-card"><div class="terminal-head"><b>Online leaderboard</b><span>Verified results</span></div><div id="online-board" class="empty-state">Checking connection…</div></section><section class="settings-panel"><label for="display-name">Your display name</label><div class="form-row"><input id="display-name" maxlength="24" value="${escapeHTML(account.displayName||'You')}"><button class="btn" id="save-name">Save name</button></div><small>Local records remain in this browser until an online account service is connected.</small></section><section class="terminal-card"><div class="terminal-head"><b>Your browser records</b><span>${mode==='daily'?'Today’s attempt':'All closed paper trades'}</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Trader</th><th>Trades</th><th>P/L</th><th>Win rate</th><th>Average R</th></tr></thead><tbody>${(mode==='daily'?daily:paper).length?(()=>{const s=summarizeTrades(mode==='daily'?daily:paper);return`<tr><td>${escapeHTML(account.displayName||'You')}</td><td>${s.count}</td><td>${money(s.netPnl)}</td><td>${num(s.winRate)}%</td><td>${num(s.avgR)}R</td></tr>`;})():'<tr><td colspan="5">No completed trades in this category yet.</td></tr>'}</tbody></table></div></section>`;
    container.querySelectorAll('[data-board]').forEach(b=>b.onclick=()=>{mode=b.dataset.board;render();});container.querySelector('#save-name').onclick=()=>{const value=container.querySelector('#display-name').value.trim().slice(0,24)||'You';saveAccount({...loadAccount(),displayName:value});render();};
    try{const value=await requestService('/leaderboard?mode='+mode);if(disposed)return;container.querySelector('#online-board').className='table-scroll';container.querySelector('#online-board').innerHTML=value.entries?.length?`<table class="data-table"><thead><tr><th>Rank</th><th>Trader</th><th>P/L</th><th>Realised R</th></tr></thead><tbody>${value.entries.map((e,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(e.displayName)}</td><td>${money(e.pnl)}</td><td>${num(e.realizedR)}R</td></tr>`).join('')}</tbody></table>`:`<h3>No verified results yet.</h3><p>${mode==='paper'?'Shared paper rankings require server-managed execution.':'Be the first to complete today’s connected challenge.'}</p>`;}
    catch{if(!disposed)container.querySelector('#online-board').innerHTML='<h3>Online rankings are not connected yet.</h3><p>Your own results are tracked below. A shared service is needed to compare verified scores across traders.</p>';}
  }render();return()=>{disposed=true;};
}

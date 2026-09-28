import { TIMEFRAMES, aggregateCandles } from './timeframes.js';

const DAY=86400;
let runtime, runtimeRequest, sessionRequest, guestToken, signedIn=false;
export function setServiceAccount(account){signedIn=Boolean(account);}
export async function serviceConfig(){
  if(runtime)return runtime;
  if(!runtimeRequest)runtimeRequest=(async()=>{
    let config;
    try{const r=await fetch(new URL('./runtime-config.json',import.meta.url),{signal:AbortSignal.timeout(8000)});config=r.ok?await r.json():{};}catch{config={};}
    if(!config||typeof config!=='object'||Array.isArray(config))config={};
    if(typeof window!=='undefined'&&!window.__WICKLUME_STATIC__&&!config.apiBase)config.apiBase=location.origin;
    config.apiBase=String(config.apiBase||'').replace(/\/$/,'');
    runtime=config;return runtime;
  })();
  return runtimeRequest;
}
async function guestSession(config){
  if(!guestToken)try{guestToken=localStorage.getItem('wicklume-service-token');}catch{/* Continue with an in-memory session when storage is blocked. */}
  if(guestToken)return guestToken;
  if(!sessionRequest)sessionRequest=(async()=>{
    const r=await fetch(config.apiBase+'/api/trading/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});
    const value=await r.json();if(!r.ok)throw Error(value.error||'Unable to connect');
    guestToken=value.token;
    try{localStorage.setItem('wicklume-service-token',guestToken);}catch{/* Retain this tab's session. */}
    return guestToken;
  })().finally(()=>{sessionRequest=null;});
  return sessionRequest;
}
export async function requestService(path,body,retried=false){
  const config=await serviceConfig();
  if(!config.apiBase)throw Error('The online service is not connected yet.');
  const token=signedIn||path==='/config'?null:await guestSession(config);
  const r=await fetch(config.apiBase+'/api/trading'+path,{method:body?'POST':'GET',credentials:'include',headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='/coach'?35000:15000)});
  const value=await r.json();
  if(r.status===401&&!signedIn&&!retried&&/^(This session has expired|Connect your learning session)/.test(value.error||'')){
    if(guestToken===token){guestToken=null;try{localStorage.removeItem('wicklume-service-token');}catch{/* Renew the in-memory session. */}}
    return requestService(path,body,true);
  }
  if(!r.ok)throw Error(value.error||'Online service unavailable');return value;
}
export function utcDay(now=Date.now()){return new Date(now).toISOString().slice(0,10);}
function random(seed){let n=[...seed].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7);return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function demoCandles(symbol='BTC',start=Math.floor(Date.now()/1000)-144*900,count=144,interval=900,seed=utcDay()){
  const rng=random(symbol+seed),base={BTC:62000,US500:5400,XAUUSD:2450,GBPUSD:1.28}[symbol]||100;
  let price=base;return Array.from({length:count},(_,i)=>{const open=price;const move=(rng()-.49)*base*.003;price=Math.max(base*.1,open+move);return{time:start+i*interval,open,high:Math.max(open,price)+rng()*base*.001,low:Math.min(open,price)-rng()*base*.001,close:price,volume:10+rng()*100};});
}

export const TRAINING_FEED_VERSION = 2;
export const TRAINING_BASES = Object.freeze({ BTC:62000, US500:5400, XAUUSD:2450, GBPUSD:1.28 });

/** Zero-mean, gently mean-reverting training returns. These are never market history. */
export function trainingCandles(symbol,start,count,seed=utcDay()){
  const rng=random(symbol+seed),base=TRAINING_BASES[symbol]||100;
  const volatility={BTC:.0006,US500:.00025,XAUUSD:.00035,GBPUSD:.00016}[symbol]||.00025;
  let price=base;
  return Array.from({length:count},(_,i)=>{
    const open=price,noise=rng()+rng()+rng()-1.5;
    price=Math.exp(Math.log(open)-.00005*Math.log(open/base)+noise*volatility);
    return{time:start+i*60,open,high:Math.max(open,price)*Math.exp(rng()*volatility*.5),
      low:Math.min(open,price)*Math.exp(-rng()*volatility*.5),close:price,volume:10+rng()*100};
  });
}
export async function coinbaseCandles(start,end,granularity=900){
  const params=new URLSearchParams({start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString(),granularity:String(granularity)});
  const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/candles?'+params,{signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('Historical BTC feed unavailable');
  const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid market data');
  return rows.map(([time,low,high,open,close,volume])=>({time,open,high,low,close,volume})).filter(c=>c.time>=start&&c.time<end&&[c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}
export async function coinbaseChartCandles(timeframe,now=Date.now()){
  const seconds=TIMEFRAMES[timeframe];
  if(!seconds)throw Error('Unsupported chart timeframe.');
  const granularity=timeframe==='4h'?3600:seconds;
  const count=timeframe==='4h'?240:180;
  const current=Math.floor(now/1000),start=Math.floor(current/granularity)*granularity-(count-1)*granularity;
  const candles=await coinbaseCandles(start,current+1,granularity);
  if(candles.length<2)throw Error('The selected BTC timeframe is unavailable.');
  return timeframe==='4h'?aggregateCandles(candles,seconds):candles;
}
export async function previousDayChallenge(now=Date.now(),allowDemo=true){
  const day=utcDay(now),end=Date.parse(day+'T00:00:00Z')/1000,start=end-DAY;
  let candles,source='Coinbase · historical BTC/USD',demo=false;
  try{candles=await coinbaseCandles(start-12*3600,end);if(candles.length!==144||candles.some((c,i)=>i&&c.time-candles[i-1].time!==900))throw Error('Incomplete historical session');}
  catch(error){if(!allowDemo)throw error;demo=true;source='Synthetic training sample · market feed unavailable';candles=demoCandles('BTC',start-12*3600,144,900,day);}
  return{id:day+'-BTC-15m'+(demo?'-demo':''),day,marketDate:utcDay(start*1000),instrument:'BTC',interval:900,history:candles.slice(0,48),future:candles.slice(48),source,demo,selection:'Fixed UTC session; selected before inspecting the outcome'};
}
export function trainingChallenge(now=Date.now()){
  const day=utcDay(now),end=Date.parse(day+'T00:00:00Z')/1000,start=end-DAY;
  const candles=demoCandles('BTC',start-12*3600,144,900,day);
  return{id:day+'-BTC-15m-demo',day,marketDate:utcDay(start*1000),instrument:'BTC',interval:900,history:candles.slice(0,48),future:candles.slice(48),source:'Synthetic training sample',demo:true,ranked:false,selection:'Synthetic candles for offline practice; excluded from verified rankings'};
}
export async function loadDaily(){
  const config=await serviceConfig();
  if(config.apiBase){try{return await requestService('/challenge');}catch(error){const value=await previousDayChallenge();return{...value,serviceError:error.message,ranked:false};}}
  return{...await previousDayChallenge(),ranked:false};
}
export async function loadDailyContext(challenge){
  const end=challenge.history[0].time,start=end-240*3600;
  if(challenge.demo){
    const sample=demoCandles('BTC',start,240,3600,challenge.day+'-context');
    const factor=challenge.history[0].open/sample.at(-1).close;
    return sample.map(c=>({time:c.time,open:c.open*factor,high:c.high*factor,low:c.low*factor,close:c.close*factor,volume:c.volume}));
  }
  const candles=await coinbaseCandles(start,end,3600);
  if(candles.length<24)throw Error('Earlier BTC context is unavailable.');
  return candles;
}
export async function loadPaperMarket(symbol){
  const config=await serviceConfig();
  if(config.apiBase){try{return {...await requestService('/market?symbol='+encodeURIComponent(symbol)),connected:true};}catch(error){if(symbol!=='BTC')return demoMarket(symbol,error.message);}}
  if(symbol==='BTC'){
    try{const now=Math.floor(Date.now()/1000);const candles=await coinbaseCandles(now-120*60,now,60);const quote=await btcQuote();return{candles,...quote,source:'Coinbase · BTC/USD',demo:false,interval:60};}catch(error){return demoMarket(symbol,error.message);}
  }
  return demoMarket(symbol,'A market-data connection is needed for this instrument.');
}
export async function loadPaperTimeframe(symbol,timeframe,market){
  if(!TIMEFRAMES[timeframe])throw Error('Unsupported chart timeframe.');
  if(timeframe==='1m')return market.candles.slice(-180);
  if(market.demo)return aggregateCandles(market.candles,TIMEFRAMES[timeframe]).slice(-180);
  if(market.connected){const value=await requestService('/market?symbol='+encodeURIComponent(symbol)+'&timeframe='+encodeURIComponent(timeframe));return value.candles;}
  if(symbol==='BTC')return coinbaseChartCandles(timeframe);
  throw Error('This chart timeframe needs a connected market-data provider.');
}
export function demoMarket(symbol,message='',nowMs=Date.now(),legacy=false){
  const now=Math.floor(nowMs/60000)*60;
  // Fixed day start makes overlapping history stable when a workspace is reloaded within the day.
  const start=Math.floor(now/DAY)*DAY-30*DAY,count=Math.floor((now-start)/60)+1;
  const candles=legacy?demoCandles(symbol,now-(30*24*60-1)*60,30*24*60,60,utcDay(nowMs))
    :trainingCandles(symbol,start,count,utcDay(nowMs));
  return{candles,price:candles.at(-1).close,time:now,source:legacy?'Legacy synthetic training feed':'Synthetic training feed',demo:true,
    feedVersion:legacy?1:TRAINING_FEED_VERSION,interval:60,message};
}
export async function btcQuote(){
  const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker',{signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('Live quote connection interrupted');
  const value=await r.json();const price=Number(value.price),time=Date.parse(value.time)/1000;
  if(!Number.isFinite(price)||!Number.isFinite(time)||Date.now()/1000-time>120)throw Error('Quote is stale. New orders are paused.');return{price,time};
}
export async function paperQuote(symbol,connected=false){
  if(connected)return requestService('/quote?symbol='+encodeURIComponent(symbol));
  if(symbol==='BTC')return btcQuote();throw Error('Live feed is not connected for this market.');
}

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {demoMarket,TRAINING_BASES,trainingCandles,coinbaseChartCandles} from './public/market-data.js';
import {aggregateCandles,TIMEFRAMES} from './public/timeframes.js';

test('month-long training data has no artificial upward drift across any market',()=>{
  for(const [symbol,base] of Object.entries(TRAINING_BASES)){
    let total=0;
    for(let seed=0;seed<12;seed++){
      const candles=trainingCandles(symbol,1800000000,30*1440,'regression-'+seed);
      total+=candles.at(-1).close/base;
      assert(candles.every(c=>c.low>base*.7&&c.high<base*1.3),'Synthetic prices remain bounded around the training reference');
      assert(candles.every((c,i)=>c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&(!i||c.open===candles[i-1].close)));
    }
    assert(Math.abs(total/12-1)<.025,'Several seeds must not produce a systematic upward month');
  }
});

test('all synthetic timeframes share stable overlapping history and exact daily OHLC',()=>{
  const before=Date.parse('2026-09-28T12:00:00Z'),after=before+60000;
  for(const symbol of Object.keys(TRAINING_BASES)){
    const first=demoMarket(symbol,'',before),next=demoMarket(symbol,'',after);
    assert.equal(first.feedVersion,2);
    assert.deepEqual(next.candles.slice(0,-1),first.candles,'Reloading one minute later retains existing candles');
    for(const interval of Object.values(TIMEFRAMES)){
      const candles=aggregateCandles(first.candles,interval);
      assert.equal(candles.at(-1).close,first.price);
      assert(candles.every(c=>c.time%interval===0));
    }
    const daily=aggregateCandles(first.candles,86400);
    assert.equal(daily.length,31);
    assert.equal(daily[0].open,TRAINING_BASES[symbol]);
    const lastInput=first.candles.filter(c=>c.time>=daily.at(-1).time);
    assert.equal(daily.at(-1).high,Math.max(...lastInput.map(c=>c.high)));
    assert.equal(daily.at(-1).low,Math.min(...lastInput.map(c=>c.low)));
    assert.equal(daily.at(-1).open,lastInput[0].open);
  }
});

test('the old synthetic series remains available only to continue existing positions',()=>{
  const now=Date.parse('2026-09-28T12:00:00Z');
  const current=demoMarket('US500','',now),old=demoMarket('US500','',now,true);
  assert.equal(old.feedVersion,1);
  assert.equal(old.candles.length,43200);
  assert(old.price>10000,'Keep the precise old price path for open positions, without silently repricing them');
  assert(current.price>5000&&current.price<6000);
});

test('Coinbase parser retains exact provider OHLC, excludes future rows and aggregates only 4h',async()=>{
  const original=globalThis.fetch,now=Date.parse('2026-09-28T12:05:00Z');
  try{
    for(const timeframe of Object.keys(TIMEFRAMES)){
      let input;
      globalThis.fetch=async url=>{
        const parsed=new URL(url),step=Number(parsed.searchParams.get('granularity'));
        assert.equal(step,timeframe==='4h'?3600:TIMEFRAMES[timeframe]);
        const end=Date.parse(parsed.searchParams.get('end'))/1000;
        const last=Math.floor((end-1)/step)*step;
        input=Array.from({length:20},(_,i)=>({time:last-(19-i)*step,open:60000+i,high:60010+i,low:59995+i,close:60003+i,volume:5+i}));
        const rows=[...input,{time:end+step,open:900000,high:900010,low:899995,close:900003,volume:999}].reverse().map(c=>[c.time,c.low,c.high,c.open,c.close,c.volume]);
        return Response.json(rows);
      };
      const chart=await coinbaseChartCandles(timeframe,now);
      assert.deepEqual(chart,timeframe==='4h'?aggregateCandles(input,14400):input);
      assert(chart.every(c=>c.time<=now/1000),'No future provider candle reaches the chart');
    }
  }finally{globalThis.fetch=original;}
});

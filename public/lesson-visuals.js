// All examples use invented prices. Each SVG is a teaching diagram, not market data.
const green = '#4fd1b5', red = '#f17b8d', cyan = '#65b9f5', muted = '#a6b8cf';
const label = (x, y, value, color = muted, size = 12, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" font-family="Inter,Segoe UI,sans-serif">${value}</text>`;
const line = (x1, y1, x2, y2, color = '#304257', dash = '') =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const box = (x, y, w, h, fill = '#152235', stroke = '#334d65', radius = 8) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const visual = (title, body, caption) => `<figure class="lesson-visual"><div class="visual-title">${title}<span>ILLUSTRATED MARKET STUDY</span></div><svg viewBox="0 0 760 330" role="img" aria-label="${caption}"><desc>${caption} Invented prices for learning; not a market forecast.</desc>${body}</svg><figcaption>${caption}</figcaption></figure>`;

function candle(x, open, high, low, close, scale = value => 285 - (value - 94) * 11, width = 17) {
  const color = close >= open ? green : red;
  const top = Math.min(scale(open), scale(close));
  const height = Math.max(3, Math.abs(scale(open) - scale(close)));
  return `<g stroke="${color}" fill="${color}">${line(x, scale(high), x, scale(low), color)}<rect x="${x - width / 2}" y="${top}" width="${width}" height="${height}" rx="2"/></g>`;
}
function candles(values, x0 = 78, step = 42, scale = value => 285 - (value - 94) * 11) {
  return values.map((close, i) => {
    const open = i ? values[i - 1] : close - 1;
    return candle(x0 + i * step, open, Math.max(open, close) + 1.1 + (i % 3) * .3,
      Math.min(open, close) - 1 - (i % 2) * .4, close, scale);
  }).join('');
}
function grid(min = 94, max = 114, y = value => 285 - (value - 94) * 11) {
  const ticks = [96, 100, 104, 108, 112].filter(value => value >= min && value <= max);
  return `${label(42,24,'ILLUSTRATIVE PRICE', '#6f87a3',9)}${ticks.map(value => `<path d="M40 ${y(value)}H654" stroke="#27364b" stroke-width="1"/>${label(672, y(value) + 4, value, '#8ca3bf', 11)}`).join('')}${line(654,35,654,286,'#27364b')}${line(40,286,654,286,'#27364b')}`;
}
function priceChart(title, values, caption, extras = '') {
  const times = ['09:00','09:45','10:30','11:15','12:00'];
  return visual(title, grid() + extras + candles(values) + times.map((time,i)=>label(78+i*126,309,time,'#7991ae',10,'middle')).join(''), caption);
}
function singleCandle(open, high, low, close, x, name) {
  const scale = value => 272 - (value - 94) * 13;
  return `${candle(x, open, high, low, close, scale, 52)}${label(x, 304, name, muted, 13, 'middle')}`;
}
function candleLesson(slide) {
  if (slide === 0) return visual('OHLC · anatomy of one candle',
    `${grid(94,114,value=>272-(value-94)*13)}${singleCandle(100,108,98,106,300,'15-minute candle')}` +
    `${line(300,90,475,90,cyan)}${label(490,94,'HIGH 108',cyan)}` +
    `${line(326,116,475,116,green)}${label(490,120,'CLOSE 106',green)}` +
    `${line(326,194,475,194,green)}${label(490,198,'OPEN 100',green)}` +
    `${line(300,220,475,220,cyan)}${label(490,224,'LOW 98',cyan)}`,
    'A green candle with open 100, high 108, low 98 and close 106. The body spans open to close.');
  if (slide === 1) return visual('A falling period · same four prices',
    `${grid(94,114,value=>272-(value-94)*13)}${singleCandle(106,108,98,100,300,'red candle')}` +
    `${line(325,116,470,116,red)}${label(484,120,'OPEN 106',red)}` +
    `${line(325,194,470,194,red)}${label(484,198,'CLOSE 100',red)}` +
    `${label(88,83,'High 108',cyan)}${label(88,220,'Low 98',cyan)}`,
    'A red candle opens at 106 and closes at 100; its wicks still show high 108 and low 98.');
  return visual('One red candle · two contexts',
    `${box(34,45,328,240)}${box(398,45,328,240)}` +
    `${label(55,71,'RISING SEQUENCE',green)}${label(419,71,'FALLING SEQUENCE',red)}` +
    `${candles([99,101,100,104,103,107,106],68,40,value=>266-(value-94)*14)}` +
    `${candles([110,108,109,105,106,102,101],432,40,value=>266-(value-94)*14)}` +
    `${label(55,305,'Last red candle = pullback?',muted)}${label(419,305,'Last red candle = continuation?',muted)}`,
    'The final red candle appears in two different swing sequences. Context changes the interpretation.');
}
function bearishLesson(slide) {
  const scale = value => 280 - (value - 94) * 12;
  const data = slide === 1 ? [106,108,96,100] : [106,108,98,100];
  const body = `${grid(94,114,scale)}${candle(290,...data,scale,54)}` +
    `${line(315,scale(106),470,scale(106),red)}${label(482,scale(106)+4,'OPEN 106',red)}` +
    `${line(315,scale(100),470,scale(100),red)}${label(482,scale(100)+4,'CLOSE 100',red)}` +
    `${label(55,slide===1?210:190,slide===1?'LOW 96 · recovery to 100':'BODY = 6 POINTS',cyan)}`;
  if (slide < 2) return visual(slide ? 'Lower wick · price recovered before close' : 'The bearish body · net change', body,
    slide ? 'Price reached 96 but closed at 100. The lower wick records a four-point recovery from the low.' : 'Open 106 minus close 100 gives a six-point bearish body.');
  return visual('A red candle within a wider trend',
    `${box(30,42,336,243)}${box(394,42,336,243)}` +
    `${label(49,68,'HIGHER HIGHS · HIGHER LOWS',green,11)}${label(413,68,'LOWER HIGHS · LOWER LOWS',red,11)}` +
    `${candles([98,100,99,103,102,107,106],68,42,value=>270-(value-94)*11)}` +
    `${candles([109,107,108,104,105,101,100],432,42,value=>270-(value-94)*11)}` +
    `${label(49,310,'Read the swing sequence before interpreting the final red candle.',muted,12)}`,
    'The left sequence has higher highs and higher lows; the right has lower highs and lower lows. Both finish with a red candle.');
}
function bodiesLesson(slide) {
  const specs = [[100,107,99,106],[102,110,101,103],[100,104,96,101]];
  return visual(['Compare body size','Upper wick · rejected extension','Small body · wide range'][slide],
    `${grid(94,114,value=>272-(value-94)*13)}${specs.map((spec,i)=>singleCandle(...spec,185+i*190,['Large body','Upper wick','Wide range'][i])).join('')}` +
    `${line(185,104,185,228,slide===0?cyan:'#405342','4 4')}` +
    `${label(60,55,slide===0?'Compare open-to-close distance':slide===1?'High 110, close 103: higher prices did not hold':'High 104, low 96: body 1 point, range 8 points',cyan)}`,
    ['The first body spans six points, compared with one point in each of the next two candles.','The middle candle reaches 110 but closes at 103. Its upper wick spans seven price points.','The last candle opens at 100 and closes at 101, while its high of 104 and low of 96 span eight points.'][slide]);
}
function timeframeLesson(slide) {
  const panels = `${box(28,43,338,244)}${box(394,43,338,244)}`;
  if (slide === 0) {
    const scale = value => 257-(value-98)*16;
    const bars = [[100,103,98,102],[102,105,101,104],[104,106,100,101],[101,108,100,106]];
    return visual('One market · two timeframes', panels +
      `${label(46,69,'15 MINUTES · FOUR CANDLES',cyan,11)}${label(412,69,'1 HOUR · ONE CANDLE',green,11)}` +
      `${bars.map((bar,i)=>candle(83+i*76,...bar,scale,25)).join('')}` +
      `${candle(513,100,108,98,106,scale,47)}` +
      `${label(571,101,'High 108',cyan,11)}${label(571,133,'Close 106',green,11)}${label(571,230,'Open 100',green,11)}${label(571,262,'Low 98',cyan,11)}` +
      `${['09:00','09:15','09:30','09:45'].map((time,i)=>label(83+i*76,279,time,muted,9,'middle')).join('')}` +
      `${label(46,311,'Both panels cover the same hour. Aggregation preserves O, H, L and C.',muted,11)}`,
      'Four 15-minute candles combine into one hourly candle: open 100, high 108, low 98 and close 106. The hourly candle hides the sequence within it.');
  }
  if (slide === 1) return visual('A bounce inside a wider decline', panels +
    `${label(46,69,'SHORT VIEW · 100 TO 104',cyan,11)}${label(412,69,'WIDER VIEW · 120 TO 104',red,11)}` +
    `${[100,101,100.5,102,103,104].map((close,i,all)=>{const open=i?all[i-1]:99.8;return candle(73+i*45,open,Math.max(open,close)+.35,Math.min(open,close)-.4,close,v=>258-(v-99)*27,17)}).join('')}` +
    `${candles([120,117,113,109,105,100,102,104],433,38,v=>268-(v-98)*7)}` +
    `${label(317,123,'104',muted,10)}${label(317,235,'100',muted,10)}${label(695,115,'120',muted,10)}${label(695,256,'100',muted,10)}` +
    `${label(46,311,'A four-point local bounce can sit inside a sixteen-point wider decline.',muted,11)}`,
    'The shorter view rises from 100 to 104. The wider view falls from 120 to 100 before that same bounce to 104.');
  return visual('Read the axis before comparing size', panels +
    `${label(46,69,'A · TIGHT PRICE SCALE',cyan,11)}${label(412,69,'B · WIDE PRICE SCALE',cyan,11)}` +
    `${[100,105,110].map((p,i)=>`${line(53,251-i*73,313,251-i*73,'#27364b')}${label(324,255-i*73,p,muted,10)}`).join('')}` +
    `${[100,120,140].map((p,i)=>`${line(419,251-i*73,679,251-i*73,'#27364b')}${label(690,255-i*73,p,muted,10)}`).join('')}` +
    `${line(80,251,275,105,green)}${line(446,251,641,105,green)}` +
    `${label(185,279,'PRICE CHANGE +10',green,11,'middle')}${label(551,279,'PRICE CHANGE +40',green,11,'middle')}` +
    `${label(46,311,'Identical screen height. Four times the price movement on chart B.',muted,11)}`,
    'The two lines occupy the same pixel height. Chart A rises ten points; chart B rises forty. Axis labels reveal the difference.');
}
function swingLesson(slide) {
  const values = [97,101,99,105,102,108,104,111,107,110,106,108];
  return priceChart(['Locate the turns','Compare swing pairs','The last higher low as a reference'][slide], values,
    'The chart marks successive peaks and troughs; the latest higher low is a reference, not a guaranteed floor.',
    `${[[3,105,'H1'],[5,108,'H2'],[7,111,'H3'],[2,99,'L1'],[4,102,'L2'],[6,104,'L3']].map(([i,p,t])=>label(78+i*42,285-(p-94)*11-18,t,t[0]==='H'?green:cyan,12,'middle')).join('')}` +
    `${slide===2?`${line(48,175,654,175,cyan,'5 4')}${label(506,166,'Last higher low',cyan)}`:''}`);
}
function zoneLesson(slide, resistance = false) {
  const values = resistance ? [99,103,107,104,106,109,105,108,110,107,slide===2?112:108,slide===2?113:106]
    : [110,106,100,104,99,103,98,102,100,104,slide===2?96:102,slide===2?95:104];
  const top = resistance ? 110 : 100, bottom = resistance ? 108 : 98;
  const y = value => 285-(value-94)*11;
  return priceChart(`${resistance?'Resistance':'Support'} · ${['find repeated reactions','mark an area, not a line','watch the close after a test'][slide]}`,
    values, `Shaded ${resistance?'resistance':'support'} zone from ${bottom} to ${top}. Multiple tests show an area, not a guaranteed level.`,
    `<rect x="42" y="${y(top)}" width="610" height="${y(bottom)-y(top)}" fill="${resistance?red:green}" opacity=".13"/>` +
    `${label(45,y(top)-8,`${resistance?'RESISTANCE':'SUPPORT'} ${bottom}–${top}`,resistance?red:green)}`);
}
function breakoutLesson(slide, falseBreak = false) {
  const values = falseBreak ? [100,104,102,106,103,107,105,108,107,111,106,104,102] :
    [100,104,102,106,103,107,105,108,107,111,110,112,113];
  const y = 285-(108-94)*11;
  if (slide === 2 && !falseBreak) return visual('Breakout · entry distance changes the risk',
    `${box(30,42,335,244)}${box(395,42,335,244)}` +
    `${label(49,69,'PLANNED ENTRY',cyan,11)}${label(414,69,'LATER ENTRY',red,11)}` +
    `${[[49,108],[414,112]].map(([x,entry])=>`${line(x,248,x+290,248,red,'5 4')}${label(x+6,270,'INVALIDATION 104',red,11)}${line(x,248-(entry-104)*17,x+290,248-(entry-104)*17,cyan,'5 4')}${label(x+6,237-(entry-104)*17,`ENTRY ${entry}`,cyan,11)}${line(x+235,248,x+235,248-(entry-104)*17,muted)}${label(x+219,251-(entry-104)*8.5,`${entry-104} pts`,muted,12,'end')}`).join('')}` +
    `${label(49,311,'Entry moved higher. Invalidation stayed fixed. Risk per unit doubled.',muted,11)}`,
    'An entry at 108 with invalidation at 104 risks four points per unit. At an entry of 112, the same invalidation risks eight points.');
  if (slide === 1 && falseBreak) return visual('False break · same-candle rejection or later failure',
    `${box(30,42,335,244)}${box(395,42,335,244)}` +
    `${label(49,69,'WICK ABOVE · CLOSE BACK BELOW',cyan,10)}${label(414,69,'CLOSE ABOVE · LATER RETURN',cyan,10)}` +
    `${line(48,156,345,156,cyan,'5 4')}${line(414,156,710,156,cyan,'5 4')}` +
    `${candle(175,106,112,104,107,v=>252-(v-100)*12,38)}` +
    `${candle(488,106,112,105,111,v=>252-(v-100)*12,34)}${candle(556,111,112,104,106,v=>252-(v-100)*12,34)}${candle(624,106,107,102,104,v=>252-(v-100)*12,34)}` +
    `${label(56,148,'108',cyan,11)}${label(420,148,'108',cyan,11)}` +
    `${label(49,270,'The first candle never closed above.',muted,11)}${label(414,270,'A close above can still fail later.',muted,11)}`,
    'On the left, a wick crosses 108 but closes at 107 in the same candle. On the right, a close at 111 is followed by a return to 106 and 104.');
  return priceChart(`${falseBreak?'False break':'Breakout'} · ${['the watched boundary','the close matters','reassess the plan'][slide]}`,
    values, falseBreak ? 'Price crosses 108 and returns inside the old range. The first crossing alone was not a lasting breakout.' :
      'Price moves above the prior 108 boundary and later candles hold above it in this synthetic example.',
    `${line(42,y,654,y,cyan,'7 5')}${label(46,y-8,'RANGE TOP 108',cyan)}` +
    `${falseBreak?`${label(446,46,'Back inside range',red)}${line(529,54,583,140,red)}`:`${label(501,46,'Held above',green)}${line(548,54,583,111,green)}`}`);
}
function volumeLesson(slide) {
  if (slide === 2) return visual('Check what the feed counts',
    `${box(30,43,335,244)}${box(395,43,335,244)}` +
    `${label(49,70,'EXCHANGE VOLUME',green,12)}${label(414,70,'TICK VOLUME',cyan,12)}` +
    `${[300,450,280,900,500,380].map((v,i)=>`<rect x="${58+i*45}" y="${242-v*.14}" width="24" height="${v*.14}" rx="2" fill="${green}" opacity=".8"/>`).join('')}` +
    `${[142,185,129,317,206,162].map((v,i)=>`<rect x="${423+i*45}" y="${242-v*.39}" width="24" height="${v*.39}" rx="2" fill="${cyan}" opacity=".8"/>`).join('')}` +
    `${label(194,272,'Units traded at that exchange',muted,11,'middle')}${label(562,272,'Price updates seen by a provider',muted,11,'middle')}` +
    `${label(49,311,'These bars measure different things. Check the feed before comparing.',muted,11)}`,
    'Exchange volume measures traded units. Tick volume counts observed price updates. Similar-looking histograms do not imply identical measurements.');
  const closes=[99,101,102,101,104,106,105,108,107,109];
  const vols=[35,42,38,48,44,86,52,91,45,57];
  return visual(['Align volume with price','Compare with a baseline','Check what the feed counts'][slide],
    `${grid(94,114,value=>231-(value-94)*9)}${candles(closes,76,55,value=>231-(value-94)*9)}` +
    `${vols.map((v,i)=>`<rect x="${68+i*55}" y="${292-v*.62}" width="16" height="${v*.62}" fill="${i===5||i===7?green:'#356b7b'}"/>`).join('')}` +
    `${slide===1?`${line(42,262,654,262,cyan,'5 5')}${label(672,266,'Baseline',cyan,10)}`:''}` +
    `${line(42,233,654,233)}${label(45,319,'Volume bars align with the price candles above',cyan,11)}`,
    'The lower histogram shows synthetic activity bars aligned with the price candles. A taller bar means more measured activity.');
}
function volatilityLesson(slide) {
  if (slide === 2) return visual('A wider range changes risk',
    `${box(30,43,335,244)}${box(395,43,335,244)}` +
    `${label(49,70,'PLANNED STOP · 2 POINTS',cyan,12)}${label(414,70,'PLANNED STOP · 4 POINTS',cyan,12)}` +
    `${label(197,141,'25 units',green,29,'middle')}${label(562,141,'12 units',green,29,'middle')}` +
    `${label(197,188,'£50 ÷ £2 per unit',muted,15,'middle')}${label(562,188,'£50 ÷ £4 per unit',muted,15,'middle')}` +
    `${label(197,243,'£50 planned price risk',muted,12,'middle')}${label(562,243,'£48 planned price risk',muted,12,'middle')}` +
    `${label(49,311,'Fixed £50 budget · whole units rounded down · before costs and slippage',muted,11)}`,
    'With a fixed £50 budget, doubling the planned stop distance from £2 to £4 reduces size from 25 to 12 whole units before costs.');
  const quiet=[[100,102,99,101],[101,103,100,102],[102,103,100,101],[101,103,100,102]];
  const wide=[[100,107,97,104],[104,109,98,100],[100,108,94,105],[105,112,99,102]];
  return visual(['Compare typical range','Measure high minus low','A wider range changes risk'][slide],
    `${box(28,43,338,246)}${box(394,43,338,246)}` +
    `${label(49,69,'QUIET · ~3-POINT RANGES',cyan)}${label(414,69,'ACTIVE · ~10-POINT RANGES',red)}` +
    `${quiet.map((c,i)=>candle(92+i*68,...c,value=>264-(value-94)*9,23)).join('')}` +
    `${wide.map((c,i)=>candle(458+i*68,...c,value=>264-(value-94)*9,23)).join('')}` +
    `${label(49,312,'Range = high − low; body = open-to-close',muted)}`,
    'The right group has wider high-to-low ranges despite mixed red and green candle bodies.');
}
function ordersLesson(slide) {
  const rows=[['ASK', '£10.02', red],['LAST', '£10.00', muted],['BID', '£9.98', green]];
  return visual(['Market versus limit','Stop trigger versus fill','The bid–ask spread'][slide],
    `${box(64,51,299,235)}${label(85,80,'QUOTED MARKET',cyan)}` +
    `${rows.map(([name,price,color],i)=>`${box(83,94+i*54,260,43,'#101b2c','#30475f')}${label(100,122+i*54,name,color)}${label(321,122+i*54,price,color,18,'end')}`).join('')}` +
    `${box(411,51,285,235)}${label(432,80,['ORDER CHOICE','SELL STOP EXAMPLE','IMMEDIATE ROUND TRIP'][slide],cyan,11)}` +
    `${label(434,126,['Buy market: speed','Trigger £9.00','Buy at ask £10.02'][slide],green,16)}` +
    `${label(434,168,['Buy limit £10.00:','Possible fill £8.85','Sell at bid £9.98'][slide],red,16)}` +
    `${label(434,212,['price cap, no fill promise','Trigger ≠ guaranteed fill','Spread cost £0.04 / share'][slide],muted,13)}` +
    `${slide===2?label(434,252,'100 shares → £4 before fees',cyan,12):''}`,
    ['A market buy prioritises execution; a buy limit sets a maximum price but may remain unfilled.','A sell stop triggered at £9.00 may fill at £8.85 during a fast move. The trigger and execution price are different.','Buying at £10.02 and immediately selling at £9.98 loses £0.04 per share, or £4 on 100 shares, before fees.'][slide]);
}
function riskLesson(slide) {
  if (slide === 1) return visual('Fix the loss budget',
    `${box(43,61,199,208)}${box(280,61,199,208)}${box(517,61,199,208)}` +
    `${label(142,100,'1 · SET BUDGET',cyan,12,'middle')}${label(142,164,'£50',green,30,'middle')}${label(142,224,'Fixed before entry',muted,11,'middle')}` +
    `${label(379,100,'2 · PRICE RISK',cyan,12,'middle')}${label(379,164,'£2',red,30,'middle')}${label(379,224,'Entry £10 − stop £8',muted,11,'middle')}` +
    `${label(616,100,'3 · CALCULATE SIZE',cyan,12,'middle')}${label(616,164,'25',green,30,'middle')}${label(616,224,'£50 ÷ £2 per share',muted,11,'middle')}` +
    `${label(43,307,'Planned price risk excludes spread, fees and slippage. Allow for these costs.',muted,11)}`,
    'Fix a £50 simulated budget before calculating size. At £2 planned price risk per share, 25 shares use that budget before costs and slippage.');
  if (slide === 2) return visual('Record the plan before outcome',
    `${box(32,45,336,238)}${box(394,45,334,238)}` +
    `${label(52,73,'BEFORE ENTRY · ORIGINAL RECORD',cyan,11)}${label(414,73,'AFTER EXIT · SEPARATE REVIEW',green,11)}` +
    `${[['Context','Higher low at 98'],['Trigger','Close above 106'],['Invalidation','Price below 98'],['Size','Within fixed budget']].map(([key,value],i)=>`${label(52,112+i*43,key,muted,11)}${label(347,112+i*43,value,cyan,11,'end')}`).join('')}` +
    `${[['Result','Loss at planned stop'],['Process','Plan followed'],['Lesson','A valid setup can lose'],['Next step','Review a larger sample']].map(([key,value],i)=>`${label(414,112+i*43,key,muted,11)}${label(707,112+i*43,value,i===0?red:green,11,'end')}`).join('')}` +
    `${label(52,310,'Preserve the original rationale so hindsight cannot rewrite the decision.',muted,11)}`,
    'The original plan is recorded before entry. Later results are added separately. A loss does not by itself show that the plan was poor.');
  const values=[99,101,103,102,105,104,107,106,109,108,110];
  return priceChart(['Locate invalidation','Fix the loss budget','Record the plan before outcome'][slide], values,
    'A synthetic rising chart marks an example entry, a lower invalidation level and a higher target.',
    `${[[98,'INVALIDATION',red],[106,'ENTRY',cyan],[112,'TARGET',green]].map(([p,t,c])=>`${line(42,285-(p-94)*11,654,285-(p-94)*11,c,'5 5')}${label(456,285-(p-94)*11-7,t,c)}`).join('')}`);
}
function sizingLesson(slide) {
  if (slide === 2) return visual('Check instrument multipliers',
    `${box(43,61,199,208)}${box(280,61,199,208)}${box(517,61,199,208)}` +
    `${label(142,100,'STOP DISTANCE',cyan,12,'middle')}${label(142,161,'2 points',muted,26,'middle')}${label(142,224,'Price difference',muted,11,'middle')}` +
    `${label(379,100,'CONTRACT VALUE',cyan,12,'middle')}${label(379,161,'£5 / pt',cyan,26,'middle')}${label(379,224,'Per contract',muted,11,'middle')}` +
    `${label(616,100,'RISK / CONTRACT',cyan,12,'middle')}${label(616,161,'£10',red,29,'middle')}${label(616,224,'2 points × £5 / point',muted,11,'middle')}` +
    `${label(43,307,'£50 budget ÷ £10 risk per contract = 5 contracts before costs and slippage.',muted,11)}`,
    'An illustrative contract worth £5 per point risks £10 across a two-point stop. A £50 budget supports five such contracts before costs; actual specifications vary.');
  return visual(['Calculate price risk per share','Wider stop · fewer shares','Check instrument multipliers'][slide],
    `${box(43,61,199,208)}${box(280,61,199,208)}${box(517,61,199,208)}` +
    `${label(142,100,'RISK BUDGET',cyan,13,'middle')}${label(142,166,'£50',green,30,'middle')}` +
    `${label(379,100,'STOP DISTANCE',cyan,13,'middle')}${label(379,166,slide===1?'£4':'£2',red,30,'middle')}` +
    `${label(616,100,'MAX WHOLE SHARES',cyan,13,'middle')}${label(616,166,slide===1?'12':'25',green,30,'middle')}` +
    `${label(379,224,slide===1?'£50 ÷ £4 = 12.5 → 12':'£50 ÷ £2 = 25',muted,13,'middle')}` +
    `${label(43,307,'Before costs or slippage · contracts may use a point-value multiplier',muted)}`,
    'Position size comes from the loss budget divided by planned loss per unit; the result is rounded down.');
}
function ratioLesson(slide) {
  if (slide === 1) return visual('Ratio plus outcome frequency',
    `${box(42,45,676,66)}${label(62,84,'TEN TRADES · £4 WIN / £2 LOSS',cyan,12)}` +
    `${Array.from({length:10},(_,i)=>`${box(52+i*66,137,57,47,i<3?'#183c38':'#3d2533',i<3?green:red,5)}${label(80+i*66,166,i<3?'+£4':'−£2',i<3?green:red,13,'middle')}`).join('')}` +
    `${label(153,227,'3 wins = +£12',green,17,'middle')}${label(465,227,'7 losses = −£14',red,17,'middle')}` +
    `${line(61,249,699,249)}${label(380,282,'NET RESULT  −£2 BEFORE COSTS',red,19,'middle')}` +
    `${label(51,315,'The 2:1 distance ratio did not overcome a 30% win rate in this sample.',muted,11)}`,
    'Three gains of £4 total £12. Seven losses of £2 total £14. The ten-trade sample loses £2 before costs despite a 2:1 reward-to-risk ratio.');
  return visual(['Compare planned distances','Ratio plus outcome frequency','A distant target changes the question'][slide],
    `${box(49,57,199,230)}${box(281,57,199,230)}${box(513,57,199,230)}` +
    `${label(148,90,'ENTRY',cyan,13,'middle')}${label(148,151,'£10',cyan,28,'middle')}` +
    `${label(380,90,'DOWNSIDE',red,13,'middle')}${label(380,151,'£2',red,28,'middle')}${label(380,201,'Stop £8',muted,14,'middle')}` +
    `${label(612,90,'UPSIDE',green,13,'middle')}${label(612,151,slide===2?'£10':'£4',green,28,'middle')}${label(612,201,slide===2?'Target £20':'Target £14',muted,14,'middle')}` +
    `${label(49,313,slide===1?'Three £4 wins − seven £2 losses = £2 loss before costs':'Distance ratio does not tell you the chance of reaching a target',muted)}`,
    'Planned reward and risk distances form a ratio, but outcome frequency and costs determine results.');
}
function flowLesson(slide) {
  const nodes=[['CONTEXT','Higher lows?'],['TRIGGER','Close above high?'],['RISK','Size fits budget?'],['DECISION','Trade or stand aside']];
  return visual(['Specify the conditions','Include the no-trade path','Make rules reviewable'][slide],
    `${nodes.map(([head,body],i)=>`${box(35+i*183,92,157,124,'#152235',i===slide?green:'#334d65')}${label(113+i*183,128,head,i===slide?green:cyan,14,'middle')}${label(113+i*183,170,body,muted,11,'middle')}${i<3?`${line(192+i*183,154,208+i*183,154,green)}${label(208+i*183,160,'›',green,19)}`:''}`).join('')}` +
    `${box(247,242,270,51,'#2c2630','#8e7655')}${label(382,274,'If a condition fails → NO TRADE','#e7b46d',13,'middle')}`,
    'An observable plan links context, entry trigger and risk checks to an explicit decision.');
}
function journalLesson(slide) {
  return visual(['Record the original decision','Tag repeated patterns','Separate process and outcome'][slide],
    `${box(38,53,682,225)}${['TIME','SETUP','PLAN','PROCESS','RESULT'].map((head,i)=>`${label(59+i*132,85,head,cyan,12)}${line(51+i*132,100,51+i*132,265)}`).join('')}` +
    `${line(50,101,707,101)}${line(50,173,707,173)}` +
    `${[['09:30','Higher low','Entry 106','Followed','Loss'],['11:15','Breakout','Wait >108','Chased','Win']].map((row,r)=>row.map((item,i)=>label(59+i*132,139+r*72,item,i===3?(r?red:green):muted,12)).join('')).join('')}` +
    `${label(40,307,slide===2?'The winning row broke the plan; the losing row followed it':'Write the plan before the outcome; add results later',muted)}`,
    'A sample journal separates the setup and plan from whether the trade won or lost.');
}
function biasLesson(slide) {
  const heads=['FAST MOVE','CONFIRMATION','AFTER A RESULT'];
  const questions=['Does entry still fit risk?','What contradicts my idea?','Is next size still planned?'];
  return visual(['Pause before chasing','Look for contrary evidence','Reset after a strong emotion'][slide],
    `${box(51,53,658,53,'#183437','#3b6b6d')}${label(380,88,heads[slide],green,20,'middle')}` +
    `${line(380,106,380,144,cyan)}${box(168,145,424,74)}${label(380,188,questions[slide],cyan,19,'middle')}` +
    `${line(380,219,380,249,cyan)}${box(197,252,366,47,'#2c2630','#8e7655')}${label(380,282,'If the answer is unclear, pause', '#e7b46d',15,'middle')}`,
    'A decision checklist interrupts urgency and brings attention back to observable evidence and planned risk.');
}

export function lessonVisual(lessonIndex, slideIndex) {
  switch (lessonIndex) {
    case 0: return candleLesson(slideIndex);
    case 1: return bearishLesson(slideIndex);
    case 2: return bodiesLesson(slideIndex);
    case 3: return timeframeLesson(slideIndex);
    case 4: return swingLesson(slideIndex);
    case 5: return zoneLesson(slideIndex);
    case 6: return zoneLesson(slideIndex, true);
    case 7: return breakoutLesson(slideIndex);
    case 8: return breakoutLesson(slideIndex, true);
    case 9: return volumeLesson(slideIndex);
    case 10: return volatilityLesson(slideIndex);
    case 11: return ordersLesson(slideIndex);
    case 12: return riskLesson(slideIndex);
    case 13: return sizingLesson(slideIndex);
    case 14: return ratioLesson(slideIndex);
    case 15: return flowLesson(slideIndex);
    case 16: return journalLesson(slideIndex);
    case 17: return biasLesson(slideIndex);
    default: return '';
  }
}

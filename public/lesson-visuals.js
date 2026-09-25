// All examples use invented prices. Each SVG is a teaching diagram, not market data.
const green = '#b7ff3c', red = '#ff6b78', cyan = '#5bdcc9', muted = '#a9bba8';
const label = (x, y, value, color = muted, size = 12, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" font-family="Inter,Segoe UI,sans-serif">${value}</text>`;
const line = (x1, y1, x2, y2, color = '#405342', dash = '') =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const box = (x, y, w, h, fill = '#1b2a20', stroke = '#456044', radius = 8) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const visual = (title, body, caption) => `<figure class="lesson-visual"><div class="visual-title">${title}<span>SYNTHETIC EXAMPLE</span></div><svg viewBox="0 0 760 330" role="img" aria-label="${caption}">${body}</svg><figcaption>${caption}</figcaption></figure>`;

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
  return `${ticks.map(value => `${line(40, y(value), 654, y(value), '#2a3b2e', '4 5')}${label(670, y(value) + 4, value, '#91a493', 11)}`).join('')}${line(40, 286, 654, 286)}`;
}
function priceChart(title, values, caption, extras = '') {
  return visual(title, grid() + extras + candles(values), caption);
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
  return priceChart('A red candle within a wider trend', [99,101,103,102,105,107,106,109,108,106,107,106],
    'A red candle can be a temporary interruption in a rising sequence of swing lows.',
    `${line(105,245,520,119,cyan,'6 5')}${label(117,225,'Rising swing lows',cyan)}`);
}
function bodiesLesson(slide) {
  const specs = [[100,106,99,105],[102,110,101,103],[103,106,96,104]];
  return visual(['Compare body size','Upper wick · rejected extension','Small body · wide range'][slide],
    `${grid(94,114,value=>272-(value-94)*13)}${specs.map((spec,i)=>singleCandle(...spec,185+i*190,['Large body','Upper wick','Wide range'][i])).join('')}` +
    `${line(185,104,185,228,slide===0?cyan:'#405342','4 4')}` +
    `${label(60,55,slide===0?'Compare open-to-close distance':slide===1?'High 110, close 103: higher prices did not hold':'High 106, low 96: body alone hides movement',cyan)}`,
    'Three synthetic candles compare body size, wick length and total high-to-low range.');
}
function timeframeLesson(slide) {
  const a = slide===1 ? [109,108,106,104,102,100,102,104] : [100,101,100,103,102,104,103,106];
  return visual(['One market · two timeframes','A bounce inside a wider decline','Read the axis before comparing size'][slide],
    `${box(28,48,338,238)}${box(394,48,338,238)}` +
    `${label(45,72,slide===0?'15-MINUTE VIEW':'SHORT VIEW',cyan)}${label(411,72,slide===0?'DAILY VIEW':'WIDER VIEW',green)}` +
    `${candles(a,66,39,value=>248-(value-94)*9)}` +
    `${candles(slide===1?[113,111,108,105,102,100,101,102]:[96,99,101,103,105,107,106,108],433,39,value=>248-(value-94)*9)}` +
    `${label(45,307,'Same market · different periods and scales',muted)}`,
    'The left and right panels use different timeframes. A local pattern must be read inside its wider context.');
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
  const top = resistance ? 110 : 101, bottom = resistance ? 108 : 98;
  const y = value => 285-(value-94)*11;
  return priceChart(`${resistance?'Resistance':'Support'} · ${['find repeated reactions','mark an area, not a line','watch the close after a test'][slide]}`,
    values, `Shaded ${resistance?'resistance':'support'} zone from ${bottom} to ${top}. Multiple tests show an area, not a guaranteed level.`,
    `<rect x="42" y="${y(top)}" width="610" height="${y(bottom)-y(top)}" fill="${resistance?'#783442':'#365d32'}" opacity=".45"/>` +
    `${label(45,y(top)-8,`${resistance?'RESISTANCE':'SUPPORT'} ${bottom}–${top}`,resistance?red:green)}`);
}
function breakoutLesson(slide, falseBreak = false) {
  const values = falseBreak ? [100,104,102,106,103,107,105,108,107,111,106,104,102] :
    [100,104,102,106,103,107,105,108,107,111,110,112,113];
  const y = 285-(108-94)*11;
  return priceChart(`${falseBreak?'False break':'Breakout'} · ${['the watched boundary','the close matters','reassess the plan'][slide]}`,
    values, falseBreak ? 'Price crosses 108 and returns inside the old range. The first crossing alone was not a lasting breakout.' :
      'Price moves above the prior 108 boundary and later candles hold above it in this synthetic example.',
    `${line(42,y,654,y,cyan,'7 5')}${label(46,y-8,'RANGE TOP 108',cyan)}` +
    `${falseBreak?`${label(454,82,'Back inside range',red)}${line(531,88,583,140,red)}`:`${label(504,82,'Held above',green)}${line(548,90,583,111,green)}`}`);
}
function volumeLesson(slide) {
  const closes=[99,101,102,101,104,106,105,108,107,109];
  const vols=[35,42,38,48,44,86,52,91,45,57];
  return visual(['Align volume with price','Compare with a baseline','Check what the feed counts'][slide],
    `${grid(94,114,value=>231-(value-94)*9)}${candles(closes,76,55,value=>231-(value-94)*9)}` +
    `${vols.map((v,i)=>`<rect x="${68+i*55}" y="${292-v*.62}" width="16" height="${v*.62}" fill="${i===5||i===7?green:'#4f8d6c'}"/>`).join('')}` +
    `${line(42,233,654,233)}${label(45,319,slide===2?'Check whether this is traded volume or tick volume':'Volume bars align with the price candles above',cyan)}`,
    'The lower histogram shows synthetic activity bars aligned with the price candles. A taller bar means more measured activity.');
}
function volatilityLesson(slide) {
  const quiet=[[100,102,99,101],[101,103,100,102],[102,103,100,101],[101,103,100,102]];
  const wide=[[100,107,97,104],[104,109,98,100],[100,108,94,105],[105,112,99,102]];
  return visual(['Compare typical range','Measure high minus low','A wider range changes risk'][slide],
    `${box(28,43,338,246)}${box(394,43,338,246)}` +
    `${label(49,69,'QUIET · ~3-POINT RANGES',cyan)}${label(414,69,'ACTIVE · ~10-POINT RANGES',red)}` +
    `${quiet.map((c,i)=>candle(92+i*68,...c,value=>264-(value-94)*13,23)).join('')}` +
    `${wide.map((c,i)=>candle(458+i*68,...c,value=>264-(value-94)*13,23)).join('')}` +
    `${label(49,312,'Range = high − low; body = open-to-close',muted)}`,
    'The right group has wider high-to-low ranges despite mixed red and green candle bodies.');
}
function ordersLesson(slide) {
  const rows=[['ASK', '£10.02', red],['LAST', '£10.00', muted],['BID', '£9.98', green]];
  return visual(['Market versus limit','Stop trigger versus fill','The bid–ask spread'][slide],
    `${box(64,51,299,235)}${label(85,80,'QUOTED MARKET',cyan)}` +
    `${rows.map(([name,price,color],i)=>`${box(83,94+i*54,260,43,'#142219','#36503d')}${label(100,122+i*54,name,color)}${label(321,122+i*54,price,color,18,'end')}`).join('')}` +
    `${box(411,51,285,235)}${label(432,80,slide===1?'SELL STOP EXAMPLE':'ORDER CHOICE',cyan)}` +
    `${label(434,126,slide===1?'Trigger £9.00':'Buy market: speed',green,16)}` +
    `${label(434,168,slide===1?'Possible fill £8.85':'Buy limit £10.00:',red,16)}` +
    `${label(434,slide===1?212:194,slide===1?'Trigger ≠ guaranteed fill':'price cap, no fill promise',muted,14)}`,
    'Synthetic bid and ask quotes illustrate the spread, price control of limit orders and execution uncertainty.');
}
function riskLesson(slide) {
  const values=[99,101,103,102,105,104,107,106,109,108,110];
  return priceChart(['Locate invalidation','Fix the loss budget','Record the plan before outcome'][slide], values,
    'A synthetic rising chart marks an example entry, a lower invalidation level and a higher target.',
    `${[[98,'INVALIDATION',red],[106,'ENTRY',cyan],[112,'TARGET',green]].map(([p,t,c])=>`${line(42,285-(p-94)*11,654,285-(p-94)*11,c,'5 5')}${label(456,285-(p-94)*11-7,t,c)}`).join('')}`);
}
function sizingLesson(slide) {
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
    `${nodes.map(([head,body],i)=>`${box(35+i*183,92,157,124,'#182820',i===slide?'#b7ff3c':'#456044')}${label(113+i*183,128,head,i===slide?green:cyan,14,'middle')}${label(113+i*183,170,body,muted,12,'middle')}${i<3?`${line(192+i*183,154,214+i*183,154,green)}${label(215+i*183,159,'›',green,20)}`:''}`).join('')}` +
    `${box(247,242,270,51,'#34271c','#aa7d4f')}${label(382,274,'If a condition fails → NO TRADE','#f4c581',14,'middle')}`,
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
    `${box(51,53,658,53,'#263719','#688e47')}${label(380,88,heads[slide],green,20,'middle')}` +
    `${line(380,106,380,144,cyan)}${box(168,145,424,74)}${label(380,188,questions[slide],cyan,19,'middle')}` +
    `${line(380,219,380,249,cyan)}${box(197,252,366,47,'#34291d','#a88a55')}${label(380,282,'If the answer is unclear, pause', '#f4d49a',15,'middle')}`,
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

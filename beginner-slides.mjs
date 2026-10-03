// Three plain-language explanations per lesson, in the same order as the diagrams.
// Keep the first use of a trading term beside its meaning and a visible example.
export const beginnerSlides = [
  [
    'A candle is one small summary of what a price did during a set time, such as 15 minutes. Open means its first price, close means its last price, high is the highest price, and low is the lowest. Together these four prices are called OHLC. The thick middle part joins open and close. The thin lines show how far price reached above and below it. A rising green candle is also called bullish.',
    'Look at the red candle. It began at 106 and ended at 100, so price finished lower during this period. The top and bottom tips still show 108 and 98. Red tells you what happened during this one period; it cannot tell you what the next candle will do.',
    'Now look at the candles around the red one. On the left, price had mostly been climbing; on the right, it had mostly been falling. The same red candle can appear in either story. Read several candles together before deciding what a single candle might mean.'
  ],
  [
    'A falling candle is also called a bearish candle. Its thick body runs from its starting price down to its ending price. Here that is 106 down to 100, a fall of 6 points. The whole candle stretches from 108 to 98, which is a wider 10-point range.',
    'This candle went as low as 96 but ended at 100. The thin line below the body shows that price rose 4 points from its lowest point before the period ended. That is a recovery inside this candle. It does not promise that the next candle will rise.',
    'One red candle is not automatically a reason to sell. On the left, the surrounding candles have generally moved higher. On the right, they have generally moved lower. First describe the larger pattern; then decide whether this red candle changes it.'
  ],
  [
    'The body shows the difference between the first and last price of a candle. A tall body means those two prices are far apart. Compare bodies on the same chart: the first candle changes by 6 points, while the others change by about 1 point.',
    'The thin line above a candle is its upper wick. The middle candle reached 110 but finished at 103. Price visited the higher level without staying there until the close. That is useful to notice, but it does not tell you what happens next.',
    'The last candle starts near 100 and finishes near 101, so its body is small. But price travelled from 96 to 104 along the way. Small body does not mean little movement. Check the highest and lowest price as well as the body.'
  ],
  [
    'A timeframe tells you how much time one candle covers. Four 15-minute candles make one hour. The single hourly candle on the right covers those same four periods, but it hides the order of moves inside that hour.',
    'A short chart can show price rising from 100 to 104 while a longer chart shows an earlier fall from 120 to 100. Both can be true. The small rise is a bounce inside the larger fall. Check the timeframe before saying which direction price has been moving.',
    'A chart can make a move look big or small by changing its vertical scale. The printed price numbers tell you the actual size. In this diagram, the lines rise by different amounts even though they take up similar space on the screen.'
  ],
  [
    'A swing high is a visible peak: price rises to it, then falls away. A swing low is a dip: price falls to it, then rises away. Find a peak and a dip on the chart. You need prices on both sides before you can be sure a turn happened.',
    'Compare each peak with the one before it, then do the same with each dip. Higher peaks and higher dips suggest a rising pattern. Lower peaks and lower dips suggest a falling pattern. When they disagree, the direction is less clear.',
    'The latest higher dip is a useful place to watch in a rising pattern. If price falls below it, the pattern may be changing. That does not prove a new falling trend; it tells you to look again at the next few moves.'
  ],
  [
    'Support is a price area where earlier falls stopped and price rose again. In the diagram, that happened near 98 to 100. Because it happened before, you might watch the area again. It is not a floor that price must stay above.',
    'The earlier turns happened at slightly different prices. That is why the diagram uses a shaded band instead of one thin line. A band records the area where price reacted without pretending every turn happened at exactly the same number.',
    'Watch where the candle ends. A quick move below the band followed by a close back inside it is different from a close below it that stays there. The second case gives less reason to call this area support.'
  ],
  [
    'Resistance is a price area where earlier rises stopped and price fell again. Here that happened around 108 to 110. It is a place to watch, not a ceiling that price cannot cross.',
    'When price returns to the same area, compare what happens this time with the earlier visits. Does it fall away quickly, or does it finish near the top? The ending price of each candle helps you describe the difference.',
    'If price moves above the shaded area and keeps ending above it, the old resistance idea may no longer fit. The area is still useful history, but its earlier role does not guarantee its future role.'
  ],
  [
    'A range is an area where price has moved back and forth. A breakout happens when price moves beyond one edge of that range. In this diagram, 108 is the upper edge. Mark the edge before deciding whether price has broken through it.',
    'A candle can briefly poke above 108 and still end below it. Another can end above 108, with later candles staying above. These are different observations. Look at where candles finish, not only the highest point they touched.',
    'A fast move can tempt you to enter far above the old edge. If your planned exit is still below that edge, a higher entry means more money could be lost per share. Check that distance before deciding whether the trade still fits your plan.'
  ],
  [
    'A false break happens when price crosses a watched edge but then returns inside the old range. Here price goes above 108 but ends back below it. Crossing the line once did not mean price would stay above it.',
    'There are two ways this can happen. Price may move above the line and return below it in the same candle. Or it may end above the line first, then fall back on later candles. Compare the closes to see which happened.',
    'After a false break, use the old edge as a reference. If price climbs back above it and stays there, your first reading may need to change again. You do not need to make an opposite trade simply because the first break failed.'
  ],
  [
    'Volume is a count of activity during a period. When a chart has volume bars, each bar lines up with a price candle above it. A taller bar means more activity was recorded in that period. It does not tell you whether the next price move will rise or fall.',
    'A number such as 900 only becomes useful when you compare it with nearby bars. If most are around 300, 900 stands out. Compare similar times of day too, because trading can naturally be busier at some hours.',
    'Not every volume bar counts the same thing. Exchange volume counts units traded, such as shares. Tick volume counts price updates seen by a data provider. Read the label before comparing two charts.'
  ],
  [
    'Volatility means how much price moves around, whether up or down. The candles on one side of the diagram have shorter high-to-low distances; the other side has wider ones. Several wide candles suggest bigger recent moves.',
    'To find a candle’s full range, subtract its low from its high. A high of 108 and low of 98 give a range of 10 points. That can be true even when the first and last prices are only 1 point apart.',
    'A stop is an order meant to close a trade if price reaches a chosen level. If normal price moves are wide, a nearby stop may be reached easily. Moving it farther away increases the planned loss per share, so the number of shares must be smaller if your money limit stays the same.'
  ],
  [
    'An order is an instruction to buy or sell. A market buy asks to buy soon at an available price; the final price can change. A buy limit says the most you agree to pay, such as £10, but the order may never be filled.',
    'A stop price is a trigger, not a promise of the exact sale price. If a sell stop is set at £9, a fast fall might trigger it and the sale could happen at £8.85. The difference matters when you estimate possible loss.',
    'The ask is the price sellers offer; the bid is the price buyers offer. If the ask is £10.02 and the bid is £9.98, the gap is 4 pence. Buying and immediately selling would lose about 4 pence per share before any fees, if those prices remain available.'
  ],
  [
    'Before a trade, decide what price move would show that your idea may be wrong. Traders call that point invalidation. If your idea depends on an earlier dip near 98 holding, a fall below 98 would make you reconsider it.',
    'Choose an amount of money for a practice trade that you are willing to risk. For example, with a £50 limit and a planned £2 loss per share, £50 divided by £2 gives 25 shares before costs. This is a planning example, not a guaranteed maximum loss.',
    'Write your reason, entry, planned exit and share count before you know the result. A careful decision can lose money, and a careless one can win. Reviewing what you knew at the time helps you learn more than judging only the final result.'
  ],
  [
    'Position size means how many shares or units you buy. If you buy a share at £10 and plan to leave at £8, the planned difference is £2 per share. With a £50 practice risk limit, £50 divided by £2 gives 25 shares before costs.',
    'If your planned exit is £4 away instead of £2, each share could lose twice as much. With the same £50 limit, you could plan for only 12 whole shares: 12 times £4 is £48. Round down rather than going above the limit.',
    'The simple division works for shares, but some products use extra multipliers. A futures contract, for example, gives each price point a money value. Check how the product works, its minimum size and its fees before using a share calculation.'
  ],
  [
    'Compare the possible gain with the planned loss before a trade. Buying at £10, leaving if price falls to £8, and aiming for £14 means £2 of planned loss and £4 of possible gain per share. That is a 2-to-1 distance comparison, not a prediction.',
    'A larger possible gain does not make a method profitable by itself. Imagine three wins of £4 and seven losses of £2: you gain £12 but lose £14. The total is a £2 loss before costs. How often you win matters too.',
    'Moving your target farther away makes the gain number look larger, but it does not make price more likely to reach it. Pick a target for a reason you can explain, then compare it with what actually happens in practice.'
  ],
  [
    'A trading plan is a short list of things you will check before acting. Start with what the chart is doing, the price that would let you enter, the price that would make the idea wrong, and how many shares fit your money limit.',
    'A good plan also says when to do nothing. If the pattern is unclear, your entry condition has not happened, or the possible loss is too large, “no trade” is a complete decision.',
    'Write rules that another person could check. “It feels strong” is hard to test. “Price made two higher dips and then ended above the last peak” is specific. Clear rules help you compare your plan with your later actions.'
  ],
  [
    'A trading journal is a record of why you made a decision. Before a practice trade, save the chart, your reason, your planned entry and exit, and your size. Add the result later so it does not change your memory of the original decision.',
    'Tags are short labels that help you group similar decisions. You might use “range” for the chart pattern and “late entry” for a mistake in timing. Keep the same labels over many examples so comparisons are useful.',
    'Review whether you followed your plan separately from whether you won or lost. A planned trade can lose; an unplanned trade can win. Both the decision and its result belong in the journal.'
  ],
  [
    'A fast price move can make you feel you must act immediately. That feeling is often called fear of missing out. Compare the current price with your planned entry and possible loss. If the trade no longer fits, waiting is a valid choice.',
    'It is easy to notice only facts that agree with your idea. This is called confirmation bias. Before acting, name one thing on the chart that would make you question the idea, then look for it as carefully as you look for supporting signs.',
    'After a win or loss, pause before the next decision. Check the chart pattern, the size of the trade and the possible loss again. One result does not make the next trade safer or more likely to win.'
  ],
  [
    'A pullback is a move back against an earlier rise or fall. Fibonacci retracement is a tool that draws percentage lines across that earlier move. They are measuring marks, not places where price must turn.',
    'Imagine price rose from 100 to 120, a 20-point move. Half of that move is 10 points, so a 50% pullback reaches 110. Other lines, such as 38.2% and 61.8%, measure different portions of the same 20 points.',
    'A line can tell you where to watch, but not when to buy. First look for a clear response from price, decide what would prove your idea wrong, and check the possible loss. If those steps are missing, the line alone is not a trade plan.'
  ],
  [
    'A setup is a situation you are willing to consider; a trigger is the specific event that tells you when to act. For example, a rising chart returning to an earlier support area is a setup. A candle finishing above the recent peak could be your trigger.',
    'Write the whole example with numbers. Buy near 110, plan to leave if price reaches 107, and aim for 116. That is 3 points of planned loss and 6 points of possible gain per share. With a £30 practice risk limit, 10 shares use the full planned amount before costs.',
    'You can reject a setup. If the trigger never happens, the chart is unclear, or the possible loss has become too large, skip it. Record skipped examples as well as trades so you can review how consistently you followed your plan.'
  ],
  [
    'Trading rules are instructions you write before practice begins. Name the market, the chart pattern you want to see, the price that allows an entry, your money limit and your exit plan. Keep the rules short enough to check while looking at a chart.',
    'A session is one planned period of practice. You can set a limit before it starts, such as no more than two entries or no more than 60 units of total realised loss. When a limit is reached, stop taking new trades for that session.',
    'After practice, compare each decision with your written rules. Record the money result separately. A win that broke a rule is still a rule break, and a loss that followed the plan is still useful evidence. Change rules later during review, not during a trade.'
  ]
];

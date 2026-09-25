// Each slide pairs a concrete explanation with a question about its matching diagram.
// Diagrams are selected by lesson and slide index in public/lesson-visuals.js.
export const lessonContent = [
  ['Candles: the four prices', 4, [
    ['One candle, four prices', 'A candle summarises one chosen period. In this example it opens at 100, reaches 108, falls to 98 and closes at 106. The body joins open and close; the wicks reach the high and low. It does not show the order in which those prices occurred.', 'Which two prices make the body, and which two mark the full range?'],
    ['Read a falling candle', 'This candle opens at 106 and closes at 100, so its body is red. Its high at 108 and low at 98 sit beyond the body. Red describes this period only; it does not predict the next one.', 'Find the open and close before looking at the colour.'],
    ['Place it in context', 'A red candle inside a rising sequence may be a brief pullback. The same red candle after several lower highs may fit a decline. Compare neighbouring candles and swing points before giving one candle a meaning.', 'What changes between the two sequences even though the final candle is the same?']
  ]],
  ['Bearish candles up close', 4, [
    ['The body measures the net fall', 'A bearish candle opens above where it closes. If it opens at 106 and closes at 100, the body records a six point decline. Its high and low can extend beyond both prices, so the body is only part of the period’s range.', 'Which distance is the body, and which is the whole range?'],
    ['A lower wick shows a recovery', 'Price can fall to 96 during the period and recover to close at 100. The lower wick records that recovery from the low. You cannot tell from one completed candle whether the recovery will continue.', 'How far did price recover from the low before the close?'],
    ['A red candle is not a sell signal', 'In an uptrend, one red candle may simply interrupt a series of higher lows. In a downtrend, a red candle may add to an existing decline. First locate it within the swing sequence, then decide what evidence would change your reading.', 'Which chart has lower highs and lower lows?']
  ]],
  ['Bodies, wicks and pressure', 4, [
    ['Compare bodies on the same chart', 'A body measures the open to close change, not volume or all trading within the period. A six point body looks large next to recent one point bodies. The comparison only makes sense with the same instrument, timeframe and scale.', 'Which body is unusually large relative to its neighbours?'],
    ['A wick is a failed extension', 'A candle that trades up to 110 but closes at 103 has a long upper wick: the higher price did not hold through the close. That may prompt a closer look at nearby resistance, but a later candle is needed to judge follow-through.', 'Where did the move reach, and where did it finish?'],
    ['A small body can hide a wide range', 'A candle can open at 100, visit 96 and 104, then close at 101. Its body is small but its total range is wide. Describe those facts before calling the period quiet or predicting a reversal.', 'Compare the body with the full high-to-low range.']
  ]],
  ['Timeframes and scale', 4, [
    ['Name the period first', 'One 15 minute candle contains 15 minutes of open, high, low and close data; one daily candle covers a trading day or session. A daily move can contain many different 15 minute paths. Always read the timeframe label before comparing patterns.', 'How many short periods sit inside the longer view?'],
    ['Zoom out for the larger sequence', 'A short rise from 100 to 104 can sit inside a broader fall from 120 to 100. The short chart shows the bounce, while the longer chart shows the decline around it. Both views are true at different scales.', 'Which view shows the wider direction?'],
    ['Pixels are not price units', 'Two charts can draw a ten point move at different heights because their vertical axes differ. Check the price labels and timeframe before judging which move is larger. Screen size alone is not evidence.', 'Which chart has the larger price change, regardless of pixel height?']
  ]],
  ['Swing highs and lows', 5, [
    ['Mark local turning points', 'A swing high is a peak with lower prices on either side; a swing low is a trough with higher prices on either side. You need neighbouring points to identify one. A single candle high is not automatically a meaningful swing high.', 'Find the peak and trough in the sequence.'],
    ['Compare the pairs', 'If the next peak and trough are both higher than the previous ones, the sequence suggests an uptrend. Lower peaks and troughs suggest a downtrend. Mixed pairs call for a more cautious description such as range or transition.', 'Do both highs and lows move in the same direction?'],
    ['Know what would challenge the idea', 'A fall below the last important higher low challenges an uptrend reading. It does not by itself establish a lasting downtrend; the next swings matter. Mark the level that would make you reassess.', 'Which prior swing low is the reference?']
  ]],
  ['Support zones', 4, [
    ['Find repeated pauses', 'Support is an area where earlier declines paused or turned. In the example, price approached 98 to 100 more than once and rose afterwards. That history makes the area worth watching, not a guaranteed floor.', 'Where did the two previous declines pause?'],
    ['Draw a band, not a perfect line', 'One turn may reach 98 and another 100. A zone covers that variation without pretending both turns happened at one exact price. Use the market’s usual movement to judge whether the band is narrow enough to be useful.', 'Why does the shaded band cover more than one price?'],
    ['Notice when the zone fails', 'If price closes below the area and continues there, the old support idea is weaker. A wick below followed by a recovery tells a different story. Compare where price finishes and what happens next.', 'Which path closes and remains below the band?']
  ]],
  ['Resistance zones', 4, [
    ['Find repeated stalls', 'Resistance is an area where earlier rises stalled or turned. In the example, price reached roughly 108 to 110 twice and retreated. The area is a reference for observation, not a ceiling.', 'Where did the prior rises stop?'],
    ['Compare each test', 'A second approach to resistance might retreat sharply, or it might close closer to the top of the zone. Those are different observations. Record the reaction and the closing prices instead of assuming another rejection.', 'Which test ends closer to the top of the band?'],
    ['Reassess after a break', 'Several closes above the zone challenge the old resistance reading. If price later returns to the area, you can observe whether it holds from above. The previous label does not force the next outcome.', 'What changed after price held above the band?']
  ]],
  ['Breakouts and follow-through', 5, [
    ['Define the boundary', 'A breakout is a move beyond an area price had been respecting, such as the top of a range. Here price traded between 98 and 108 before crossing 108. Name the boundary first so a move beyond it can be judged clearly.', 'Which line was the range boundary before the move?'],
    ['Separate a spike from a hold', 'A wick above 108 followed by a close back inside the range gives weaker evidence than a close above 108 followed by trading there. Neither guarantees continuation. The close and later candles help distinguish the paths.', 'Which path held beyond the old boundary?'],
    ['Plan before a fast move', 'If an entry is far above the old boundary while invalidation remains below it, the planned loss per unit grows. A faster breakout is not automatically a better entry. Decide in advance what price and risk would still fit the plan.', 'How does the entry-to-invalidation distance change when entry moves higher?']
  ]],
  ['False breaks and traps', 5, [
    ['Watch price return inside', 'A false break moves beyond a watched boundary and then returns inside the earlier range. In this example, price crosses 108 but finishes below it. The first crossing alone did not establish a lasting break.', 'Where does price finish relative to the old range?'],
    ['Wicks and closes tell different stories', 'A wick above resistance with a close back below it shows that the higher price did not hold for that period. Even a close above can fail on later candles. Compare the close with subsequent action before deciding what happened.', 'Which example returns inside on the same candle?'],
    ['Use the failed edge as a reference', 'After price returns inside the range, the old edge gives you a clear place to reassess the original breakout idea. You need not immediately take the opposite side. Update the observation first, then any plan.', 'Which side of the edge would weaken the failed-break reading?']
  ]],
  ['Volume: participation', 5, [
    ['Read the bar below price', 'Volume records traded units during a period when that data is available. A bar beneath each candle aligns activity with that candle. A high volume bar tells you activity was high, not which side will win next.', 'Which price period has the tallest matching volume bar?'],
    ['Use a fair baseline', 'A volume bar of 900 units means little alone. If nearby bars are near 300, it stands out; if they are near 1,200, it does not. Compare similar sessions and periods, because activity often changes by time of day.', 'Which bar is unusual relative to its neighbours?'],
    ['Check what the feed counts', 'Exchange volume counts traded units in that market. A forex feed may instead show tick volume, the number of price updates seen by that provider. These are different measurements, so check the label before comparing them.', 'Do the two panels count the same thing?']
  ]],
  ['Volatility and range', 5, [
    ['Describe the size of movement', 'Volatility concerns how much price varies, not whether it rises or falls. Recent candles with high-to-low ranges around eight points behave differently from ones around two points. Compare several periods before calling a move typical.', 'Which group has wider high-to-low ranges?'],
    ['Measure high minus low', 'If a candle reaches 108 and 98, its range is ten points even if it opens at 100 and closes at 101. The body is only one point. A single wide period can be an outlier, so compare a run of ranges.', 'Which measurement captures the entire candle?'],
    ['Match risk to the observed range', 'A stop inside ordinary price variation can trigger while the broader idea still looks intact. Placing a stop farther away increases loss per unit if it fills there. To hold the same planned risk, position size must fall.', 'What happens to size when the stop distance doubles but the risk budget stays fixed?']
  ]],
  ['Orders and execution', 5, [
    ['Market and limit solve different problems', 'A market order seeks an available fill quickly, but the exact price is not guaranteed. A buy limit at £10 sets the highest price you will pay, but it may never fill. Choose which uncertainty matters for the situation.', 'Which order controls the maximum purchase price?'],
    ['A stop price is a trigger', 'A sell stop at £9 can activate when price reaches the trigger, then become a market order. In a fast move the fill might be below £9. The trigger is therefore not a promise about the final execution price.', 'Which marker is the trigger, and which is the possible fill?'],
    ['Count the round-trip cost', 'If the quoted bid is £9.98 and ask is £10.02, buying at the ask and selling immediately at the bid loses £0.04 per share before fees. Add spread and fees when judging a small target.', 'What is the difference between the bid and ask?']
  ]],
  ['Risk before reward', 5, [
    ['Define what would disprove the idea', 'Suppose a rise depends on a higher low holding at 98. A move below that low challenges the setup, so 98 is a possible invalidation reference. A stop order can express a plan, but its fill price can differ from its trigger.', 'Which marked level would challenge the higher-low idea?'],
    ['Choose a loss budget first', 'Start with an amount you can afford to lose in a simulated trade, then work backwards to size. A £50 budget with a £2 planned loss per share implies at most 25 shares before costs and slippage. The amount is an example, not a recommended limit.', 'Which number is fixed before calculating shares?'],
    ['Judge decisions by information available then', 'A sound plan can lose and an impulsive trade can win. Record the entry reason, invalidation and size before the outcome is known. Reviewing that record prevents the outcome from rewriting your original reasoning.', 'Which notes were available before the result?']
  ]],
  ['Position sizing', 5, [
    ['Turn price distance into money', 'For one share, an entry at £10 and planned exit at £8 imply £2 of planned price risk. If the simulated risk budget is £50, divide £50 by £2 to get 25 shares before costs. Always calculate the distance first.', 'Which two prices create the £2 distance?'],
    ['A wider stop means fewer units', 'With the same £50 budget, a £4 distance allows about 12 whole shares, or £48 of planned price risk. The share count falls as the distance grows. Rounding down keeps the estimate within the budget before costs.', 'Why does doubling the distance roughly halve the share count?'],
    ['Check the instrument details', 'A futures contract may multiply each price point by a contract value; shares do not use that same multiplier. Minimum trade sizes, fees and slippage also change the estimate. Confirm the instrument’s rules before treating a simple division as executable.', 'Which extra multiplier changes the loss per contract?']
  ]],
  ['Reward-to-risk ratios', 5, [
    ['Compare two planned distances', 'An entry at £10, invalidation at £8 and target at £14 has £2 of planned downside and £4 of planned upside per share. The reward-to-risk distance ratio is 2:1 before costs. It says nothing about how often the target will be reached.', 'Which distance is twice as large?'],
    ['A ratio needs a win rate', 'Imagine ten trades with a £2 loss on each loser and £4 gain on each winner, before costs. Three wins and seven losses leave a £2 loss overall. A 2:1 ratio alone cannot show whether a strategy is profitable.', 'What do three wins and seven losses add up to?'],
    ['A distant target is not free reward', 'Moving a target from £14 to £20 makes the displayed ratio larger, but it may also make a win less likely. Use visible structure or a tested method to choose a target, and include spread, fees and slippage in the review.', 'Did changing only the target alter the market path?']
  ]],
  ['Build a trading plan', 5, [
    ['Write observable conditions', 'A useful plan names the context, setup, entry trigger, invalidation, size and exit idea before action. For example: “After a higher low, wait for a close above the prior swing high.” Each condition can be checked on the chart.', 'Which condition can be observed before an entry?'],
    ['Write the stand-aside rule too', '“No trade if the risk distance is too large for the budget” is a decision rule. So is standing aside when the swing sequence is unclear. A plan that only describes entries leaves the hardest decisions unwritten.', 'Which branch of the plan protects you when conditions are missing?'],
    ['Make the plan reviewable', '“The trend feels strong” is hard to test later. “Two higher lows, then a close above the last swing high” is more specific. Specific rules do not guarantee success, but they let you compare what you planned with what you actually did.', 'Which wording could another person verify on the chart?']
  ]],
  ['Review and journal', 5, [
    ['Capture the decision before the result', 'Record the chart context, intended entry, invalidation, size and reason while the outcome is unknown. Save the chart view if useful. Later notes should be added separately so hindsight does not replace the original decision.', 'Which column was written before the outcome?'],
    ['Tag a small number of patterns', 'Labels such as trend, range, breakout and rule violation make repeated decisions easier to group. Use consistent tags, then look across enough examples to see a pattern. One winning or losing trade is a weak sample.', 'Which tag describes the setup, and which describes a process mistake?'],
    ['Review process and outcome separately', 'A good review asks whether the plan was followed, then examines the result. If a rule was ignored, note it even when the trade won. If a valid setup lost, record the loss without rewriting the original reasoning.', 'Which row followed the plan despite a loss?']
  ]],
  ['Biases and patience', 5, [
    ['Notice urgency before acting', 'Fear of missing out can make a fast move feel like the last chance. Compare the available entry with the price and risk you planned. If the distance has grown too large, waiting can be the disciplined choice.', 'Which entry still fits the original risk limit?'],
    ['Write the contrary evidence', 'Confirmation bias draws attention to facts that support your idea. Before acting, name a specific observation that would weaken it, such as a close below a higher low. Then check the chart for that evidence as carefully as the supporting evidence.', 'Which observation challenges the original uptrend idea?'],
    ['Pause after a strong emotion', 'A loss may invite an immediate attempt to win it back; a win may invite an oversized next trade. A short checklist can create space to verify the setup, size and risk again. The next decision should stand on its own evidence.', 'Which checklist item would catch an oversized next trade?']
  ]]
];

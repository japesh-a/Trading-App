// Worked examples pair with the 54 lesson slides. All prices and outcomes are illustrative.
export const lessonNotes = [
  [
    'Read the diagram from the price axis, not from colour alone. The body starts at 100 and ends at 106, so the net change is +6. The upper wick runs from 106 to 108 and the lower wick from 100 to 98. The entire range is 10 points. The candle does not reveal whether the high came before the low.',
    'Now swap only the open and close: open 106, close 100, high 108, low 98. The body is still six points tall and the whole range is still ten points. The colour changes because the net move changes. A red close at 100 tells you where this period ended, not where the next period will begin or finish.',
    'Look at the two small sequences together. The final red candle in the left sequence interrupts a run of higher lows; the final red candle on the right appears after lower highs. Before describing either as a reversal or continuation, mark the nearest swing high, swing low and level that would challenge your interpretation.'
  ],
  [
    'Subtract close from open to measure this bearish body: 106 − 100 = 6 points. The full range is high minus low: 108 − 98 = 10 points. Those measures answer different questions. A large body means a large net change for this period; it does not prove the number of trades, volume, or the exact path between the endpoints.',
    'In the second diagram the low is 96 and the close is 100. Price ended four points above its lowest print. That is a real observation, but the candle cannot tell you why it happened or whether buyers will continue. Compare the recovery with nearby support, recent ranges and the next close before assigning meaning.',
    'The chart shows rising swing lows even though it contains red candles. One declining period can be a pullback within that structure. A more serious challenge would be a sustained move below the latest important higher low. Write down that reference before treating a red candle as a signal to sell.'
  ],
  [
    'Compare the body of each candle with neighbouring bodies on the same instrument and timeframe. A body that spans six points after several one-point bodies stands out. The comparison is relative: it says the net move was larger than recent net moves. It does not tell you that the candle carried unusual volume or that its direction will continue.',
    'The middle candle reaches a high well above its close. That upper wick means price visited the higher area but did not finish there. If the wick meets an earlier resistance zone, the location may be worth watching. A later close above the wick high would weaken the idea that the area is still holding.',
    'The last candle opens and closes close together while travelling much farther between its high and low. Calling the whole period quiet because the body is small would miss most of its movement. Check both body size and total range, then ask whether nearby levels or news made this period different from its neighbours.'
  ],
  [
    'The left and right panels summarise different lengths of time. Four 15-minute candles can fit within one hour, and many such periods can fit within a trading day. A daily candle hides that internal path. Start any chart description by naming the instrument, session and timeframe so another reader knows what one candle represents.',
    'A short bounce can rise while the wider chart remains in a sequence of lower highs and lower lows. That is not a contradiction: the views answer different questions. Mark the local bounce high on the short chart, then identify the nearby wider swing high. The short move may still be far below the level needed to change the larger structure.',
    'A ten-point move can fill half of one chart panel but only a small part of another if their axes are scaled differently. Read the printed prices before comparing visual height. A useful note includes the change in price units or percent and the period over which it occurred, not just a description such as “huge candle.”'
  ],
  [
    'A swing high needs a peak and lower observations on both sides; a swing low needs a trough and higher observations on both sides. The most recent candle may be a potential turning point, but it has no candles to its right yet. Mark confirmed turns first. That avoids declaring a new high or low every time a candle pauses.',
    'Compare high with high and low with low. In the diagram H2 is above H1, H3 above H2, L2 above L1 and L3 above L2. That combination supports a rising sequence. If the next high rises but the next low falls, the evidence becomes mixed; describe the mixed structure rather than forcing an uptrend label.',
    'The last meaningful higher low is a practical reference because a move below it challenges the current sequence. A single wick through the level and a close back above it is different from several closes below. Do not treat a break as an automatic downtrend; wait to observe the following swings and how price behaves around the old level.'
  ],
  [
    'The shaded band captures earlier troughs around 98–101. Two rebounds from that area make it a place to watch when price approaches again. They do not create a physical floor. Before acting, note whether the new approach is fast or slow, whether price closes inside the band and whether there is any later recovery.',
    'Turning points rarely occur at precisely the same price. A narrow line at 100 would ignore a test at 98 and might suggest false precision. A zone records the observed variation. Make it narrow enough to be useful, but wide enough to include the repeated reactions that prompted the idea in the first place.',
    'Compare two possible endings: one candle wicks below 98 and closes back within the band; another closes below the band and later candles stay there. The first shows recovery during the period; the second weakens the support reading. Neither tells you with certainty what the next session will do.'
  ],
  [
    'The shaded band captures earlier stalls around 108–110. A later test is interesting because traders can compare its close with the previous tests. If price reaches the area and retreats, the past pattern has repeated once more. If it closes above and remains there, the old resistance description may need to be revised.',
    'Two touches of a zone can have very different internal behaviour. In one, the candle may close near its low after a long upper wick; in another, it may close near the top of the band. Record the differences rather than simply counting touches. Several closes near the top can show that the reaction is changing.',
    'When price closes above a former resistance band, the label “ceiling” no longer describes current evidence well. A later return to the band is a new observation: does price hold above, pass through, or stall? The prior role of the zone is useful history, but it cannot guarantee that the role has reversed.'
  ],
  [
    'The earlier candles trade repeatedly below the marked 108 boundary. That boundary gives the term breakout a concrete meaning: price has moved beyond a previously observed edge. Without a named edge and a timeframe, “breakout” can be vague. Mark the range before looking at the candle that crosses it.',
    'A wick above 108 that closes below 108 is different from a close above 108 followed by more trading above. The diagram shows the latter path. Still, a later return into the range is possible. When reviewing a breakout, compare the crossing candle, its close and the next few closes, rather than just the highest tick.',
    'Suppose the old boundary is 108 and invalidation is considered near 106. An entry at 109 has roughly three points of planned price risk; chasing at 113 raises that distance to about seven points. With a fixed loss budget, the later entry requires a smaller position. A fast move can therefore make a setup less suitable, even if the chart looks exciting.'
  ],
  [
    'The chart first trades above 108 and then finishes back inside the prior range. That sequence is why the move is called a false break in this example. A crossing alone was not enough to establish a lasting move. The original breakout idea should be reviewed once the close returns below the boundary.',
    'A long wick above 108 with a close below it shows failure within one candle. Another pattern is a close above followed by later closes below. Both end back inside the prior range, but their timing differs. Record whether the failure happened within the same period or after a brief hold outside.',
    'After the return inside, 108 becomes a reference for the next observation. If price moves back above and holds, the failed-break interpretation weakens; if it remains below, the prior range still matters. No opposite trade is required. The useful action is to update the chart description and check whether any planned risk still makes sense.'
  ],
  [
    'The lower bars line up with the candles directly above them. For example, the tall bar under the sixth candle refers to activity during that same period, not the next one. Read price and volume together: a tall bar describes participation, while the candle describes the price range and close. Neither alone reveals what price must do next.',
    'A bar of 900 units stands out against neighbouring bars near 300, but not against bars near 1,200. The baseline matters. Compare periods with similar market hours when possible, since opening and closing sessions can naturally have different activity. One unusually tall bar is a prompt to investigate, not an automatic buy or sell rule.',
    'Check the data source before comparing volume panels. Exchange-traded shares or contracts can report traded units. Some forex feeds report tick volume, which counts price updates seen by that provider. The bars may be drawn the same way while representing different measurements. Label the source in your notes when volume matters to an interpretation.'
  ],
  [
    'The left group has high-to-low ranges of roughly three points; the right group often spans ten or more. Both groups contain green and red bodies. Range describes the size of intraperiod movement, not the direction. Compare several periods because one wide candle might be an isolated event rather than a new typical range.',
    'For a candle with high 108 and low 98, the range is ten points. If it opens at 100 and closes at 101, its body is only one point. A body-only reading would miss the larger excursion. Looking at several ranges gives a better estimate of what ordinary movement currently looks like on that chart.',
    'If ordinary swings are three points wide, an invalidation only one point from entry may be reached during routine movement. Moving a stop farther away also increases loss per unit if filled there. With a fixed money risk budget, the position size must decrease. A stop still does not guarantee the final execution price in a fast market.'
  ],
  [
    'At a quote of bid £9.98 and ask £10.02, a market buy normally seeks available offers, but its actual fill can differ as quotes change. A buy limit at £10.00 caps the price you agree to pay; it can remain unfilled if no seller accepts that price. Choosing an order type means deciding which uncertainty you can tolerate.',
    'A sell stop set at £9.00 is a trigger, not a promised sale at £9.00. After the trigger, a stop order can become a market order, and a fast move might produce a lower fill such as £8.85. A stop-limit can set a minimum acceptable sale price, but then the order may not fill. Check the broker’s exact trigger rules.',
    'The bid–ask spread in the diagram is four pence: £10.02 − £9.98. Buying at the ask and immediately selling at the bid would lose about four pence per share before fees, assuming those quotes and enough size remain available. A small price target must clear spread, fees and any slippage before it becomes a net gain.'
  ],
  [
    'The example entry is near 106 and the last higher low near 98. If the setup depends on that higher low holding, 98 can serve as an invalidation reference. That is a reason for a possible exit, not a claim that a stop will fill at exactly 98. Decide which observation would disprove the idea before looking for a target.',
    'Imagine a £50 simulated loss budget and a planned £2 loss per share. Dividing £50 by £2 gives 25 shares before costs. If the same setup needs a £4 stop distance, 25 shares would imply £100 of planned price risk; the size must fall to about 12 whole shares to keep the original budget.',
    'The plan should contain the context, entry reason, invalidation, size and possible exit while the result is still unknown. A winning trade can result from poor process, and a losing trade can follow a sound rule. When reviewing, compare the original note with the chart information available at that time, then record the outcome separately.'
  ],
  [
    'For shares, entry £10 and planned stop £8 create £2 of price distance per share. A £50 budget divided by £2 gives 25 shares before fees or slippage. This is a calculation of planned risk, not a maximum possible loss: gaps, fast markets and execution costs can increase the realised amount.',
    'Widen the distance from £2 to £4 while holding the £50 budget fixed. The arithmetic gives 12.5 shares; if only whole shares are allowed, round down to 12. That represents £48 of planned price risk before costs. Buying 25 shares with the wider stop would double the planned price risk to £100.',
    'Before using the same formula elsewhere, check the instrument. A futures contract may assign a monetary value to each index point, and a currency pair may have a lot or pip convention. Multiply the price distance by the instrument’s value per unit before dividing the budget. Fees, minimum sizes, margin and slippage can further restrict an executable size.'
  ],
  [
    'From an entry of £10, a stop at £8 is £2 away and a target at £14 is £4 away. Dividing planned upside by planned downside gives 2:1 before costs. It compares distances only. A 2:1 label does not tell you the likelihood of either level being reached or whether the actual fill will match the plan.',
    'Consider ten trades with the same £4 win and £2 loss. Three wins produce £12; seven losses cost £14, leaving a £2 loss before costs. Four wins and six losses would produce £16 − £12 = £4 before costs. The result depends on both the payoff sizes and how often each outcome occurs.',
    'Moving a target from £14 to £20 changes the displayed upside from £4 to £10 and the ratio from 2:1 to 5:1. Nothing about that edit changes the market path or makes £20 more likely. A target needs a reason grounded in observed structure or a tested method, with costs and execution included in the review.'
  ],
  [
    'The flow diagram starts with context: are higher lows actually visible? Only then does it ask for a trigger, such as a close above a named swing high. Next comes the risk check: is the entry-to-invalidation distance small enough for the budget and instrument? Each step is observable before placing a simulated trade.',
    'The branch marked “no trade” is a complete decision. If structure is mixed, the trigger has not happened, or the position cannot be sized within the budget, the plan says to stand aside. Writing this branch beforehand reduces pressure to invent a setup after seeing a fast move.',
    'Compare “the trend feels strong” with “two higher lows followed by a close above the last swing high.” The second phrase can be checked by another person on the same chart. Testable language does not make a method profitable, but it makes later review possible: you can count when the condition occurred and whether you followed it.'
  ],
  [
    'The journal separates information known before the decision from information added later. Record the timeframe, swing context, intended entry, invalidation and size before the outcome is visible. A saved chart image can preserve the original view. Put the fill and result in later columns so they do not overwrite the earlier reasoning.',
    'Use a small stable set of tags, such as trend, range, breakout, late entry and rule violation. “Breakout” describes a setup; “late entry” describes process. Keeping those categories separate helps reveal whether weak results cluster around a market condition or around a habit in execution.',
    'In the sample table, the first row followed its plan and lost; the second row chased and won. If you judged only the money outcome, you would praise the rule violation. Review process first: did the action match the written plan? Then review outcomes across enough examples to see whether the plan itself needs improvement.'
  ],
  [
    'A fast candle can make a planned entry feel urgent. Compare the current price with the entry and invalidation you wrote earlier. If the distance has widened beyond the allowed risk, the original size no longer fits. Waiting is a specific response to that mismatch, not a prediction that the move will reverse.',
    'Before acting on an uptrend idea, write one observation that would weaken it, such as a close below the last higher low. Search for that evidence with the same care you use to find confirming candles. This turns a vague belief into a claim that can be challenged on the chart.',
    'After a win or loss, answer the same checklist again: what is the setup, where is invalidation, what is the size, and does the entry still fit? An urge to recover a loss or press a winning streak is not chart evidence. A short pause allows the next decision to stand on its own stated conditions.'
  ]
];

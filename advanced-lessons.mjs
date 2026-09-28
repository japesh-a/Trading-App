// Append new lessons so existing saved lesson IDs retain their meaning.
export const advancedLessons = [
  {
    title: 'Fibonacci retracement', minutes: 10,
    slides: [
      ['Measure a pullback', 'Fibonacci retracement measures how much of a completed price swing has been retraced. Common levels include 23.6%, 38.2%, 50%, 61.8% and 78.6%. The 50% line is a conventional midpoint, not a Fibonacci ratio. These lines are reference areas, not predictions.', 'Which line represents half of the previous move?'],
      ['Choose the swing before the outcome', 'For a rise from 100 to 120, anchor the tool at the swing low and then the swing high. A 38.2% pullback is 112.36, 50% is 110 and 61.8% is 107.64. For a fall from 120 to 100, measure the rebound upwards from 100 instead. Read price labels because tool percentage conventions can differ.', 'Where is a 50% pullback of the move from 100 to 120?'],
      ['Use context and a trigger', 'A retracement near earlier support can identify an area to observe. It does not justify an automatic buy. Define the reaction you require, the level that invalidates the idea, and the risk before entry. Practise with the Fib tool in the challenge: anchor a visible swing and record your plan before revealing more candles.', 'What evidence would you require beyond a touch of a line?']
    ],
    notes: [
      'Retracement describes movement back through a prior swing; an extension concerns prices beyond that swing. Neither measures the probability of a reversal. A chart with many levels can appear persuasive after the outcome, so decide which swing and conditions you will use before watching the later candles. Level conventions: https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/fibonacci-retracement',
      'The rise is 20 points. Subtract 20 multiplied by the retracement fraction from 120: 120 - 20 x 0.382 = 112.36, 120 - 20 x 0.5 = 110, and 120 - 20 x 0.618 = 107.64. After a fall from 120 to 100, add those distances to 100: 107.64, 110 and 112.36. Use actual swing extremes and one timeframe consistently; changing anchors changes every level.',
      'Write down the chosen low, high and timeframe before replaying. Note any previously identified support separately, then specify an observable trigger such as a close above the pullback high. If the trigger never appears, record no trade. A break of your invalidation ends the idea even if a Fibonacci level remains nearby. Review several examples, including failures, without moving anchors to explain the result.'
    ],
    questions: [
      ['What does retracement measure?', 'How much of a previous swing price gives back', 'How likely the next trade is to win', 'The number of orders waiting at a price'],
      ['Which commonly drawn level is a midpoint rather than a Fibonacci ratio?', '50%', '61.8%', '38.2%'],
      ['For an upward swing, which anchors describe the move?', 'Swing low followed by swing high', 'Two arbitrary closing prices', 'The entry and profit target only'],
      ['What is the 50% pullback price after a rise from 100 to 120?', '110', '60', '115'],
      ['What is the 61.8% pullback price after that rise?', '107.64', '112.36', '123.60'],
      ['What is the 38.2% rebound price after a fall from 120 to 100?', '107.64', '112.36', '92.36'],
      ['What does a touch of a retracement line establish?', 'Price has reached a measured reference level', 'A reversal is certain', 'An entry needs no risk check'],
      ['What happens when you change the swing anchors?', 'The calculated levels change', 'The future path changes', 'The trade becomes safer automatically'],
      ['How should overlapping support and a Fib level be treated?', 'As an area to observe with a defined trigger', 'As a guaranteed floor', 'As permission to double size'],
      ['When should you record anchors in replay practice?', 'Before revealing the later outcome', 'Only after a winning trade', 'After moving them to fit the reversal']
    ]
  },
  {
    title: 'Creating a trading setup', minutes: 10,
    slides: [
      ['Separate the area from the entry', 'A setup describes the conditions that make a trade worth considering; a trigger tells you when to act. An example is an uptrend pulling back towards prior support, followed by a close above the pullback high. Define the instrument and timeframe so another person can check the same conditions.', 'Has the setup formed, and has the trigger actually happened?'],
      ['Build the complete trade', 'An invented share example has entry 110, stop trigger 107 and target 116. Planned price risk is 3 per share and planned reward is 6, a 2:1 ratio before costs. With a simulated budget of 30, ten shares use the full price-risk budget before costs; fees and slippage require allowance or a smaller size.', 'Which prices define risk and reward?'],
      ['Make rejection part of the setup', 'Skip the trade if context is unclear, the trigger is missing, or available entry and size no longer fit your risk limit. Do not move the target simply to create a nicer ratio. In replay, record context, area, trigger, invalidation, size and target, then compare the actual decision with your written setup.', 'Which missing condition would make this a no-trade decision?']
    ],
    notes: [
      'The earlier planning lesson introduced a checklist. Here you assemble one complete example: choose a market and timeframe, describe the swing structure, identify an area of interest, and state the trigger. A Fibonacci line can be an optional location reference, but it is not required. Keep the setup simple enough to recognise without knowing the outcome.',
      'For the invented share trade, 110 - 107 = 3 of planned price risk and 116 - 110 = 6 of planned upside per share. Ten shares imply 30 of planned downside before execution costs, not a guaranteed maximum loss. If entry rises to 113 while stop and target stay fixed, risk becomes 6 and reward 3. Recalculate rather than using the original size or ratio. Other instruments require their contract or pip values.',
      'Use the same setup definition across a series of practice opportunities. Save a chart and the reason when standing aside as well as when entering. Assess whether you followed the definition separately from whether a trade won. Change one condition at a scheduled review and label the new version; otherwise comparisons mix different methods and hindsight can hide weak decisions.'
    ],
    questions: [
      ['How does a setup differ from a trigger?', 'The setup defines conditions; the trigger defines when to act', 'The setup guarantees profit; the trigger sets leverage', 'They always mean the same thing'],
      ['Which description is easiest to verify?', 'A higher low and a close above the pullback high', 'The chart looks ready', 'I feel a bounce coming'],
      ['Why specify a timeframe?', 'The conditions must refer to a consistent view', 'Every timeframe gives identical swings', 'It removes execution costs'],
      ['What is planned price risk per share for entry 110 and stop 107?', '3', '6', '17'],
      ['What is planned reward per share for entry 110 and target 116?', '6', '3', '26'],
      ['What is the reward-to-risk ratio for those prices?', '2:1 before costs', '1:2 before costs', 'A guaranteed two-point profit'],
      ['What do ten shares risk at a three-point stop distance?', '30 before costs and slippage', '3 including all costs', 'Exactly 30 in every possible fill'],
      ['If entry moves to 113 with stop 107 unchanged, what must happen?', 'Recalculate risk and size before entry', 'Keep the original size without checking', 'Move the target until the ratio looks attractive'],
      ['What should happen when the trigger never appears?', 'Stand aside under the written setup', 'Enter because the area was touched', 'Increase size to compensate for waiting'],
      ['What makes a series of practice trades useful for review?', 'A consistent setup recorded before each outcome', 'Changing the rules after every loss', 'Saving only the winning charts']
    ]
  },
  {
    title: 'Writing and following trading rules', minutes: 10,
    slides: [
      ['Write a small rule card', 'A rule card states allowed markets, timeframes and trading times, setup conditions, entry and exit rules, and a simulated risk budget. Use measurable wording. A sample practice card might allow one setup on a 15-minute chart with a 30-unit planned risk budget; those numbers are examples, not recommended limits.', 'Could another person tell whether each rule was followed?'],
      ['Define when the session ends', 'Set a session loss limit, a maximum number of entries and a pause after a rule violation before trading starts. For example, stop after two entries or after reaching 60 units of realised session loss, whichever happens first. Loss limits do not guarantee a maximum loss because fills can slip; do not open another trade once the condition is met.', 'Which limit has been reached first?'],
      ['Practise following the same plan', 'Write your rule card, then apply it across five replay or paper-trading decisions, including no trades. Record the setup, intended risk, action, result and whether each rule was followed. Review adherence and outcomes separately. Five examples practise discipline; they are too few to establish that a strategy has an edge.', 'Did the action follow the rule even when the result was disappointing?']
    ],
    notes: [
      'A useful rule can be answered yes or no using information available at the time. Replace be careful with check that position size fits the written budget before submitting. Specify what cancels an unfilled entry, what invalidates a filled trade, and how a target is chosen. Keep your first practice card short: a few clear conditions are easier to apply and review than a long list of exceptions.',
      'In this invented session, the first completed trade loses 30 and the second loses 30. Both the two-entry cap and 60-unit realised-loss limit now apply. A later perfect-looking setup does not reopen the session. Specify how open risk is checked before an additional entry; losses on simultaneous positions can exceed a realised-loss threshold. A pause is for reassessment, not permission to increase the next size.',
      'For the final exercise, use the same version of the card for five decisions. Record skipped opportunities too. Mark each rule followed, broken or not applicable, then add the financial result separately. A winning violation is still a violation and a compliant loss can still be a valid decision. Schedule changes after the exercise; preserve old records and identify revised rules so later results remain interpretable.'
    ],
    questions: [
      ['Which rule is measurable?', 'Check position size against the written risk budget before entry', 'Try to be more careful', 'Trade when confidence feels high'],
      ['When should session limits be written?', 'Before the session starts', 'After a loss makes them inconvenient', 'Only after a winning streak'],
      ['What belongs on a rule card?', 'Markets, conditions, risk, exits and stand-aside rules', 'Only a desired profit amount', 'Only the last winning entry'],
      ['A session permits two entries. Both are used. What next?', 'Stop entering trades for that session', 'Take a third if it looks good', 'Rename the third entry to ignore the cap'],
      ['A 60-unit realised-loss limit is reached. What should happen?', 'Stop opening trades under that session rule', 'Double the next size', 'Reset the count without recording it'],
      ['Why is a stop-based risk estimate not a guaranteed loss ceiling?', 'Slippage, gaps and costs can increase realised loss', 'Stop orders never execute', 'Every loss is exactly the planned distance'],
      ['How should a winning trade that broke the rules be recorded?', 'As a win and a rule violation separately', 'As proof the rule does not matter', 'As a compliant trade because it won'],
      ['How should a compliant losing trade be reviewed?', 'Check adherence separately from the financial result', 'Automatically call it a mistake', 'Delete it from the journal'],
      ['What can five practice decisions establish?', 'Practice following and reviewing a plan', 'Proof of a profitable strategy', 'A reliable long-term win rate'],
      ['When is the best time to revise the practice rule card?', 'At a scheduled review while preserving the prior version', 'During a losing trade to justify holding it', 'After every candle changes colour']
    ]
  }
];

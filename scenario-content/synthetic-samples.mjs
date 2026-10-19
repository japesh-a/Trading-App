import { buildSyntheticBars } from '../scenario-bank.mjs';

// Sample scenarios built from SYNTHETIC prices (no market data, no licence issues). They are drafts:
// none is eligible for publication until a second person records an approval in reviews.json.
// Family names describe a situation to practise reasoning about, not a pattern that works.
const author = 'wicklume-content-team';
const dataRights = { licence: 'CC0-1.0 (generated for Wicklume)', permittedUse: 'Learning exercises, including redistribution', redistributable: true };
const note = (summary, visibleEvidence, alternativeView) => ({ summary, visibleEvidence, alternativeView });

function make(id, family, difficulty, objective, seed, start, visible, outcome, outcomeLabel, teachingNotes, noise = 0.15) {
  const all = buildSyntheticBars(start, [...visible, ...outcome], { seed, noise });
  const n = visible.reduce((a, [count]) => a + count, 0);
  return {
    id, version: 1, family, difficulty, objective, timeframe: '15m', status: 'draft',
    provenance: { source: 'synthetic', description: 'Synthetic ' + family.replace('_', ' ') + ' sample, seed ' + seed, author, generator: 'buildSyntheticBars' },
    dataRights, visibleBars: all.slice(0, n), outcomeBars: all.slice(n), decisionBoundary: n - 1, outcomeLabel, teachingNotes
  };
}

const base = [
  make('tp-steady-resume', 'trend_pullback', 'beginner', 'Identify where a pullback in an uptrend could be invalidated', 11, 100,
    [[20, 8], [8, -3], [4, 1]], [[12, 5]], 'win',
    note('An orderly pullback after a rise; the plan matters more than the result.', 'Higher highs before the pause and a shallow retracement.', 'The pause could also be the start of a reversal; a stop below the pullback low limits that risk.')),
  make('tp-deep-fail', 'trend_pullback', 'intermediate', 'Judge whether a pullback is still shallow enough to be a pullback', 12, 100,
    [[18, 6], [10, -4.5], [4, 1.2]], [[12, -4]], 'loss',
    note('A deeper retracement that does not resume. A sound plan can still lose.', 'The retracement gave back most of the prior advance.', 'A trader who waited for a new high before acting would have stayed out.')),
  make('br-holds', 'breakout_retest', 'intermediate', 'Define invalidation for a retest of a broken level', 21, 50,
    [[24, 0.4], [3, 3], [6, -2.4], [2, 0.8]], [[12, 4]], 'win',
    note('Price left a range, came back to test it and held.', 'Flat range, a run of expansion bars, then a retest from above.', 'The retest might equally have been acceptance back inside the range.'), 0.12),
  make('br-fails', 'breakout_retest', 'advanced', 'Compare the risk of entering early with waiting for a retest', 22, 50,
    [[24, -0.3], [3, 3], [6, -2.8], [2, -0.5]], [[12, -3.5]], 'loss',
    note('The retest did not hold and price fell back through the level.', 'The retest went deeper than the breakout candles.', 'Waiting for a close back above the level would have avoided this entry.'), 0.12),
  make('rr-sells-off', 'range_rejection', 'beginner', 'Place a stop beyond the edge of a range', 31, 80,
    [[10, 0], [8, 2.5], [8, -2.5], [8, 2.5], [4, -0.4]], [[12, -2.6]], 'win',
    note('Price touched the upper edge of a range a third time and stalled.', 'Repeated turns near the same level.', 'A third touch can also be the one that breaks out.'), 0.2),
  make('rr-breaks-out', 'range_rejection', 'intermediate', 'Notice when repeated tests weaken a range edge', 32, 80,
    [[10, 0], [8, 2.5], [8, -2.5], [8, 2.5], [4, -0.2]], [[12, 3.5]], 'loss',
    note('The same shape as a rejection, but the edge gave way.', 'Visible bars alone do not separate this from a rejection.', 'Staying out until price closed beyond the edge was another reasonable plan.'), 0.2),
  make('fb-reverses', 'failed_breakout', 'intermediate', 'Recognise a move that closes back inside a range', 41, 120,
    [[26, 0.3], [3, 2.6], [5, -2.2]], [[12, -3.5]], 'win',
    note('A push above the range was quickly reversed.', 'The spike closed back under the old high.', 'A single close back inside the range is weak evidence on its own.'), 0.12),
  make('fb-continues', 'failed_breakout', 'advanced', 'Avoid assuming every pullback after a breakout is a failure', 42, 120,
    [[26, 0.3], [3, 2.6], [5, -2.2]], [[12, 6]], 'loss',
    note('It looked like a failed breakout, but price resumed higher.', 'The visible bars match the reversing example exactly in shape.', 'Not acting was also a reasonable decision here.'), 0.12),
  make('vu-whipsaw', 'volatile_unclear', 'advanced', 'Explain why wide swings can make stops hard to place', 51, 200,
    [[6, 4], [6, -4.5], [6, 4.5], [6, -4], [6, 4], [6, -3.5]], [[10, 3], [4, -3]], 'ambiguous',
    note('Wide, alternating bars with no clear direction.', 'Large ranges and no sequence of higher or lower swings.', 'A smaller position or staying out are both defensible.'), 0.8),
  make('vu-sudden-bar', 'volatile_unclear', 'intermediate', 'Compare position size with stop distance when ranges are large', 52, 200,
    [[16, 1], [2, -5], [3, 4], [5, -2.5], [4, 2.5]], [[8, -3], [6, 2]], 'ambiguous',
    note('A sudden large move followed by uneven recovery.', 'One abnormal bar then inconsistent swings.', 'Waiting for conditions to settle is a valid choice.'), 0.6),
  make('nt-quiet', 'no_trade', 'beginner', 'Decide not to act when none of your rules is met', 61, 30,
    [[8, 0.2], [8, -0.2], [8, 0.2], [8, -0.2], [4, 0.1]], [[6, 0.2], [6, -0.3]], 'none',
    note('Small, overlapping bars with no level to measure risk against.', 'Compressed ranges and no clear level.', 'A trader with a rule for quiet markets could act, but needs a stated reason.'), 0.1),
  make('nt-then-moves', 'no_trade', 'intermediate', 'Judge a decision by the information available at the time', 62, 30,
    [[10, 0.3], [8, -0.3], [8, 0.3], [6, -0.2]], [[12, 5]], 'ambiguous',
    note('Quiet conditions that later moved sharply; staying out was still reasonable on what was visible.', 'No setup or invalidation level in the visible bars.', 'The later move does not make the earlier decision unsound.'), 0.1)
];

// F28: reviewed, scenario-specific criteria for recognising a well-reasoned decision to stay out. They use only
// what is visible at the decision bar; the outcome bars never feed them. Scenarios without criteria offer no badge.
const noTradeCriteria = {
  'vu-whipsaw': { reasons: ['volatile_conditions', 'unclear_structure', 'poor_risk_reward'], evidenceTerms: ['wide', 'swings', 'whipsaw', 'volatile', 'alternating', 'ranges', 'stop'] },
  'vu-sudden-bar': { reasons: ['volatile_conditions', 'poor_risk_reward', 'unclear_structure'], evidenceTerms: ['large', 'abnormal', 'sudden', 'spike', 'volatile', 'uneven', 'stop'] },
  'nt-quiet': { reasons: ['unclear_structure', 'poor_risk_reward'], evidenceTerms: ['quiet', 'small', 'overlapping', 'compressed', 'sideways', 'level', 'chopping', 'range'] },
  'nt-then-moves': { reasons: ['unclear_structure', 'poor_risk_reward'], evidenceTerms: ['quiet', 'small', 'overlapping', 'sideways', 'setup', 'invalidation', 'level', 'range'] }
};
export const scenarios = base.map(s => noTradeCriteria[s.id] ? { ...s, noTradeCriteria: noTradeCriteria[s.id] } : s);

# Accessibility and resilience

Wicklume targets WCAG 2.2 AA as a product standard. This page does not claim a "perfect" interface: it lists measurable criteria and what is checked automatically versus by hand. Automated checks are in `accessibility.test.mjs`.

## Measurable criteria

| Criterion | Target | How checked |
| --- | --- | --- |
| Text contrast (both themes) | at least 4.5:1 for body text and muted text on panels | automated, from the CSS variables |
| Touch targets | at least 44 px on touch devices (`pointer: coarse`) | automated CSS rule check; manual on a phone |
| Focus | visible 2 px outline on every control; skip link to the workspace | automated CSS check; manual keyboard pass |
| Reduced motion | animations and transitions effectively off | automated CSS check |
| Chart information | text summary and latest-candles table beside the chart | automated (`chartSummary`) |
| Meaning not by colour alone | feed, save and result states carry text labels | automated for status chips |
| Work not lost | lesson position and drafts survive navigation, blocked storage and failed saves | automated (draft keeper, storage fallback tests) |
| Slow backend | after 4 s a "waking up" message; after 20 s a retry action | automated (`wakeUpStatus`) |

## Manual review checklist (run before each release)

1. Keyboard only: skip link, navigation, a lesson and quiz, the daily challenge (set levels, write reasoning, submit), the journal, the account dialog (focus is trapped and returned on close).
2. Screen reader (VoiceOver or NVDA): headings, status messages, chart alternative, form labels.
3. 320 px wide and 200% zoom: nothing is cut off or needs two-axis scrolling, order entry is usable.
4. Block site storage in the browser: a warning appears and work continues for the tab.
5. Go offline during a draft: the status chip shows offline and the draft is still there when back online.
6. Stop the backend and reload: a clear waking-up or error state with a retry, never a blank page.
7. Record the result, browser and device, and file tickets for failures.

Usability testing with representative users (including 16–17-year-olds) follows the research process in the backlog; no results are claimed here.

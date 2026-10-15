# Wicklume: contributor feature backlog

Prepared 15 October 2026 for [japesh-a/Trading-App](https://github.com/japesh-a/Trading-App).
Reviewed main at commit 87716ae69b7f9e0dcd0a383cf830c08aa44f6b45.
This is a delivery specification, not a claim that the features are implemented or that legal compliance has been certified.

## Agreed product scope

- UK trading education and simulated trading, including users aged 16–17.
- Google sign-in and hosted accounts with progress saved across devices.
- A short personalised question session after all lessons are completed, with continued daily practice and a streak.
- Randomised daily chart challenges: conceal the market/date and rebase prices to an index.
- An AI-assisted trade journal and improved interface.
- A personal rules checklist before challenges, recognition for well-reasoned no-trade decisions, and targeted revision for repeated misunderstandings. These three ideas are approved product features.
- Freemium business model.
- No budget currently allocated. For planning, assume £0 recurring spend for the prototype; confirm if the intent was merely that the budget is undecided.

The core loop is: learn → plan → simulate → reflect → revisit weak topics.
Rewards should recognise learning and thoughtful decisions, including deciding not to trade.

## What already exists

These findings come from the README and source inspection, not a live production or security audit.

| Area | Current implementation | Work remaining |
| --- | --- | --- |
| Lessons | 21 lessons, 210 quiz questions, diagrams and a five-category skill profile | Mastery review, post-course daily questions and content review |
| Hosting | Static GitHub Pages demo plus Node.js 24+ backend with SQLite | Durable hosted service, operations and deployment verification |
| Accounts | Google token verification, email/password accounts, secure session support and Google account linking | Production configuration, account lifecycle and privacy controls |
| Charts | Bundled TradingView Lightweight Charts, replay, drawings, trade levels and timeframes | Reliable licensed feeds and targeted usability work |
| Daily challenge | One previous-day BTC session, shared by all users; connected submissions are calculated server-side | Scenario bank, concealed identity, price rebasing, per-account allocation and fair scoring |
| Journal | Trade records, notes, snapshots, search, statistics and CSV export | Notes/snapshot sync, structured reflection, persisted AI reviews and cross-trade summaries |
| AI | Server-side coach reviews completed daily trades | Course-aware questioning, paper-trade reviews, journal-wide insight and age-appropriate evaluation |
| Streak | Existing UTC activity streak | Shared server rules, daily review completion and clear reset messaging |
| Compliance | Some educational/simulation language and software attribution | Legal documents, privacy operations, children’s design assessment and launch review |

[Repository README](https://github.com/japesh-a/Trading-App/blob/87716ae69b7f9e0dcd0a383cf830c08aa44f6b45/README.md).
The current Pages build is browser-local unless connected to an API. Journal notes, drawings and screenshots are not all restored across devices.

## Delivery stages and ownership

P0 = required before an external user pilot. P1 = required for the intended product release. P2 = later.
Priority indicates release dependency, not an instruction to build every ticket at once.
An owner below means the role responsible; contributors can claim individual IDs.

| ID | Feature | Priority | Suggested owner | Depends on |
| --- | --- | --- | --- | --- |
| F01 | Confirm scope, free/premium split and release gates | P0 | Product | — |
| F02 | Durable storage and migration strategy | P0 | Backend | F01 |
| F03 | Hosted pilot and deployment pipeline | P0 | Backend/operations | F02 |
| F04 | Production Google sign-in and account lifecycle | P0 | Backend | F02, F03 |
| F05 | API isolation and application security | P0 | Backend/security | F02 |
| F06 | UK privacy, terms and consumer documents | P0 | Product/legal/privacy | F01 |
| F07 | Design and privacy requirements for ages 16–17 | P0 | Design/privacy | F06 |
| F08 | Legal acceptance, privacy controls and deletion | P0 | Backend/frontend | F04, F06, F07 |
| F09 | Market-data rights and charting decision | P0 | Product/backend | F01 |
| F10 | Reliable datafeed and simulation behaviour | P1 | Backend/charting | F09 |
| F11 | Reviewed historical scenario bank | P1 | Content/backend | F09 |
| F12 | Stable random allocation per user/day | P1 | Backend | F04, F11 |
| F13 | Concealed, indexed challenge chart | P1 | Backend/charting | F11, F12 |
| F14 | Submission locking, replay and fair scoring | P1 | Backend | F05, F12, F13 |
| F15 | Course completion and mastery evidence | P1 | Learning/backend | F04 |
| F16 | Personalised post-course daily questions | P1 | Learning/AI | F15, F07 |
| F17 | Shared streak rules and daily activity history | P1 | Backend/frontend | F14, F16 |
| F18 | Structured journal and cross-device sync | P1 | Backend/frontend | F02, F04, F08 |
| F19 | AI journal review and weekly summaries | P1 | AI/backend | F18, F07 |
| F20 | AI safety, evaluation, privacy and cost limits | P0 for any AI release | AI/privacy | F06, F07 |
| F21 | Navigation, visual design and mobile refinement | P1 | Design/frontend | F01, F07 |
| F22 | Accessibility, resilience and user testing | P0 for core flows | Frontend/QA | F21 |
| F23 | Content/scenario administration and support | P1 | Backend/content | F05, F11 |
| F24 | Privacy-conscious analytics and reliability | P0 for pilot basics | Operations/product | F06, F08 |
| F25 | Premium entitlements, payments and cancellation | P2; required before charging | Backend/product/legal | F06, F08 |
| F26 | Contributor documentation and release checks | P0 | Maintainer/QA | F01 |
| F27 | Personal trading-rules checklist | P1 | Learning/frontend/backend | F04, F14, F18 |
| F28 | Recognition for well-reasoned no-trade decisions | P1 | Learning/backend | F11, F14, F17, F18 |
| F29 | Targeted revision for repeated misunderstandings | P1 | Learning/backend | F15 |

## Hosting, accounts and security: F01–F05

**F01 — Product decisions.** Record the 16+ eligibility rule, educational scope, initial market coverage, free/premium split and feature flags. Proposed free core: all fundamental lessons, Google account, basic journal, one daily challenge, reviewed daily questions and data export. Proposed premium: capped AI reviews, deeper journal summaries and an expanded scenario archive. Export, deletion and essential risk explanations remain available to everyone. No real orders, deposits or broker credentials.

**F02 — Durable storage.** Keep the existing frontend and trading engine. Choose storage before deploying: the current SQLite file requires a persistent disk. For a £0 pilot, investigate a free Node host plus an external free PostgreSQL database, with a small persistence abstraction and explicit migration work. Do not mount the current SQLite database on an ephemeral filesystem. Preserve account IDs, quiz evidence, trades and streak history. Add versioned migrations, uniqueness constraints and a tested backup/restore procedure.

**Acceptance:** restart/redeploy does not lose users or journals; two accounts cannot read or overwrite each other; migration and restoration are rehearsed against test data.

**F03 — Hosting.** Serve frontend and API from one HTTPS origin; use a provider subdomain initially. Add staging, environment examples without secrets, health checks, deployment checks, rollback instructions and quota monitoring. Retain Pages as a clearly labelled guest demo. A free Node host plus free external database is a pilot option, not a production reliability promise: [Render documents idle suspension, ephemeral files and restrictions](https://render.com/docs/free); [Supabase documents its free database quotas and inactivity pausing](https://supabase.com/pricing). Record processor terms, location and transfer arrangements before storing participant data.

**Acceptance:** an invited user can sign in, complete a lesson, record practice and recover it on a second device. The pilot has a documented quota/failure response and no automatic paid upgrades.

**F04 — Google accounts.** Complete production OAuth configuration and reuse the existing server verification. Test allowed origins, invalid/expired tokens, sign-out, account linking and session expiry. Google identity does not establish age eligibility. Prefer Google-only sign-up for the first pilot; if password registration stays visible, finish verification/recovery and abuse controls before launch.

**Acceptance:** Google sign-in works outside the developer test account; an email collision never silently links accounts; expired/revoked sessions fail safely; private email never appears on a leaderboard. Follow [Google’s server verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

**F05 — Security.** Authorise every account-owned record server-side; add CSRF/origin protections appropriate to cookie sessions, input/output sanitisation, rate limits, secure headers compatible with Google, secret management and private audit logs. Retire or isolate legacy shared-progress endpoints in server.mjs: /api/progress, /api/answer and /api/decision use one shared progress record and must not become an alternative account data path. Verified results must require an eligible signed-in account; current anonymous sessions must not qualify as competitive accounts. Database constraints must enforce attempt limits under concurrency.

**Acceptance:** cross-account access, duplicate submissions, unauthorised edits and browser-edited scores are rejected; guest/demo state cannot become a verified result.

## UK legal, privacy and ages 16–17: F06–F08

**F06 — Documents and operating procedures.** Prepare:
- Terms of use: operator identity/contact, eligibility, acceptable use, simulated results, availability, account suspension/appeals and lawful liability provisions.
- Privacy notice: actual data collected, purposes/lawful bases, providers, AI processing, retention, transfers, rights and contact.
- Cookie/storage information plus controls where consent is required. Inventory local storage and third-party scripts as well as cookies; assess applicable exemptions against current ICO guidance.
- Clear trading risk, simulation and AI limitations at relevant screens.
- Support/complaints process; privacy request, security incident and breach-response procedures.
- For paid launch: clear pricing, renewals, cancellation/refunds, digital-service consumer rights and an appropriate purchasing flow for younger users.

Record the UK regulatory perimeter assessment before launch and repeat it if recommendations, broker referrals or promotions are added. Do not claim “FCA approved” or “fully compliant” without a valid basis. Calling something educational does not decide its legal status: the [FCA’s personal-recommendation guidance](https://handbook.fca.org.uk/handbook/perg8/perg8s41) explains why a disclaimer may not change the substance. Marketing and any affiliate arrangements need separate review against [FCA financial-promotion guidance](https://www.fca.org.uk/publications/finalised-guidance/fg24-1-finalised-guidance-financial-promotions-social-media).

**Acceptance:** documents describe the deployed product and named operator, with version/date and a review owner; no placeholders remain at launch. Appropriate UK legal/privacy review is completed before an external pilot involving minors. A document pack alone does not establish compliance.

**F07 — Under-18 design.** Users aged 16–17 are children for the Children’s Code. Assess the whole service, with high privacy defaults, a documented impact assessment, proportionate age assurance, understandable notices and restrained notifications. Prefer child-appropriate defaults for everyone to simplify launch. No public profiles, private messaging, behavioural advertising, broker promotions, manipulative upgrade prompts or public profit rankings in the initial product. Do not require daily trading to protect a streak. Explain personalisation, allow it to be disabled, and provide useful generic questions when disabled. Review AI provider terms, minimum-age rules and any required parent/guardian involvement; do not assume Google login resolves them.

The [ICO Children’s Code introduction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code) describes the scope for services likely to be accessed by under-18s.

**Acceptance:** a 16-year-old can understand what is saved and shared, decline optional personalisation, use the learning flow privately and receive no prompt to increase trading activity or risk. The eligibility and age-assurance approach are documented and reviewed.

**F08 — Privacy controls.** Separate contractual acceptance from optional marketing/AI choices. Record terms version and acceptance time; provide just-in-time AI information before journal content is sent to a provider. Document lawful bases rather than assuming consent covers every processing purpose. Add account export/deletion, retention jobs and a process covering providers and backup expiry; reapply deletion requests when restoring backups.

**Acceptance:** users can exercise rights without a paid account; deletion revokes sessions and follows the documented retention schedule; withdrawn optional choices stop future processing. Verify storage/cookie behaviour against [ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/) and AI processing against [ICO AI guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-do-we-ensure-fairness-in-ai/).

## Charts and daily challenges: F09–F14

**F09 — Charting and data rights.** Retain Lightweight Charts for the first release. Its renderer is already integrated, including drawings and replay. “TradingView integration” and “market-data API” are separate work packages. TradingView’s [Advanced Charts documentation](https://www.tradingview.com/charting-library-docs/latest/introduction/) says its free deployment must be public and not behind a paywall, and it includes no market data. Resolve licensing explicitly before considering it for a signed-in/freemium product. Obtain separate rights for historical storage, redistribution, anonymised challenges, screenshots and commercial use; publicly accessible prices are not automatically licensed for every use.

**Acceptance:** a short decision record names the renderer, data provider, supported instruments, permitted uses, attribution and fallback. Keep [Lightweight Charts attribution/licence materials](https://github.com/tradingview/lightweight-charts).

**F10 — Data and simulation.** Reuse the Coinbase/Twelve Data adapters where permitted. Add provider health, cached histories, consistent timestamps, trading calendars, missing-bar handling, stale-quote indicators and explicit connected/delayed/synthetic labels. Add configurable spread, fees and slippage only where data and specification support them; explain simulation assumptions. No silent substitution of synthetic prices into a connected session.

**Acceptance:** changing timeframe preserves drawings/trade levels; aggregated charts use only revealed candles; stale/missing data cannot silently produce verified fills.

**F11 — Scenario bank.** Start with 4–6 setup families and several reviewed examples per family: trend pullback, breakout/retest, range rejection, failed breakout, volatile/unclear conditions and a valid no-trade situation. Do not describe the families as guaranteed patterns. Use a wider historical pool rather than always yesterday’s BTC. Tag difficulty and learning objective using information visible before the decision; include losing/ambiguous examples to reduce hindsight selection. Store outcome data privately, outside the public repository and Pages assets.

**Acceptance:** each scenario has provenance, data rights, valid OHLC bars, a fixed decision boundary, reviewed teaching notes and a version; reviewers approve the exercise before publication.

**F12 — Random distribution.** Allocate a scenario from the daily eligible pool server-side, then persist the assignment per account/day. Refreshing, signing out or switching device returns the same assignment. Track recent scenarios to reduce repeats, distribute comparable difficulty fairly, and avoid predictable public IDs. Different users can receive different reviewed examples.

**Acceptance:** allocation survives restart; duplicate concurrent requests return one assignment; users cannot choose variants or reroll by editing requests. Multiple-account abuse remains a limitation and needs proportionate controls.

**F13 — Indexed chart.** Hide source market/date before commitment and use relative bars/time labels. Rebase every OHLC value using the same positive factor: indexedPrice = originalPrice / referencePrice × 100. Preserve candle relationships, returns and chronological order. Mask identifying information consistently in API metadata, titles, source labels, IDs, snapshots, context data and tooltips. Provide required generic provider attribution without leaking the scenario identity; validate that this is permitted. Standardise or omit identifying volume where educationally appropriate. All challenge timeframes use the same concealed timeline and price scale.

**Acceptance:** changing chart timeframe or inspecting pre-submit network traffic reveals neither future candles nor original market/date/price mapping. Percentage moves and invalidation levels remain consistent. Indexed results display percentage/R units; raw instrument lot values do not reveal the original scale.

**F14 — Commit and score.** Require Long, Short or No trade, with structured reasoning and applicable entry/stop/target before reveal. Commit once per account/day in a database transaction; retries return the saved result. Lock edits after commitment. Replay can reveal the outcome after commitment, and exercise versions/fill assumptions remain reproducible. Scoring separates rule adherence, risk calculation and reasoning from profit/loss. Use deterministic calculations and reviewed rubrics; AI feedback does not determine competitive rankings. Capture the personal checklist from F27 and apply the no-trade recognition rubric from F28. If rankings return later, compare matching scenarios/difficulty and normalised risk; never mix different setups on raw cash P/L.

**Acceptance:** no pre-commit endpoint, static asset or client-side seed contains the future; concurrent submissions cannot create extra attempts; a well-reasoned no-trade choice can complete the challenge and earn learning credit. Test leakage, replay boundaries and server score enforcement. State that concealment reduces answer lookup rather than guaranteeing cheat prevention.

## Personalised questions, streaks and journal: F15–F20

**F15 — Completion and mastery.** Unlock the post-course daily review once the server confirms completion of the required initial curriculum (currently 21 lessons). Existing completion means answering all questions, not demonstrating mastery: retain that distinction and first-answer evidence. Do not relock graduates whenever new optional lessons are added. Recommend targeted revision for weak areas.

**Acceptance:** the browser cannot fake eligibility; content updates preserve achieved completion; users can see why a lesson was recommended.

**F16 — Daily learning coach.** Offer 3 questions per day as the initial default, about 3–5 minutes total: one weak-topic question, one spaced-repetition question and one reflection on recent practice. Use F29's concept evidence to select the weak-topic question. With no trade history, use a generic historical example. Link answers and explanations to the curriculum. Save session/answers so the user can resume; avoid repeating recent questions. Short-answer reflection complements objective questions but does not become an AI-scored gate.

Start the £0 pilot with reviewed questions and rule-based selection, labelled “Daily review.” Add genuine AI conversational follow-ups behind a feature flag once provider suitability, evaluations and a usage budget are resolved. Do not label a scripted flow as AI or depend on a free API allowance remaining available.

**Acceptance:** two learners with different evidence receive relevant variation; completing the fixed daily set records one completion; disabling personalisation still gives a useful session. An unavailable AI provider never blocks learning.

**F17 — Streak.** Retain UTC day boundaries initially to preserve existing history; explain the reset in local time. One streak day can be earned by a completed lesson quiz, completed daily question set, or a challenge plus reflection. Profit, accuracy and number of orders do not affect the streak. Persist qualifying events server-side; combine multiple activities into one day. Show current/best streak and weekly history. No paid streak rescue or guilt-based reminders.

**Acceptance:** midnight, retry, clock manipulation, sign-in and device-switch cases behave consistently. A user can retain a streak without placing a simulated trade. Establish a migration policy for existing activity days.

**F18 — Journal.** Add structured pre-trade plan, setup tag, risk %, entry/stop/target, optional emotion/self-assessment, outcome and reflection. Support paper trades and no-trade decisions. Preserve immutable execution facts separately from editable notes. Synchronise notes, tags, drawings and appropriately sized snapshots; use conflict handling to avoid silently overwriting edits. Keep verified, imported and synthetic records distinguishable.

**Acceptance:** a reflection edited on one device appears on another; exports include permitted structured data; chart attachments are private; a deleted journal entry follows the deletion policy. Existing CSV formula neutralisation is preserved.

**F19 — AI journal.** Extend beyond the current completed-daily-trade endpoint to paper practice and user-selected journal entries. Produce one evidence-based strength, one specific improvement, one reflection question and a suggested lesson. Weekly summaries identify repeated documented behaviours, cite relevant entries and state when evidence is insufficient. Compute statistics in application code. Keep user statements, calculated facts and AI interpretation visibly distinct. Save model/prompt version and review time; allow correction/reporting. Ask before analysing optional sensitive journal content, and minimise what is sent externally.

**Acceptance:** no invented trades, patterns or statistics; a sound losing plan can receive positive process feedback; a profitable reckless plan is not rewarded. Private entries from another account are inaccessible. AI reviews can be deleted and are never represented as live investment recommendations.

**F20 — AI release gate.** Use curriculum and supplied practice evidence, with bounded context and no order tools. Redact unnecessary identity, cap length, enforce per-user/global token and request quotas, add timeout/retry limits and a kill switch. Evaluate prompt injection, hallucinations, live-signal requests, inappropriate personalisation, age-appropriate wording and missing evidence. Define a human review/report process and retention/provider controls.

**Acceptance:** a documented evaluation set passes the agreed rubric before AI is enabled; usage stops safely at the configured quota; no user key is exposed in browser code; failure falls back to reviewed educational material. AI remains a planned feature until these conditions and its operating cost are met.

## Interface, operations and contributors: F21–F26

**F21 — Interface refinement.** Keep the existing visual identity and audit real tasks before redesigning. Make the dashboard’s primary action “Continue lesson” before graduation and “Daily review” afterwards. Simplify navigation around Learn, Practice, Journal and Progress. Distinguish daily challenge from open paper practice. Show save/sync status, clear feed type and recovery actions. Improve chart tool discoverability, mobile order entry, spacing, type hierarchy, theme consistency and empty/error/loading states.

**Acceptance:** first-time users can find the next lesson, recognise simulated prices, complete a challenge and locate reflection without assistance. Validate desktop and narrow/mobile layouts with representative users, including 16–17-year-olds using an appropriate research process.

**F22 — Accessibility and resilience.** Target WCAG 2.2 AA as a product standard: keyboard flows, focus, screen-reader labels, accessible alternatives to essential chart information, contrast, touch targets, reduced motion and no colour-only meaning. Preserve lesson reading positions and drafts through navigation/auth. Test browser storage restrictions, offline transitions and slow/free-tier backend wake-up.

**Acceptance:** core journeys work by keyboard and on mobile; failed save/login/API calls do not silently lose work; accessibility checks include manual review. Do not promise a “perfect” interface—publish measurable usability criteria.

**F23 — Administration.** Add protected tools to review/publish/retire scenarios, manage question versions, inspect aggregate failures and handle user reports. Restrict staff access to private journals to an explicitly authorised support process. Start with reviewed content files and small protected controls rather than a large CMS.

**Acceptance:** published scenario versions cannot silently change completed results; administrative mutations are authorised and audited; support access is limited and recorded.

**F24 — Analytics and operations.** Measure course completion, daily review completion, return visits, journal reflection, sync/API failures and AI costs. Avoid raw journal text in analytics and avoid tracking for advertising. Define retention and obtain consent where required. Add operational error alerts, backups, restoration rehearsals and incident ownership. Treat free-tier service interruption as a visible state.

**Acceptance:** maintainers can diagnose failures without seeing credentials or journal content; account deletion and opt-out choices are respected.

**F25 — Freemium and payment.** Build entitlement checks server-side when payments are introduced. Use hosted checkout, verified/idempotent webhooks, clear price/renewal information, self-service cancellation, invoices and documented refund behaviour. Review the contracting/payment flow for users aged 16–17. A downgrade preserves journal data and rights requests; paid AI uses an explicit allowance. No manipulative upsells or risk/profit promises.

**Acceptance:** a browser cannot grant premium access; duplicate webhooks do not duplicate entitlements; cancellation follows published terms; an exhausted AI allowance does not disable the free learning core.

**F26 — Contributor handover.** Add an example environment file, architecture/data-flow notes, migration instructions, feature flags, data/AI provider setup, contribution guidance and issue templates. Choose an explicit repository code licence; the existing third-party chart licence does not license the app’s own code. Capture content contribution permissions. Each issue records ID, owner, dependencies, scope, acceptance criteria and validation.

**Acceptance:** a new contributor can run the project without production secrets and complete one ticket independently. Use existing npm test/build checks, add meaningful service checks for new security/data behaviours, and run chart browser checks for chart changes. No app tests were run as part of this planning review.

## Approved learning additions: F27–F29

These features were selected by the product owner from ideas 1, 4 and 5 in the review: the personal checklist, no-trade recognition and targeted revision. Include them in the free learning core. They must work without an AI provider.

**F27 — Personal rules checklist.** Let users create, edit and save a short personal playbook, supported by reviewed educational prompts: identify the setup, describe invalidation, check simulated risk and explain why a decision meets their rules. Show the relevant checklist before committing a daily challenge; make it available in paper practice too. Allow users to record a rule as met, not met or not applicable, with a short explanation. User rules cannot override platform risk limits. Store a snapshot of the rule version and responses with the committed decision so later edits do not rewrite history. No-trade decisions use applicable checks without requiring invented entry/stop/target values. The checklist records the learner's self-assessment; it does not certify a safe or profitable trade.

**Acceptance:** the playbook syncs across devices; the challenge presents it before commitment; the journal restores the exact checklist used for that decision; editing rules affects future decisions only. Required educational planning fields remain enforced server-side, and users can choose No trade when their criteria are not met. Keyboard and mobile users can complete the flow.

**F28 — No-trade recognition.** Make a well-explained decision to stay out a first-class challenge result. Require a structured reason and supporting observation before reveal, then a short reflection afterwards. Use scenario-specific, reviewed criteria based on information visible at decision time. Reasons can include an unclear setup, inadequate invalidation or failure to meet the learner's documented rules; simply clicking No trade does not earn a quality badge. Award ordinary challenge completion/streak credit after the required reflection, separately from an optional private badge for meeting the reviewed reasoning rubric. Use a fixed learning reward rather than cash/P&L rewards, and do not offer extra credit for repeatedly submitting the same decision. A later price move must not retrospectively invalidate sound reasoning.

**Acceptance:** a qualifying no-trade decision appears in the journal, can retain the streak and earns its learning recognition once. Incomplete or unsupported reasoning does not earn the quality badge. All outcome directions use the same pre-decision reasoning criteria; no AI grading is required. The user can see why recognition was awarded, and a record with no position is excluded from trade-only P/L, win-rate and average-R calculations.

**F29 — Targeted revision.** Tag reviewed questions with stable lesson/concept IDs and, where useful, the misconception each wrong answer represents. Track first-answer evidence across distinct questions; do not count retries or duplicate submissions as new evidence. As an initial configurable rule, two independent errors on the same concept trigger a private revision suggestion explaining the evidence and linking to the relevant lesson section. Offer a brief recap plus 2–3 different reviewed questions. After graduation, feed the same evidence into the daily coach's weak-topic slot. During the course, revision remains available without waiting for all lessons to be completed. Users can also request help with a topic themselves. Use objective answer evidence for automatic triggers; an AI interpretation of free-text notes alone cannot lower a mastery score or trigger a compulsory task.

**Acceptance:** two relevant independent errors create one understandable suggestion; duplicate requests/retries do not multiply it; revision preserves original first-answer history. Fresh correct answers update the learning evidence and reduce repeated prompts, with a documented rule for resolving a suggestion. Users can dismiss or revisit revision without losing progress or a streak. Disabling optional personalisation gives access to a generic revision library without continuing personalised recommendations. Missing AI service has no effect on the feature.

## Recommended release order

1. Contributor setup and scope; privacy/under-18 design work; storage and hosting decisions.
2. Hosted account pilot with isolation, deletion/export, backups and basic accessible flows.
3. Reviewed scenario pool, concealed/indexed allocation, locked submissions and no-trade recognition (F28).
4. Daily review, streak integration, synchronised structured journal, personal rules checklist (F27) and targeted revision (F29).
5. Evaluated AI questions/journal reviews when provider suitability and budget permit.
6. Paid entitlements after reliability, consumer terms and younger-user purchase flows are ready.

The £0 pilot can validate Google accounts, reviewed lessons/questions, indexed historical challenges and a basic journal. Do not promise unlimited AI, licensed multi-market live data, reliable paid-service hosting or completed legal review at no cost. A sustainable production service needs a separate operating-budget decision.

## Additional ideas worth including

- Spaced repetition complements the approved targeted revision feature (F29).
- Side-by-side original plan and later reflection to reveal hindsight edits.
- Weekly process goals such as “document invalidation in three exercises.”
- Additional cosmetic learning milestones beyond the approved no-trade recognition (F28).
- A glossary and practice sizing calculator using explicit simulated assumptions.
- A scenario archive after the active challenge closes, when data rights allow.

## Exclude or defer

- Real-money execution, deposits, broker connections and copy trading: outside agreed scope.
- Live buy/sell signals, personalised portfolio picks or promises of profitability.
- Public cash-profit rankings and rewards for frequent trading, especially for younger users.
- Community chat/private messages in the first release: unnecessary moderation and privacy scope.
- Broad real-time data coverage before licensing and cost are established.
- A full charting-library or frontend rewrite without a demonstrated need.
- Unlimited AI and paid “streak repair.”
- Claims that indexing prevents all cheating or that adding terms establishes full compliance.

## Remaining decisions

1. Is “no budget” a strict £0 pilot limit or an unallocated budget?
2. Which markets are essential first: BTC only, or also gold, US500 and GBP/USD? Default: a small legally cleared historical set; no promise of free live coverage.
3. Are 3 daily questions the right default? Proposed cadence is daily, with the initial session after course completion.
4. Who is the named operator/controller and legal/privacy review owner?
5. Which premium features should be sold first, and what is the eventual AI allowance/price?

These decisions can be made without blocking contributor work on documentation, reviewed content, interface prototypes and storage/security design.

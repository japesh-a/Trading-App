# Wicklume

An interactive trading education workspace. [Open the website](https://japesh-a.github.io/Trading-App/) or [report an issue](https://github.com/japesh-a/Trading-App/issues).

The learning path has 18 open lessons, 54 topic-specific diagrams, worked examples, and 180 questions. Search lessons by topic; reading position and unfinished quizzes resume when you return. Lesson links support browser back/forward and direct URLs such as `#lesson/13`. The trading workspace adds a previous-day BTC chart challenge, drawing and annotation tools including Fibonacci retracement, draggable entry, stop and target levels, 24-hour bar-by-bar replay, simulated P/L, a trade journal, and an open paper account for BTC, US500, gold, and GBP/USD. The journal offers search, ten-trade pages, whole-history statistics, automatic review-note saving, and CSV export of the current filtered view. Text formulas are neutralized in CSV exports. Daily replay charts offer 15m, 1h, 4h and 1d views. Paper charts offer 1m, 5m, 15m, 1h, 4h and 1d views.

Choose **Use training mode** while a feed loads, or **Training mode** from an available feed, to practise immediately with clearly labelled synthetic prices. Training sessions stay separate from connected-session drafts and never enter verified rankings. Entry method, direction, stop, target, risk, notes, and drawings are retained when you leave an unfinished plan. Completed practice also counts towards the UTC activity streak. Keyboard users can skip to the workspace, navigate lessons, and pan/zoom charts with arrow keys, plus/minus, and R; Escape cancels a drawing and updates the selected tool.

## Run locally

Use Node.js 24 or newer; no package installation is needed.

```powershell
npm.cmd run dev
```

Open `http://localhost:5173`. The optional server stores authenticated learning progress, verified daily results, paper positions, and leaderboards in `data/wicklume.db`. Anonymous browser sessions are device-specific. Set `WICKLUME_DATA_DIR`, `WICKLUME_DB`, or `WICKLUME_PORT` to change storage or port. A hosted server can use `PORT` and `WICKLUME_HOST=0.0.0.0`; its SQLite database needs persistent storage.

For the AI trade review, set **both** `OPENAI_API_KEY` and `OPENAI_MODEL` on the server. The key never belongs in a browser file. For connected US500, gold and GBP/USD quotes, set `TWELVE_DATA_API_KEY`; `TWELVE_DATA_US500_SYMBOL` can override the index symbol. BTC history and quotes use Coinbase. For a separate web frontend, set `WICKLUME_ALLOWED_ORIGIN` on the server to the frontend origin and set `apiBase` in `public/runtime-config.json` to the server's HTTPS origin. The default GitHub Pages build has an empty `apiBase`, so online AI and shared rankings are not connected there.

When market data is unavailable, the browser can show an explicitly labeled synthetic training feed. Those trades are local practice records and never enter verified rankings. Paper trading is available immediately; lessons remain available at any pace. Market orders enter at the current quote. Chosen-price entries wait until a candle or sampled quote crosses that level, and exits start on the next candle because the order of prices within a candle is unknown. An unfilled daily entry records $0 P/L; a pending paper entry can be cancelled. The daily replay always reveals and executes 15-minute bars; higher timeframe charts aggregate only candles already revealed. The 1m and 5m daily views are omitted because the exercise does not have minute-level execution data. Paper timeframe changes affect the chart view, not the quote-based execution model. Connected paper positions use server-managed fills; the simulation excludes spread, fees, financing, leverage, and margin. Within a replay candle, a stop is counted first if both stop and target are touched. Paper reconciliation is approximate across connection gaps.

## Appearance and accounts

Challenge and paper charts use the bundled **TradingView Lightweight Charts 5.2.1** library. Candles, volume, crosshair, price/time axes, mouse zoom/pan and touch navigation use its native canvas renderer; saved drawings and draggable trade levels use a time/price anchored SVG overlay. Replay passes only revealed bars into the library. The existing price feeds and trade execution model still determine data and fills; this library supplies no TradingView market data. Journal snapshots embed the canvas image and annotations in the existing SVG format, so older journal entries remain readable.

The standalone ESM distribution is checked in as `public/lightweight-charts.js`; no npm install or external CDN is required. Its Apache 2.0 license and attribution notice are included beside it and in the Pages build. Charts show the TradingView link and copyright notice. To update it, obtain the official standalone production ESM package, replace the bundled file and corresponding license/notice, then run the browser checks.

The header's **Light mode / Dark mode** button changes the whole workspace, including live charts. The first visit follows the device preference; choosing a theme saves it in the browser. Theme controls work on GitHub Pages without a server.

**Sign in** opens email/password login or account creation. Passwords must be 12–128 characters and are stored using salted scrypt hashes. Account sessions use hashed random tokens in SQLite and HttpOnly cookies, expire after seven days, and are revoked on sign-out. Login and registration attempts are rate limited. Email addresses are private; display names appear in verified leaderboards. The account dialog lets you update your display name or change your password after entering the current one. Changing a password revokes other device logins while retaining account progress and trades. Account names remain authoritative when placing trades, and leaderboard name changes save to the server when connected.

Accounts save learning progress, paper positions, and verified trade history on the server. Verified journal entries are restored when signing in on another device. Browser journals and drawings are scoped to the signed-in account; guest records stay separate and are not automatically imported. Offline practice, chart snapshots, and journal review notes remain browser-local. This initial account implementation does not include email verification, password recovery, or Google sign-in; save your password securely.

When browser storage is blocked or full, guest service requests share one in-memory session and Pages learning progress stays in the open tab. A storage notice explains that closing the tab loses unsaved work. Malformed saved learning data is handled without crashing the workspace. Account login continues to use cookies rather than browser-stored tokens.

To enable accounts on the public website, deploy the existing Node.js service with persistent SQLite storage, then set `apiBase` in `public/runtime-config.json` to its HTTPS origin. GitHub Pages alone cannot run the account service. Without a connected service, the sign-in dialog explains guest mode instead of accepting credentials.

For a hosted HTTPS service, set `NODE_ENV=production` (enables Secure cookies), `WICKLUME_HOST=0.0.0.0`, and `WICKLUME_ALLOWED_ORIGIN` to the exact frontend origin. If the frontend and API are on different sites, also set `WICKLUME_COOKIE_SECURE=true` and `WICKLUME_COOKIE_SAME_SITE=none`. Some browsers block third-party cookies; hosting the frontend and API on the same site is recommended. Local HTTP development uses SameSite=Lax cookies. Never publish the database or log passwords/cookies. Google login can be added once a Google OAuth client is configured.

## Build and test

```powershell
npm.cmd test
npm.cmd run build:pages
npm.cmd run preview:pages
```

For the chart interaction regression checks, build Pages first and run `npm.cmd run test:charts`. It launches headless Google Chrome, tests both server and Pages builds, and writes ignored screenshots to `dist/`. Set `CHROME_PATH` if Chrome is installed in a different location. Checks cover the replay boundary, candle/volume updates, draggable and locked trade levels, drawing tools, anchors across timeframe changes, native pan/zoom, snapshot decoding, themes, mobile resizing and chart cleanup.

The Pages preview opens at `http://127.0.0.1:5188`. Pushing `main` runs the repository checks and publishes `dist/` to GitHub Pages. Pages stores lesson progress and the journal in each visitor's browser; it cannot run the SQLite service. Use the local server or deploy the Node service to activate shared results and AI feedback.

Lesson content lives in `lesson-content.mjs`, `lesson-notes.mjs`, and `question-bank.json`; diagrams live in `public/lesson-visuals.js`. The lesson diagrams use illustrative prices. Background references include [CME's candlestick guide](https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar), [CME's support and resistance guide](https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance), and the [SEC's order types guide](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14).

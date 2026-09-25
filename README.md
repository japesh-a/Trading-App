# Wicklume

An interactive trading education workspace. [Open the website](https://japesh-a.github.io/Trading-App/) or [report an issue](https://github.com/japesh-a/Trading-App/issues).

The learning path has 18 open lessons, 54 topic-specific diagrams, worked examples, and 180 questions. The trading workspace adds a previous-day BTC chart challenge, drawing and annotation tools including Fibonacci retracement, draggable entry, stop and target levels, 24-hour bar-by-bar replay, simulated P/L, a trade journal, and an open paper account for BTC, US500, gold, and GBP/USD. The journal shows the last ten trades and whole-history statistics and can export a CSV. Daily replay charts offer 15m, 1h, 4h and 1d views. Paper charts offer 1m, 5m, 15m, 1h, 4h and 1d views.

## Run locally

Use Node.js 24 or newer; no package installation is needed.

```powershell
npm.cmd run dev
```

Open `http://localhost:5173`. The optional server stores authenticated learning progress, verified daily results, paper positions, and leaderboards in `data/wicklume.db`. Anonymous browser sessions are device-specific. Set `WICKLUME_DATA_DIR`, `WICKLUME_DB`, or `WICKLUME_PORT` to change storage or port. A hosted server can use `PORT` and `WICKLUME_HOST=0.0.0.0`; its SQLite database needs persistent storage.

For the AI trade review, set **both** `OPENAI_API_KEY` and `OPENAI_MODEL` on the server. The key never belongs in a browser file. For connected US500, gold and GBP/USD quotes, set `TWELVE_DATA_API_KEY`; `TWELVE_DATA_US500_SYMBOL` can override the index symbol. BTC history and quotes use Coinbase. For a separate web frontend, set `WICKLUME_ALLOWED_ORIGIN` on the server to the frontend origin and set `apiBase` in `public/runtime-config.json` to the server's HTTPS origin. The default GitHub Pages build has an empty `apiBase`, so online AI and shared rankings are not connected there.

When market data is unavailable, the browser can show an explicitly labeled synthetic training feed. Those trades are local practice records and never enter verified rankings. Paper trading is available immediately; lessons remain available at any pace. Market orders enter at the current quote. Chosen-price entries wait until a candle or sampled quote crosses that level, and exits start on the next candle because the order of prices within a candle is unknown. An unfilled daily entry records $0 P/L; a pending paper entry can be cancelled. The daily replay always reveals and executes 15-minute bars; higher timeframe charts aggregate only candles already revealed. The 1m and 5m daily views are omitted because the exercise does not have minute-level execution data. Paper timeframe changes affect the chart view, not the quote-based execution model. Connected paper positions use server-managed fills; the simulation excludes spread, fees, financing, leverage, and margin. Within a replay candle, a stop is counted first if both stop and target are touched. Paper reconciliation is approximate across connection gaps.

## Build and test

```powershell
npm.cmd test
npm.cmd run build:pages
npm.cmd run preview:pages
```

The Pages preview opens at `http://127.0.0.1:5188`. Pushing `main` runs the repository checks and publishes `dist/` to GitHub Pages. Pages stores lesson progress and the journal in each visitor's browser; it cannot run the SQLite service. Use the local server or deploy the Node service to activate shared results and AI feedback.

Lesson content lives in `lesson-content.mjs`, `lesson-notes.mjs`, and `question-bank.json`; diagrams live in `public/lesson-visuals.js`. The lesson diagrams use illustrative prices. Background references include [CME's candlestick guide](https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar), [CME's support and resistance guide](https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance), and the [SEC's order types guide](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14).

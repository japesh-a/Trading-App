# Architecture and data flow

Plain Node.js 24+ ES modules, no framework. The only runtime dependency is `google-auth-library`.

## Pieces

| Area | Files | Role |
| --- | --- | --- |
| HTTP server | `server.mjs` | Serves `public/`, the lesson API (`/api/lessons`, `/api/answer`, `/api/decision`) and the trading API. |
| Trading service | `trading-service.mjs` | Sessions, verified daily challenge results, paper positions, leaderboards, market-data adapters (Coinbase, Twelve Data), optional AI review. Stores data in SQLite (`node:sqlite`). |
| Accounts | `auth-service.mjs` | Email/password (scrypt), Google ID-token sign-in, hashed session tokens in HttpOnly cookies, rate limits. |
| Curriculum | `curriculum.mjs`, `lesson-content.mjs`, `lesson-notes.mjs`, `advanced-lessons.mjs`, `beginner-slides.mjs`, `question-bank.json` | Lessons, worked examples and questions. |
| Scenarios | `scenarios.mjs` | Fixed practice scenarios. |
| Browser app | `public/` | Vanilla ES modules. `trading-chart.js` wraps Lightweight Charts; `trade-engine.js` holds fill logic; `pages-adapter.js` provides the guest demo. |
| Pages build | `build-pages.mjs` | Copies `public/` into `dist/` for GitHub Pages (guest-only, empty `apiBase`). |

## Data flow

1. The browser loads `public/index.html`. `runtime-config.json` `apiBase` decides which server (if any) to call. Empty means the Pages guest demo, where progress stays in browser storage.
2. With a server, an anonymous or signed-in session cookie identifies the user. Learning progress, paper positions and verified trades are written to SQLite.
3. Market history comes from Coinbase (BTC) or Twelve Data (US500, gold, GBP/USD; needs a key). If a provider is missing or fails, the UI shows an unavailable screen and offers the labelled synthetic training feed. Training trades never enter verified rankings.
4. Fills use only revealed candles. Verified results are computed server-side, so a browser cannot report its own P/L.
5. AI review is called server-side only, and only when both `OPENAI_API_KEY` and `OPENAI_MODEL` are set.

## Database and migrations

SQLite file at `WICKLUME_DB` (default `data/wicklume.db`; `:memory:` in tests). There is no migration tool. Tables are created with `CREATE TABLE IF NOT EXISTS` at startup in `trading-service.mjs` and `auth-service.mjs`. To change a schema:

1. Add new tables with `CREATE TABLE IF NOT EXISTS`.
2. Add columns with `ALTER TABLE ... ADD COLUMN` that tolerates already-existing columns (see `password_enabled` in `auth-service.mjs`), with a default so old rows stay valid.
3. Never drop or rewrite user data in a startup step. Test an upgrade by creating a database with the old schema and opening it with the new code.
4. Back up by copying the database file while the server is stopped.

## Feature flags

Flags are environment variables. When absent, the feature is off and a local fallback is used.

| Flag | Enables | Fallback |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Google sign-in button | Email/password only |
| `TWELVE_DATA_API_KEY` | Real US500, gold and GBP/USD quotes | Synthetic training feed |
| `OPENAI_API_KEY` + `OPENAI_MODEL` | AI trade review | No AI review |
| `WICKLUME_ALLOWED_ORIGIN` and cookie settings | Cross-site API use | Same-origin only |

See `.env.example` for every variable.

## Out of scope

No real orders, deposits or broker credentials. No payments. No public profiles or messaging.

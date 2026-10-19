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

SQLite file at `WICKLUME_DB` (default `data/wicklume.db`; `:memory:` in tests). Schema changes are versioned migrations in `migrations.mjs`, applied at startup and recorded in `schema_migrations`. To change a schema:

1. Append a new `{ version, name, up(db) }` entry. Never edit a shipped one. Each runs in a transaction and rolls back on failure.
2. Keep migrations additive and tolerant (`IF NOT EXISTS`, check columns first, defaults on new columns). Never drop or rewrite user data. Old databases without `schema_migrations` are adopted by migration 1.
3. Test an upgrade in `storage.test.mjs` by creating an old-schema database and opening it with the new code.

Uniqueness is enforced in the database: one email per account (case-insensitive), one daily result per session and day, unique trade ids, one Google identity per account.

### Backup and restore

`npm run db:backup [-- file]` writes a consistent copy with `VACUUM INTO` (safe while the server runs; default `data/backups/`). `npm run db:restore -- <file>` (server stopped) checks integrity and required tables, keeps the current file as `*.before-restore-<time>`, swaps in the backup and re-runs migrations. Restoring preserves account IDs, quiz evidence, trades and streak history because they are in the same file. Restore drill: back up, change data, restore, confirm the data is back (automated in `storage.test.mjs`).

### Hosting storage decision

SQLite needs a persistent disk; never put it on an ephemeral filesystem. Set `WICKLUME_PERSISTENT_DISK=true` once it is on one (production start-up warns otherwise). A free-host plus external PostgreSQL option is not built: the services use the synchronous `node:sqlite` API and no PostgreSQL driver is installed, so it needs an async persistence layer and is left for a later change. Until then, use a host with a persistent volume and schedule `db:backup` off-box.

## Feature flags

Flags are environment variables. When absent, the feature is off and a local fallback is used.

| Flag | Enables | Fallback |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Google sign-in button (malformed ids are ignored with a warning) | Email/password only |
| `WICKLUME_PASSWORD_SIGNUP` | Set `false` for a Google-only pilot: `/auth/register` returns 403; `/auth/logout-all` signs out every device | Email sign up open |
| `TWELVE_DATA_API_KEY` | Real US500, gold and GBP/USD quotes | Synthetic training feed |
| `OPENAI_API_KEY` + `OPENAI_MODEL` | AI trade review | No AI review |
| `WICKLUME_ALLOWED_ORIGIN` and cookie settings | Cross-site API use | Same-origin only |

See `.env.example` for every variable.

## Out of scope

No real orders, deposits or broker credentials. No payments. No public profiles or messaging.

## Security model (F05)

- **Account-owned records** are always looked up by the session resolved from the cookie or bearer token on the server; request bodies never choose the owner.
- **Verified results** (daily submissions, rankings) need a signed-in account. Guest sessions can practise on paper but their trades are `ranked:false, serverVerified:false` and never reach leaderboards. `WICKLUME_ANONYMOUS_VERIFIED=true` restores the old behaviour.
- **Duplicate/concurrent submissions** are serialised per session and backed by database constraints (`PRIMARY KEY(session_id, day)`, unique `trade_id`); a constraint hit returns 409.
- **CSRF**: JSON-only bodies, an origin allow-list, and refusal of cross-site `Sec-Fetch-Site` state changes; cookies are `HttpOnly; SameSite=Lax`.
- **Headers**: CSP (Google sign-in allowed), COOP `same-origin-allow-popups`, HSTS in production, nosniff, frame denial (`security.mjs`).
- **Audit log**: the `audit_log` table records rejected requests and sensitive actions with a hashed network id. No route reads it; inspect it with SQLite on the host.
- **Legacy endpoints** `/api/progress|answer|decision` share one record for every visitor, so they return 410 in production (`WICKLUME_LEGACY_PROGRESS` overrides).

# Running and checking the project

No production secrets are needed.

```
npm install
npm run dev            # http://localhost:5173
```

Optionally copy `.env.example` to `.env` (every value is commented out). Without keys you get guest accounts, a local SQLite file under `data/` (git-ignored) and the synthetic training feed.

## Provider setup (optional, local only)

- **Google sign-in:** create a Web application OAuth client in a test Google Cloud project, add `http://localhost:5173` as an authorised JavaScript origin, and set `GOOGLE_CLIENT_ID`. No client secret is needed.
- **Twelve Data:** a free key in `TWELVE_DATA_API_KEY` enables US500, gold and GBP/USD. BTC uses Coinbase with no key.
- **AI review:** set both `OPENAI_API_KEY` and `OPENAI_MODEL`. Leave them unset to keep it off. Keys stay in server environment variables, never in `public/`.

## Checks

| Command | When |
| --- | --- |
| `npm test` | Always. Runs server, service, engine, client and contributor-docs checks. |
| `npm run build:pages` | Always. Confirms the GitHub Pages guest demo builds. |
| `npm run test:charts` | When you change chart code (`public/trading-chart.js`, `trading-workspace.js`, timeframes). Needs Chrome/Chromium; set `CHROME_PATH` if it is not found. |

Changes to security or data behaviour (auth, sessions, verified results, exports) need a service test in `trading-service.test.mjs` or a new `*.test.mjs` file added to the `test` script in `package.json`.

## Doing a ticket

1. Pick an issue made from the "Feature ticket" template and check its dependencies are done.
2. Branch, implement only that ticket's scope, and add tests for each acceptance criterion.
3. Run the checks above and describe them in the pull request.

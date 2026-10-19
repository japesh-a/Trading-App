# Privacy controls (F08)

Engineering record only. It is not legal advice and the lawful bases below need review by a UK privacy adviser before an external pilot (see F06/F07). The linked terms page, `public/privacy-placeholder.html`, is a clearly marked placeholder.

## Choices are separate

| Item | Stored in `account_privacy` | Default | Effect |
| --- | --- | --- | --- |
| Terms acceptance | `terms_version`, `terms_accepted_at` | not accepted | Records the version and time. Accepting changes no optional choice. |
| AI review | `ai_processing` | off | `/coach` returns 403 for accounts until on; turning it off stops future sends immediately. Guests are shown a just-in-time confirmation before each send. |
| Marketing email | `marketing` | off | Flag only; no marketing is sent by this app. |

## Lawful bases (draft, to be confirmed)

| Purpose | Data | Basis (draft) |
| --- | --- | --- |
| Run the account and learning service | email, display name, progress, practice trades | Contract |
| Security and abuse prevention | hashed network id, audit events | Legitimate interests |
| AI trade review | trade and written reasoning sent to the AI provider | Consent (the AI switch), withdrawable |
| Marketing email | email | Consent (the marketing switch) |

## Rights (no paid plan needed)

All under Account settings > Privacy, or the API under `/api/trading/privacy`:

- `GET /privacy` settings; `POST /privacy/terms`; `POST /privacy/choices`.
- `GET /privacy/export` returns the account's data as JSON (no password hash, tokens or security logs).
- `POST /privacy/delete` with `confirm: "DELETE"` erases the account, learning, daily results, paper trades and privacy row, revokes every login and clears the cookie. Audit rows are detached from the account.

## Retention schedule

| Data | Kept |
| --- | --- |
| Account data | until the learner deletes it |
| Login sessions | 7 days, purged when expired |
| Audit log | 90 days |
| Deletion tombstones (hash of the account id + date) | 35 days |
| Database backups | at most 30 days |

`runRetention` runs at start-up and daily. Tombstones outlive backups on purpose.

## Backups and providers

- Restoring a backup (`db-backup.mjs restore`, and server start) runs `reapplyDeletions`, which erases any restored account that has a tombstone. Keep restores of old backups into the live database only through this script. If the live database was lost, deletions requested after the backup are not known: keep the tombstone list with the backup process.
- AI provider: nothing is sent unless the user opted in, and the request uses `store:false`. Ask the provider for its own retention and deletion terms and record them in the processor list in `docs/HOSTING.md`.
- Google sign-in: deleting here does not delete the Google account; it only removes the link.

## Storage and cookies

One `HttpOnly` account cookie (strictly necessary for sign-in) and local storage for guest progress and drawings. No analytics or advertising scripts. Check against current ICO PECR guidance before launch.

## Not done

Legal review, final lawful-basis sign-off, parent/guardian handling, a person-facing rights request process by email, and processor-side deletion confirmation.

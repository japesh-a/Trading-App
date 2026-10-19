# Analytics and operations (F24)

Status: **built, not yet run against a real host.** Owners below are placeholders and must be filled in by a person before the pilot.

## What is measured, and what is not

| Question | How it is counted | Needs opt-in |
| --- | --- | --- |
| Course completion | `course_completed`, once per learner | yes |
| Daily review completion | `daily_review_completed`, per learner per UTC day | yes |
| Return visits | `return_visit`, first signed-in request of a UTC day | yes |
| Journal reflection | `journal_reflection`, that a reflection was saved (not its text) | yes |
| Server errors, save/sync failures, AI calls, estimated AI tokens | anonymous hourly totals | no (identify nobody) |

Rules:

- Analytics is **off by default** and switched on per signed-in account under Account settings > Privacy. Guests are never measured. Switching it off deletes that account's counted events straight away.
- Events hold an event name, a UTC day and a keyed pseudonym of the account. They never hold journal text, answers, scores, prices, emails, names or IP addresses. The pseudonym key stays in the database and is never exported.
- There is no third-party analytics script, advertising identifier or cross-site tracking. Nothing is sent off the server.
- AI cost is a count of calls and a token estimate (the provider's figure when given). The existing coach is unchanged.
- Account deletion removes the pseudonymous events and the consent record. The data export lists whether analytics is on.

## Retention

| Data | Kept |
| --- | --- |
| Product events | 180 days (`course_completed` until the account is deleted or analytics switched off) |
| Operational counters | 90 days |
| Audit log | 90 days (F08) |
| Automatic backups | 30 days, then deleted (`WICKLUME_AUTO_BACKUP=true`); deletion tombstones outlive this so a restore re-deletes accounts |

Pruning runs at start-up and daily. Consent text is still a draft; get it reviewed before collecting real participant data.

## Reading the numbers

Staff tokens (see ADMINISTRATION.md) can call `GET /api/trading/admin/analytics?days=7` for usage, reliability and AI totals, and `GET /api/trading/admin/ops` for health, alerts, last backup and last restore rehearsal. Usage figures cover opted-in learners only; the response says how many accounts opted in.

## Alerts

`GET /admin/ops` and a 5-minute server check evaluate: failing database check, server errors per hour, sync failures per hour, AI tokens per day, no recent backup, no recent restore rehearsal. Thresholds come from environment variables (see `.env.example`). Alerts are written to the server log. If `WICKLUME_ALERT_WEBHOOK` (an HTTPS URL) is set they are also posted there, each at most every 6 hours; alert text holds counts and ages only. Without the variable nothing leaves the machine. Also point a free uptime monitor at `/healthz`.

## Backups and restore rehearsal

- `npm run db:backup` takes a backup and records it; `WICKLUME_AUTO_BACKUP=true` does this daily and prunes old copies.
- `npm run db:rehearse` backs up, restores into a scratch file, checks integrity and account counts, deletes the scratch copy and records the rehearsal. **Run it monthly** and after every migration, and write the date in the incident log.
- A real restore: stop the service, `npm run db:restore -- <file>`, start it (deleted accounts are removed again automatically).

## Visible service state

`GET /api/trading/status` returns `{ state: ok | degraded | paused, message }`. The app shows the message as a banner when the state is not `ok`. Set `WICKLUME_SERVICE_STATE=paused` and an optional `WICKLUME_SERVICE_NOTICE` when a free-tier quota is used up or the host is suspended; a failing database check shows `degraded` automatically. Slow wake-ups are already explained by the "service is waking up" message (F22). Lessons keep working in the Pages guest demo.

## Incident ownership

| Role | Person | Backup |
| --- | --- | --- |
| Incident owner (decides, communicates) | *to be named* | *to be named* |
| Operator (dashboard, backups, restore) | *to be named* | *to be named* |
| Privacy contact (data requests, breaches) | *to be named* | *to be named* |

Placeholder values mean the pilot is **not ready**.

1. Acknowledge the alert, note the time and the owner.
2. Set `WICKLUME_SERVICE_STATE` if learners are affected.
3. Follow HOSTING.md (rollback, restore). Check `/admin/ops` and `/healthz`.
4. Tell invited users plainly what happened and what was lost, if anything. A suspected data breach goes to the privacy contact immediately.
5. Record cause, fix and the date in the incident log, then clear the service state.

# Hosting the pilot

Status: **prepared, not deployed.** Nothing here has been run against a real host. A person must choose a provider, create the services and record the decisions below before inviting anyone.

## Shape

- One Node process serves the frontend (`public/`) and the API from a **single HTTPS origin** on a provider subdomain. No cross-site cookies or CORS settings are needed (leave `WICKLUME_ALLOWED_ORIGIN`, `WICKLUME_COOKIE_SECURE` and `WICKLUME_COOKIE_SAME_SITE` unset). Production sends `Strict-Transport-Security`; the provider terminates TLS.
- **Pilot** and **staging** are separate services with separate disks and databases. Staging sets `WICKLUME_ENV=staging`. Never copy real participant data to staging.
- GitHub Pages stays as the **guest demo**: a banner on every page says it is a demo, nothing is saved to an account, and it is not the hosted pilot.
- `render.yaml` is an example blueprint (Render is one option, not a commitment). It has no secrets; enter `GOOGLE_CLIENT_ID` etc. in the provider dashboard. All variables are listed in `.env.example`.

## Honest limits

Free hosting tiers suspend idle services, use ephemeral files and have quotas ([Render free tier](https://render.com/docs/free), [Supabase pricing](https://supabase.com/pricing)). A free Node host with ephemeral files would lose accounts on restart, so the pilot needs a **persistent disk** (a paid instance on Render), or the app will warn at start-up. This is a pilot, not a production reliability promise. A free external PostgreSQL option is not built (see ARCHITECTURE.md, "Hosting storage decision").

## Health check

`GET /healthz` returns `200` and `{ ok, status, version, environment, schemaVersion, database, persistentDisk, features }`, or `503` when the database check fails. It exposes no keys, emails or user data. Set `WICKLUME_VERSION` (for example the git SHA) at deploy time so a response says which build is live.

## Deployment checklist

1. `npm test` passes on the commit (the blueprint runs it as the build command; `autoDeploy` is off so a person promotes each release).
2. Take a backup first: `npm run db:backup` (run on the host shell, or copy off-box).
3. Deploy to **staging**, then run `node deploy-check.mjs https://<staging-host> --env=staging`. It checks HTTPS, `/healthz`, the home page and `/api/lessons`, and exits non-zero on failure.
4. Do the manual pilot journey on staging: sign in, complete a lesson, record a practice trade, then sign in on a second device and confirm progress is there.
5. Promote to the pilot service and run `node deploy-check.mjs https://<pilot-host> --env=production`.

## Rollback

1. Redeploy the previous known-good commit from the provider dashboard (or `git revert` and redeploy).
2. Migrations are additive (see ARCHITECTURE.md), so older code keeps working against a newer schema. If data is damaged, stop the service and run `npm run db:restore -- <backup file>`, then start it.
3. Re-run `deploy-check.mjs` and note the incident and the version restored.

## Quota and failure response

No plan upgrades or paid add-ons happen automatically: leave auto-scaling off and set the provider's spending limit to the current plan. Weekly, a named operator checks the dashboard for disk use, bandwidth and instance hours, and checks `/healthz` (an external free uptime monitor can poll it).

| Signal | Threshold | Response |
| --- | --- | --- |
| Disk use | over 70% of the volume | Take a backup, delete old backups, then decide whether to enlarge the disk (a person's decision). |
| Instance hours or bandwidth | over 80% of the monthly quota | Tell invited users the pilot may pause; do not upgrade automatically. |
| `/healthz` not ok for 10 minutes | any | Check provider status, redeploy the last good build, restore from backup if data is damaged. |
| Provider suspends or quota exhausted | any | Pause invitations, tell users, learning continues in the Pages guest demo with no saved account. |

## Processor record (complete before storing participant data)

Fill this in before the first invited user. Placeholder values mean the pilot is **not ready**.

| Item | Value |
| --- | --- |
| Hosting provider and plan | TO BE COMPLETED |
| Data location / region | TO BE COMPLETED |
| Processor terms accepted (link and date) | TO BE COMPLETED |
| International transfer arrangement | TO BE COMPLETED |
| Backup location and retention | TO BE COMPLETED |
| Named operator and review owner | TO BE COMPLETED |

Terms and privacy pages for participants are separate placeholders and need legal review before an external pilot involving under-18s.

# Administration (F23)

Small protected controls over reviewed content, not a CMS. Content still lives in `scenario-content/` files and
`question-bank.json`; the admin routes add review state, publication, retirement and support handling on top.

## Access

Set `WICKLUME_ADMIN_TOKENS="alice:content:<token>,bob:support:<token>"` (see `.env.example`). Send
`Authorization: Admin <token>` to `/api/trading/admin/...`. Unset means admin is off (403). Learner sessions are never staff.

| Role | Can do |
| --- | --- |
| content | list/review/publish/retire scenarios, record question versions, read failures and reports |
| support | read failures, handle reports, read a learner's journal text under a support grant |

## Scenarios

`GET /admin/scenarios`, `POST /admin/scenarios/review {id, version, decision}`, `.../publish`, `.../retire {reason}`.
- Reviewers cannot approve scenarios they authored (provenance author), and approval is bound to the content hash.
- Publishing records the content hash; a published version is pinned. Editing content under the same version
  withdraws it (`changed-after-publication`) instead of changing completed results. Publish a new version instead.
- Retiring stops new assignments only. Learners who already completed it can still replay it.
- Scenarios approved in `reviews.json` are pinned automatically the first time they enter the pool.

## Question versions

`GET /admin/questions` and `POST /admin/questions/record {note}` store a version whenever a question's text changes.
Edit `question-bank.json`, review the change, then record it.

## Reports and failures

Learners file `POST /reports` (500 characters, no personal details needed) and see their own at `GET /reports`.
Staff list `GET /admin/reports`, close with `POST /admin/reports/handle`. Reporters appear as a short opaque reference.
`GET /admin/failures` shows counts of failed requests by route and attempts per scenario version; no accounts or journal text.

## Journal support access

Staff cannot browse journals. A signed-in learner creates a support grant (`POST /support-access`) and shares the
one-time code. It lasts 24 hours, allows 5 reads, can be revoked (`POST /support-access/revoke`) and returns journal
text only (no chart images). Staff must give a reason; each read is listed to the learner at `GET /support-access`.

## Audit

Every staff mutation and support access, including denied attempts, is appended to `admin_actions` (read via
`GET /admin/actions`). There is no edit or delete route. Reports and grants are erased with the account.

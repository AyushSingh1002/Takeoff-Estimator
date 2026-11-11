# Launch Readiness Review (M11)

**Date:** 2026-11-08
**Verdict:** **NO-GO for production launch.**
**Scope reviewed:** API, worker, web app, data model, security controls, evaluation evidence, operational prerequisites.

The MVP milestone work is implemented and the automated gates are green, but the product cannot be launched to paying
customers yet. The blockers below are functional, not polish.

## 1. Go/no-go summary

| Area                                            | Status                       | Evidence                                                                        |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Lint / format / strict typecheck                | Pass                         | `npm run lint`, `npm run format:check`, `npm run typecheck`                     |
| Automated test suite                            | Pass                         | 114 tests / 20 files plus 6 Playwright E2E tests                                |
| Security checklist (SECURITY_AND_VALIDATION §8) | Green                        | `apps/api/src/modules/security/security.test.ts`, `SECURITY_RISK_ACCEPTANCE.md` |
| Large-set robustness                            | Pass                         | 40 files / 94 sheets, idempotent reruns (`load.test.ts`)                        |
| Accuracy report                                 | Produced, **claim withheld** | `ACCURACY_REPORT.md`                                                            |
| Production processing provider                  | **Fail (guarded)**           | Fixture refused in production; no real adapter registered yet                   |
| Password reset delivery                         | Pass                         | SMTP adapter wired and tested with an in-memory sender                          |
| Customer, reviewer and admin UI                 | Pass                         | Slices A–E shipped; Playwright covers the customer → admin → reviewer journey   |
| Golden set / rights (OD-16)                     | **Fail**                     | No dataset or licensed-estimator benchmark                                      |
| End-to-end browser tests                        | Pass                         | `e2e/` (6 specs): access guards, full delivery journey, admin screens           |
| Dependency audit                                | Risk-accepted                | 3 advisories, see `SECURITY_RISK_ACCEPTANCE.md`                                 |

## 2. P0 blockers (must be closed before launch)

### P0-1 — No production processing provider

- **Closed part:** intake selection is now explicit (`modules/ingestion/intakeProvider.ts`). Fixture is refused when
  `NODE_ENV=production`, `PROCESSING_MODE=provider` with no registered adapter fails worker startup, and every pipeline
  stage resolves through the same guard. Production can no longer silently produce fixture quantities.
- **Open part:** there is still no real OCR/vision/vector provider implementation, so `PROCESSING_MODE=provider` cannot
  run today.
- **Exit action:** implement the provider adapter(s), register them in the resolver, and validate output against
  AI_PROVIDER_INTEGRATION §3/§6 (Zod-validated, bounded, capability-declaring, cost/timeout limited).

### P0-2 — No customer/reviewer/admin UI

**Closed** — Slices A–E shipped; the full customer → admin → reviewer delivery journey now runs under Playwright.

- **Slice A shipped:** Tailwind v4 design tokens; landing page; register, login, forgot-password and reset-password
  screens; role-guarded customer shell; project dashboard; project creation; project detail with private presigned
  upload, file removal and auto-refresh while ingestion runs. Browsers call the API through a same-origin Next
  rewrite (`API_BASE_URL`) so the HttpOnly session cookie stays scoped to the web origin; logout clears that cookie.
- **Slice B shipped:** customer intake review (sheet grid with quality/discipline/scale chips, per-sheet include/exclude,
  manual 1:N scale entry, unreadable/missing-scale banners); price and entitlement panel with submit; project status
  stepper with target time and mapped progress; deliverables list with signed-URL downloads; delivered BOQ results by
  trade with units, waste, net quantity, review status, assumptions and test-data ribbon; account profile, password
  and plan/usage screens; `/projects` alias to the dashboard. Backend additions: sheet list/update/image routes,
  draft-only editing, owner-scoped 404 isolation, submit gating/idempotency, `sheetIds` snapshot and customer progress
  mapping. `sheet.test.ts` covers the new routes and submit rules.
- **Slice C shipped:** role-guarded reviewer shell (desktop-first, with a narrow-window notice); `/review` queue with
  project reference, status, sheet/measurement/flag counts, test-data badge and live SLA countdown; `/review/[jobId]`
  job overview with approve/reject actions, blocking-flag guard, sheet list, discrepancy panel and BOQ review table;
  `/review/[jobId]/sheets/[sheetId]` drawing canvas with iframe/image page preview, SVG object and measurement
  overlays, layer toggles, selected-object inspector, measurement ledger edits and manual measurement entry. Opening a
  job moves it `awaiting_review → in_review` and the QAReview `assigned → in_progress`, with a `job.review.start` audit
  entry. Backend additions: `GET /review/jobs/:jobId/sheets`, `GET /review/jobs/:jobId/sheets/:sheetId` (signed page
  URL + objects/measurements/discrepancies), shared `sheet:<fileId>:<page>` refs, job `sheetIds` snapshot filtering in
  the pipeline, and measurement edits that require a note and accept `value` and/or `geometry`. Reviewer login lands on
  `/review`. `review.test.ts`, `pipeline.test.ts` and `security.test.ts` cover the new paths.
- **Still missing:** the reviewer calibration tool is deferred until the real provider honours persisted sheet scale
  (P0-1); it is not exposed in the UI.
- **Slice D shipped:** role-guarded admin shell (`/admin` redirects to `/admin/jobs`; administrator login lands on
  `/admin/jobs`); `/admin/users` search/role/active filters with role changes and deactivation; `/admin/projects` with
  owner email and status filter; `/admin/jobs` with status/SLA/reviewer filters, project reference, reviewer list,
  assignment/reassignment, retry, re-run, cancel and test-data badges; `/admin/pricing` version history plus publishing a
  new immutable version with optional future effective date; `/admin/rules` draft creation, approve/retire and a
  parameter diff against the previous version; `/admin/claims` list and claim detail with evidence, benchmark recording
  (source, metric version, 1–50 lines), tolerance status and uphold/reject decisions. Backend additions:
  `POST /admin/jobs/:id/assign` (active reviewer validation, `QAReview` upsert, `job.assign` audit),
  `GET /admin/accuracy-claims/:id`, and admin project/job summaries enriched with owner email, project reference and
  reviewer details. `admin.test.ts` and `accuracy.test.ts` cover the new behaviour.
- **Slice E shipped:** Playwright E2E (`e2e/`) starts an in-memory MongoDB, the real Express API, an HTTP object-store
  gateway for presigned browser uploads/downloads and the ingestion/pipeline worker, then drives the Next UI. Coverage:
  registration → project → PDF upload → intake → submission; administrator login, reviewer assignment and a pass over
  every admin screen; reviewer queue → approval; customer delivery, delivered BOQ and signed-URL download; anonymous
  redirects and cross-role area guards. Approval now compiles the Excel BOQ and annotated PDF in the same request
  (`in_review → approved → compiling → delivered`, per `USER_FLOWS.md`), and a failed compile leaves the job approved
  with a retry action in the reviewer job header (`POST /jobs/:jobId/deliver`). Uploaded filenames pin the fixture case
  (`fixture-clean`). Failure traces/screenshots land in `e2e/test-results/`.
- **Residual risk:** the E2E stack runs the fixture processing provider (the only one available until P0-1 closes), so
  the production provider path is still unexercised by browser tests.

### P0-3 — Golden set and accuracy claim unavailable (OD-16)

- No 100-job held-out dataset, no confirmed drawing rights, no independent licensed-estimator quantities.
- `ACCURACY_REPORT.md` therefore withholds any ±3% claim; marketing copy must say "target".
- **Exit action:** complete OD-16 sourcing/licensing, run `npm run accuracy:report`, and only claim accuracy if the gate
  returns `claimSupported=true`.

### P0-4 — Password reset delivery (closed in code)

- `POST /auth/forgot-password` now creates the single-use token and sends a reset link through the SMTP adapter
  (`providers/email.ts`), using `APP_ORIGIN/reset-password?token=…`. Failures are logged, and the endpoint still returns
  a uniform 202 for known and unknown addresses.
- Production boot requires `EMAIL_FROM` and `EMAIL_SMTP_HOST`; Mailpit exposes SMTP on `1025` locally.
- **Remaining operational step:** point `EMAIL_SMTP_HOST`/credentials at the chosen provider (OD-07) and verify delivery
  in staging.

## 3. P1 issues (launch with explicit acceptance or fix in the first hardening sprint)

| Issue                              | Impact                                                                                                                | Recommended action                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `withTransaction` helper is unused | Multi-document writes (submit, claim uphold/retakeoff) are not atomic under concurrent failure                        | Wrap the critical flows in replica-set transactions and add crash/concurrency tests |
| In-memory rate limiter             | Limits are per instance and IP-keyed; not shared across replicas                                                      | Move to a shared store before horizontal scaling (OD-06)                            |
| Account lockout only               | Distributed credential stuffing across accounts/IPs still relies on the 10/min auth limit                             | Add IP + account combined throttling and alerting                                   |
| Email/AV integrations              | Password-reset email is wired; malware scanning (OD-07) is not                                                        | Wire AV scanning and stage the SMTP relay/credentials                               |
| Upload storage cap                 | Presigned PUT now signs `Content-Length`, but bucket policy/CORS and max-size enforcement are infrastructure settings | Verify bucket block-public-access, CORS and size policy in the target account       |
| Observability                      | Structured logs and request IDs exist; no metrics/alerts/dashboards                                                   | Add job/SLA/error dashboards and alerts before paid traffic                         |
| Backups/DR                         | No documented backup/restore or restore drill                                                                         | Define RPO/RTO, enable MongoDB backups, test a restore                              |

## 4. Security review outcome

The §8 checklist is green:

- Deny-by-default policy matrix; admin cannot approve/reject/review jobs; reviewer actions require assignment.
- Cross-customer reads/writes/downloads return 404; unassigned reviewers return 403.
- Operator keys (`$`, `.`) rejected globally; Mongoose `sanitizeFilter` enabled.
- Uploads: signature sniffing, declared-type match, encrypted/corrupt/active-content rejection, page and dimension
  limits, size/type/count caps.
- Signed download URLs use `SIGNED_URL_TTL_SECONDS` (max 300) and audit every download.
- Login rate limit (10/min/IP), per-account lockout (5 failures / 15 min), audit events for success/failure/lock/logout.
- Password reset sends a single-use link over SMTP; reset revokes all sessions; responses are uniform.
- Production boot refuses fixture mode, insecure cookies, non-HTTPS origins, empty storage secrets, missing email
  settings and TTL > 300.
- Dependency audit risk-accepted in writing (`SECURITY_RISK_ACCEPTANCE.md`).

Residual risks are documented; none is a substitute for the P0 functional blockers.

## 5. Decision

**NO-GO.** The API and worker core are hardened enough for a controlled internal/staging pilot on synthetic or
permitted drawings, but not for paying customers. The product UI is now covered end-to-end by Playwright. Re-run this
review after the remaining P0 blockers (real processing provider, golden set/OD-16) are closed, then repeat the full
gates and the golden-set evaluation.

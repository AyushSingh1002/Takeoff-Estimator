# Takeoff Estimator

Autonomous Architectural Blueprint Takeoff Estimator — MVP.

**AI proposes, rules convert, humans verify.** Customers upload architectural drawing sets, the platform measures
them, converts quantities into orderable materials, a reviewer verifies, and the customer downloads an Excel BOQ plus
an annotated PDF where every line traces back to a drawing location.

Status: **Phase 1 (MVP) — M0–M11 complete.** Launch verdict: **NO-GO** until the P0 blockers in
[`LAUNCH_READINESS.md`](LAUNCH_READINESS.md) are closed. Accuracy: no production claim yet; see
[`ACCURACY_REPORT.md`](ACCURACY_REPORT.md).

## Stack

- Web: Next.js (App Router) + React + TypeScript + Tailwind (UI only — all business logic lives in the API)
- API / worker: Node.js + Express + TypeScript (REST) — worker is a second entrypoint of the same codebase
- Data: MongoDB + Mongoose · Validation: Zod · Package manager: npm workspaces (`apps/web`, `apps/api`, `packages/shared`)
- No Redis, no microservices, no Kubernetes, no GraphQL, no extra databases.

## Getting started

```bash
cp .env.example .env
docker compose up -d        # MongoDB (replica set), MinIO, Mailpit
npm install
npm run seed                # publish the versioned MVP pricing plans (idempotent)
npm run dev:api             # Express API on :4000
npm run dev:worker          # ingestion + pipeline worker
npm run dev:web             # Next.js UI on :3000
```

Password-reset emails are captured by Mailpit at <http://localhost:8025> (SMTP on `1025`).

## Vercel deployment

The root `vercel.json` configures the `api` (Express) and `web` (Next.js) services in one Vercel
project. `/api/*` is public through the API service; all other paths are public through the web
service. The web service receives the API's internal URL through the `API_URL` service binding;
Vercel supplies this variable, so do not configure it manually.

Configure the API's production environment variables in Vercel, including the public web origin,
MongoDB, object storage, email delivery, and production processing provider settings. The
`apps/api/src/worker.ts` queue worker is a separate process rather than an HTTP service and is not
deployed by this configuration; it still needs an external worker or a separately designed
scheduled execution setup.

## Evaluation and launch evidence

```bash
npm run accuracy:report -- path/to/golden-set.json reports/accuracy-report.md
```

- [`ACCURACY_REPORT.md`](ACCURACY_REPORT.md) — M11 accuracy result (claim withheld: no approved golden set, OD-16).
- [`LAUNCH_READINESS.md`](LAUNCH_READINESS.md) — M11 launch review (NO-GO and blockers).
- [`SECURITY_RISK_ACCEPTANCE.md`](SECURITY_RISK_ACCEPTANCE.md) — dependency-audit findings and mitigations.

## Quality gates

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build -w apps/web
npm run e2e          # after: npm run e2e:install
```

Playwright E2E starts its own stack (in-memory MongoDB, API, object-store gateway and a Next dev server), so it needs no
Docker services. It covers customer registration → upload → intake → submit → review, admin assignment, reviewer
approval (which compiles the deliverables) and signed customer downloads. Failure traces and screenshots land in
`e2e/test-results/`. If the browser download is blocked on your machine, point `E2E_CHROMIUM_PATH` at an installed
Chromium-based browser executable.

## Environment

The API loads `.env.local` first, then `.env`, from the repository root; variables already set in the process take
precedence. All environment variables are validated with Zod at boot (`apps/api/src/config/env.ts`). Invalid
configuration stops the process. See `.env.example`.

## Testing modes

`PROCESSING_MODE=fixture` selects the `FixtureProvider` (development/test only). It is rejected when `NODE_ENV=production`.
Test-data jobs carry `isTestData`, watermarked deliverables, and a UI banner.

## Documentation

The authoritative source is the supplied `/docs` set (18 documents: requirements, architecture, pipeline, security,
environment, testing and implementation plan). Repository evidence for M11 is in the three reports above.

## Milestones

Implements the plan in `docs/IMPLEMENTATION_PLAN.md`: M0 → M11, with spikes S-1…S-4 run alongside M0–M3.

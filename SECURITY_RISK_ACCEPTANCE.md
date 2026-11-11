# Security Risk Acceptance — Dependency Audit (M11)

**Date:** 2026-11-08
**Audit command:** `npm audit --omit=dev`
**Result:** 0 critical, 1 high, 2 moderate, 0 low, 0 info (3 advisories total)
**Decision:** Accept for the MVP/staging phase; no production launch until the P0 blockers in `LAUNCH_READINESS.md` are
closed. Re-audit before launch and at least every 90 days, or immediately on a new advisory affecting these packages.

## 1. Findings

| #   | Package                           | Installed | Severity            | Advisory                             | Affected range | Fix                                                     |
| --- | --------------------------------- | --------- | ------------------- | ------------------------------------ | -------------- | ------------------------------------------------------- |
| 1   | `zod`                             | 3.25.76   | High (CVSS 8.2)     | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 | `< 4.6.6`      | `zod@4.6.7` (major)                                     |
| 2   | `uuid` (transitive via `exceljs`) | 8.3.2     | Moderate (CVSS 6.3) | GHSA-w5hq-g745-h8pq / CVE-2026-41907 | `< 11.1.1`     | `uuid@11.1.1` (major)                                   |
| 3   | `exceljs`                         | 4.4.0     | Moderate            | Inherited from finding 2             | `>= 3.5.0`     | No non-breaking fix; `exceljs@4.4.0` pins `uuid@^8.3.0` |

## 2. Finding 1 — Zod memory exhaustion

**Advisory:** Zod accumulates every validation issue for an unbounded array, allowing an attacker to exhaust memory by
submitting a very large array.

**Exposure in this codebase:**

- Every request array is length-bounded: claims evidence `.max(20)`, benchmark lines `.min(1).max(50)`, and query
  pagination `.max(500)`; there are no unbounded `z.array(...)` schemas in `apps/api/src/modules/**/*.schemas.ts`.
- Request bodies are capped at `1mb` by `express.json({ limit: '1mb' })`.
- General API rate limiting (120/min/IP) and auth throttling reduce request volume.
- The described `$ZodArray` issue-accumulation path is in the Zod 4 code line; the installed 3.25.76 is flagged only
  because npm maps the `<4.6.6` range across both major lines. The mitigation above applies regardless.

**Residual risk:** Low for the bounded API surface. A future unbounded array schema would re-open the issue.

**Upgrade plan:** Schedule the Zod 4 major upgrade as a dedicated change (schema/type fallout), before adding new
unbounded collection inputs or accepting untrusted bulk payloads.

## 3. Findings 2 and 3 — uuid buffer bounds via ExcelJS

**Advisory:** `uuid` v3/v5/v6 silently write past a caller-provided output buffer when the buffer is too small or the
offset is out of range. This is an integrity/robustness issue, not remote code execution.

**Exposure in this codebase:**

- `exceljs` is used only to **generate** the BOQ workbook (`apps/api/src/modules/deliverables/excel.ts`); it is not
  used to parse untrusted workbooks.
- The application does not call `uuid` directly and never supplies an attacker-controlled buffer or offset to it.
- The vulnerable v3/v5/v6 buffer API is not on the workbook-generation path.

**Residual risk:** Low. A future feature that parses customer workbooks with ExcelJS, or calls uuid with
caller-controlled buffers, must not ship until this is upgraded.

**Upgrade plan:** Upgrade `exceljs`/`uuid` when a non-breaking release is available, or bundle the upgrade with the next
dependency major cycle. Re-check `npm audit --omit=dev` before launch.

## 4. Acceptance record

| Field          | Value                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepted by    | Project owner, M11 launch-readiness review                                                                                                             |
| Scope          | MVP/staging use with synthetic or permitted drawings; **not** a production-launch waiver                                                               |
| Rationale      | No reachable exploit path in the current architecture; fixes require major upgrades; bounded schemas and body limits already mitigate the high finding |
| Review trigger | Before production launch, every 90 days, or on a new advisory/CVE affecting zod, uuid or exceljs                                                       |
| CI gate        | `npm audit --omit=dev` is reviewed manually; no automatic failure while this acceptance is active                                                      |

The §8 checklist item "Dependency audit clean or risk-accepted in writing" is satisfied by this document. The
acceptance does **not** override the functional NO-GO in `LAUNCH_READINESS.md`.

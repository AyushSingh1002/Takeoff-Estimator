# Accuracy Evaluation Report (M11)

**Date:** 2026-11-08
**Metric:** `od02.v1` (per benchmarked line, delivered vs independent benchmark)
**Tolerance:** ±3% per line; a job passes only when every benchmarked line is within tolerance.
**Result:** **No production accuracy claim is supported.** No approved golden set was available at evaluation time
(OD-16 still open), so no pass rate, variance distribution or ±3% claim can be reported for the product.

## 1. What was evaluated

| Item                                                                        | Status                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------- |
| Golden-set manifest of 100 held-out jobs with licensed-estimator quantities | **Not available (OD-16)**                          |
| Confirmed rights to use the drawings                                        | **Not available**                                  |
| Independent benchmark per trade/line                                        | **Not available**                                  |
| Evaluation tooling                                                          | Implemented and tested against synthetic manifests |
| Pre-review and post-review comparison                                       | Supported by the tooling; no real data             |
| Customer-facing ±3% claim                                                   | **Not permitted**                                  |

The evaluation tooling is real, but the dataset is not. Running the tooling on synthetic fixtures would only test the
statistics code and must not be presented as product accuracy.

## 2. Implemented evaluation gate

`apps/api/src/modules/accuracy/accuracy.evaluation.ts`:

- Validates a strict manifest (`dataset`, `rightsConfirmed`, and jobs with `sourceKind`, `split`, `reviewStage`, lines).
- Computes `variance = (delivered − benchmark) / benchmark` per line and marks a job passed only if every line is within
  ±3%.
- Reports overall pass rate, pass rate by source kind (vector/raster), by trade, by review stage (pre/post), and the
  line-variance distribution.
- Sets `claimSupported` only when **all** of the following are true:
  - `rightsConfirmed` is `true`;
  - at least **100 held-out jobs** are present;
  - the held-out pass rate is **100%**.
- Otherwise the report explicitly says the claim is not supported and that customer copy must say "target".

Command:

```bash
npm run accuracy:report -- path/to/golden-set.json reports/accuracy-report.md
```

The CLI refuses malformed manifests, rejects unit-less or non-positive quantities, and returns a non-zero exit code
when the claim gate is not met.

## 3. Tooling verification (not a product result)

The evaluation module has three automated tests covering:

1. Grouped summaries, variance buckets and the "claim not supported" rendering.
2. The claim gate: rights + 100 held-out jobs + perfect pass rate; failures, missing rights and too-small datasets all
   block the claim.
3. Strict manifest rejection (unknown fields, unsupported units, zero benchmark quantities).

These tests verify the evaluator, not the accuracy of the takeoff product.

## 4. Why the claim is withheld

- **OD-16 is unresolved:** no sourcing, licensing/rights confirmation or independent licensed-estimator benchmark set.
- **No held-out population:** with fewer than 100 held-out jobs the confidence interval would not support a ±3% claim.
- **Fixture processing:** the current worker uses fixture ingestion/measurement. Fixture outputs cannot establish
  production accuracy.
- **Review-stage coverage:** the tooling supports pre-review vs post-review reporting, but there is no real data to
  compare reviewer workload.

## 5. Required work before any accuracy claim

1. Source 100 jobs with confirmed drawing rights and independent licensed-estimator quantities (OD-16).
2. Record the manifest with the agreed split (small calibration subset, held-out evaluation subset).
3. Run the evaluator and archive the generated report with the dataset version.
4. Only if `claimSupported=true`, update product copy; otherwise keep "target" language.

Until then, this report is the M11 accuracy artefact: **tooling complete, claim withheld.**

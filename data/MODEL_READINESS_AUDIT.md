# Model Readiness Audit

**Decision: NOT_APPROVED_FOR_OPERATIONAL_WARNING**

The dashboard remains on experimental v2. Both v3 artifacts are candidates and are not deployed.

## Reproducible evidence

- Training rows: 840 (2007–2016); spatial blocks: 95.
- Temporal holdout (2015–2016): precision 84.4%, recall 76.7%.
- Spatial OOF: precision 83.8%, recall 62.6%; fold recall range 31.2%–85.2%.
- Sensitivity-first candidate threshold 0.14: precision 66.5%, recall 86.0%.

## Why promotion is blocked

- Controls are background_no_record, not confirmed no-landslide observations.
- The evaluated dataset covers 2007–2016; it is not an independent 2025–2026 operational validation set.
- Spatial-fold recall varies materially; the lowest fold recall at score threshold 0.5 is below an operational safety standard.
- Scores come from a balanced case-control sample and are not real-world landslide probabilities.
- No government-approved alert threshold, local expert sign-off, or representative population denominator is recorded.

## Required before any operational pilot

- Verified contemporary NER landslide-event dataset
- Representative non-event denominator
- Independent temporal and spatial validation
- State/IMD/domain-expert review
- Approved alert operating policy and monitored pilot

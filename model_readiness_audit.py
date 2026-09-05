"""Create a concise, reproducible go/no-go audit for model artifacts.

This script never trains, promotes, or replaces a model. It turns the existing
v3 temporal/spatial evaluation and calibration files into a single evidence
record suitable for review by a domain expert or SIH judge.

Usage: python model_readiness_audit.py
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
EVALUATION = ROOT / "data" / "v3_model_evaluation_report.json"
CALIBRATION = ROOT / "data" / "v3_calibration_threshold_report.json"
TRAINING = ROOT / "data" / "final_training_data_v3.csv"
CURRENT_MODEL = ROOT / "ml_model" / "landslide_model_v2.pkl"
CANDIDATE = ROOT / "ml_model" / "landslide_model_v3_candidate.pkl"
CALIBRATED_CANDIDATE = ROOT / "ml_model" / "landslide_model_v3_calibrated_candidate.pkl"
OUT_JSON = ROOT / "data" / "model_readiness_audit.json"
OUT_MD = ROOT / "data" / "MODEL_READINESS_AUDIT.md"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    evaluation = json.loads(EVALUATION.read_text(encoding="utf-8"))
    calibration = json.loads(CALIBRATION.read_text(encoding="utf-8"))
    temporal = evaluation["temporal_holdout"]
    spatial = evaluation["spatial_blocked_cv"]
    oof = spatial["out_of_fold"]
    fold_recalls = [fold["recall_at_0_5"] for fold in spatial["folds"]]
    policy = calibration["selected_warning_policy"]
    calibrated = policy["out_of_fold_metrics"]

    blockers = [
        "Controls are background_no_record, not confirmed no-landslide observations.",
        "The evaluated dataset covers 2007–2016; it is not an independent 2025–2026 operational validation set.",
        "Spatial-fold recall varies materially; the lowest fold recall at score threshold 0.5 is below an operational safety standard.",
        "Scores come from a balanced case-control sample and are not real-world landslide probabilities.",
        "No government-approved alert threshold, local expert sign-off, or representative population denominator is recorded.",
    ]
    audit = {
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "decision": "NOT_APPROVED_FOR_OPERATIONAL_WARNING",
        "current_dashboard_artifact": {"path": str(CURRENT_MODEL.relative_to(ROOT)), "status": "experimental_v2_in_use", "sha256": sha256(CURRENT_MODEL)},
        "v3_candidate_artifacts": [
            {"path": str(CANDIDATE.relative_to(ROOT)), "status": "candidate_not_deployed", "sha256": sha256(CANDIDATE)},
            {"path": str(CALIBRATED_CANDIDATE.relative_to(ROOT)), "status": "candidate_not_deployed", "sha256": sha256(CALIBRATED_CANDIDATE)},
        ],
        "evidence_inputs": {"training_data": str(TRAINING.relative_to(ROOT)), "training_data_sha256": sha256(TRAINING), "rows": evaluation["dataset"]["rows"], "years": evaluation["dataset"]["years"], "spatial_blocks": spatial["unique_spatial_blocks"]},
        "research_metrics_only": {
            "temporal_holdout_2015_2016": {key: temporal[key] for key in ("rows", "roc_auc", "average_precision", "precision_at_0_5", "recall_at_0_5", "confusion_matrix_at_0_5")},
            "spatial_out_of_fold": {key: oof[key] for key in ("rows", "roc_auc", "average_precision", "precision_at_0_5", "recall_at_0_5", "confusion_matrix_at_0_5")},
            "spatial_fold_recall_range": {"minimum": min(fold_recalls), "maximum": max(fold_recalls)},
            "sensitivity_first_candidate_policy": {"threshold": policy["warning_threshold"], "precision": calibrated["precision"], "recall": calibrated["recall"], "confusion_matrix": calibrated["confusion_matrix"]},
        },
        "blockers": blockers,
        "allowed_use": "Research demonstration and experimental screening only; do not issue evacuation, public warning, or official probability.",
        "promotion_requirements": ["Verified contemporary NER landslide-event dataset", "Representative non-event denominator", "Independent temporal and spatial validation", "State/IMD/domain-expert review", "Approved alert operating policy and monitored pilot"],
    }
    OUT_JSON.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    markdown = "# Model Readiness Audit\n\n"
    markdown += f"**Decision: {audit['decision']}**\n\n"
    markdown += "The dashboard remains on experimental v2. Both v3 artifacts are candidates and are not deployed.\n\n"
    markdown += "## Reproducible evidence\n\n"
    markdown += f"- Training rows: {audit['evidence_inputs']['rows']} ({audit['evidence_inputs']['years'][0]}–{audit['evidence_inputs']['years'][1]}); spatial blocks: {audit['evidence_inputs']['spatial_blocks']}.\n"
    markdown += f"- Temporal holdout (2015–2016): precision {temporal['precision_at_0_5']:.1%}, recall {temporal['recall_at_0_5']:.1%}.\n"
    markdown += f"- Spatial OOF: precision {oof['precision_at_0_5']:.1%}, recall {oof['recall_at_0_5']:.1%}; fold recall range {min(fold_recalls):.1%}–{max(fold_recalls):.1%}.\n"
    markdown += f"- Sensitivity-first candidate threshold {policy['warning_threshold']}: precision {calibrated['precision']:.1%}, recall {calibrated['recall']:.1%}.\n\n"
    markdown += "## Why promotion is blocked\n\n" + "".join(f"- {item}\n" for item in blockers)
    markdown += "\n## Required before any operational pilot\n\n" + "".join(f"- {item}\n" for item in audit["promotion_requirements"])
    OUT_MD.write_text(markdown, encoding="utf-8")
    print(OUT_JSON)
    print(OUT_MD)


if __name__ == "__main__":
    main()

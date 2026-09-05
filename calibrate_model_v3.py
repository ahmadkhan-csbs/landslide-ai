"""Calibrate the v3 candidate and select a sensitivity-first warning threshold.

Calibration and threshold selection use outer spatially blocked folds, so each
evaluated location block is unseen by its trained model. The v3 data is a
balanced case-control sample, therefore calibrated scores are *not* real-world
landslide probabilities; they are calibrated relative event scores only.

Usage: python calibrate_model_v3.py
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

from train_model_v3 import DATA_CSV, FEATURES, TARGET


CALIBRATED_CANDIDATE = Path("ml_model/landslide_model_v3_calibrated_candidate.pkl")
POLICY_JSON = Path("ml_model/landslide_model_v3_threshold_policy.json")
REPORT_JSON = Path("data/v3_calibration_threshold_report.json")
TARGET_RECALL = 0.85


def make_calibration_model() -> RandomForestClassifier:
    """Smaller deterministic forest for nested spatial validation runtime."""
    return RandomForestClassifier(
        n_estimators=50,
        max_depth=12,
        min_samples_leaf=3,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=42,
    )


def metric_summary(y_true: pd.Series, probabilities: np.ndarray, threshold: float = 0.5) -> dict:
    predictions = (probabilities >= threshold).astype(int)
    return {
        "threshold": round(float(threshold), 3),
        "rows": int(len(y_true)),
        "roc_auc": round(float(roc_auc_score(y_true, probabilities)), 4),
        "average_precision": round(float(average_precision_score(y_true, probabilities)), 4),
        "brier_score": round(float(brier_score_loss(y_true, probabilities)), 4),
        "accuracy": round(float(accuracy_score(y_true, predictions)), 4),
        "precision": round(float(precision_score(y_true, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, predictions, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_true, predictions, labels=[0, 1]).tolist(),
    }


def spatial_out_of_fold_probabilities(data: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, int]:
    """Return raw and sigmoid-calibrated scores for unseen 1° spatial blocks."""
    blocks = data["lat"].floordiv(1).astype(int).astype(str) + "_" + data["lon"].floordiv(1).astype(int).astype(str)
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    raw = np.zeros(len(data))
    calibrated = np.zeros(len(data))

    for fold, (train_index, test_index) in enumerate(splitter.split(data[FEATURES], data[TARGET], groups=blocks), start=1):
        print(f"Calibrating spatial fold {fold}/5…", flush=True)
        X_train, y_train = data.iloc[train_index][FEATURES], data.iloc[train_index][TARGET]
        X_test = data.iloc[test_index][FEATURES]
        raw_model = make_calibration_model().fit(X_train, y_train)
        raw[test_index] = raw_model.predict_proba(X_test)[:, 1]

        # Sigmoid calibration is deliberately chosen over isotonic because the
        # per-fold training set is small and isotonic is prone to overfitting.
        calibrator = CalibratedClassifierCV(
            estimator=make_calibration_model(),
            method="sigmoid",
            cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        ).fit(X_train, y_train)
        calibrated[test_index] = calibrator.predict_proba(X_test)[:, 1]

    return raw, calibrated, int(blocks.nunique())


def reliability_bins(y_true: pd.Series, probabilities: np.ndarray) -> list[dict]:
    observed, predicted = calibration_curve(y_true, probabilities, n_bins=10, strategy="quantile")
    return [
        {"mean_predicted_score": round(float(pred), 4), "observed_event_rate": round(float(obs), 4)}
        for pred, obs in zip(predicted, observed)
    ]


def select_threshold(y_true: pd.Series, probabilities: np.ndarray) -> tuple[float, list[dict]]:
    """Use the highest threshold that retains the requested OOF recall."""
    candidates = []
    for threshold in np.arange(0.05, 0.96, 0.01):
        summary = metric_summary(y_true, probabilities, float(threshold))
        candidates.append(summary)
    eligible = [row for row in candidates if row["recall"] >= TARGET_RECALL]
    if not eligible:
        raise RuntimeError(f"No threshold reaches target recall {TARGET_RECALL:.0%}.")
    return float(max(eligible, key=lambda row: row["threshold"])["threshold"]), candidates


def main() -> None:
    data = pd.read_csv(DATA_CSV)
    if set(data[TARGET].unique()) != {0, 1}:
        raise ValueError("v3 data must contain both target classes.")
    raw, calibrated, block_count = spatial_out_of_fold_probabilities(data)
    selected_threshold, threshold_table = select_threshold(data[TARGET], calibrated)

    final_calibrator = CalibratedClassifierCV(
        estimator=make_calibration_model(),
        method="sigmoid",
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
    ).fit(data[FEATURES], data[TARGET])
    joblib.dump(final_calibrator, CALIBRATED_CANDIDATE)

    policy = {
        "artifact_status": "candidate_not_deployed",
        "model_artifact": str(CALIBRATED_CANDIDATE),
        "score_name": "calibrated_relative_event_score",
        "score_is_real_world_probability": False,
        "warning_threshold": round(selected_threshold, 3),
        "selection_rule": f"Highest spatial-OOF threshold with recall >= {TARGET_RECALL:.0%}",
        "validation_scope": "5-fold spatially blocked out-of-fold evaluation",
        "deployment_guardrail": "Do not deploy until a representative non-event denominator, local expert review, and alert-operating policy are available.",
    }
    report = {
        "data_caveat": "Scores are calibrated on a balanced catalogued-event versus background-no-record sample, not on population event prevalence.",
        "spatial_blocks": block_count,
        "raw_out_of_fold_at_0_5": metric_summary(data[TARGET], raw),
        "calibrated_out_of_fold_at_0_5": metric_summary(data[TARGET], calibrated),
        "selected_warning_policy": {**policy, "out_of_fold_metrics": metric_summary(data[TARGET], calibrated, selected_threshold)},
        "reliability_bins": {
            "raw": reliability_bins(data[TARGET], raw),
            "sigmoid_calibrated": reliability_bins(data[TARGET], calibrated),
        },
        "threshold_table": threshold_table,
    }
    POLICY_JSON.write_text(json.dumps(policy, indent=2), encoding="utf-8")
    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("Calibrated v3 candidate:", CALIBRATED_CANDIDATE)
    print("Selected warning threshold:", policy["warning_threshold"])
    print(json.dumps(report["selected_warning_policy"]["out_of_fold_metrics"], indent=2))
    print("Calibration report:", REPORT_JSON)


if __name__ == "__main__":
    main()

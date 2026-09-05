"""Train and evaluate the v3 landslide-event candidate model.

This script intentionally keeps the v2 production model untouched. It reports
two harder validation views before saving a *candidate* artifact:

* temporal holdout: train through 2014, test on 2015-2016;
* spatial blocked CV: each fold withholds whole 1° latitude/longitude blocks.

The target is ``event_observed``. Background controls mean no catalogued event
in that period, not proof of a safe/no-landslide location, so these metrics are
research metrics and must not be presented as official warning performance.

Usage: python train_model_v3.py
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
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
from sklearn.model_selection import StratifiedGroupKFold


DATA_CSV = Path("data/final_training_data_v3.csv")
CANDIDATE_MODEL = Path("ml_model/landslide_model_v3_candidate.pkl")
METADATA_JSON = Path("ml_model/landslide_model_v3_metadata.json")
REPORT_JSON = Path("data/v3_model_evaluation_report.json")
FEATURES = ["lat", "lon", "month", "rainfall", "elevation", "slope"]
TARGET = "event_observed"
TEMPORAL_TRAIN_END_YEAR = 2014


def make_model() -> RandomForestClassifier:
    """A conservative baseline; tuning is intentionally deferred."""
    return RandomForestClassifier(
        n_estimators=500,
        max_depth=12,
        min_samples_leaf=3,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=42,
    )


def metric_summary(y_true: pd.Series, probabilities: np.ndarray) -> dict:
    predictions = (probabilities >= 0.5).astype(int)
    return {
        "rows": int(len(y_true)),
        "positive_rate": round(float(y_true.mean()), 4),
        "roc_auc": round(float(roc_auc_score(y_true, probabilities)), 4),
        "average_precision": round(float(average_precision_score(y_true, probabilities)), 4),
        "brier_score": round(float(brier_score_loss(y_true, probabilities)), 4),
        "accuracy_at_0_5": round(float(accuracy_score(y_true, predictions)), 4),
        "precision_at_0_5": round(float(precision_score(y_true, predictions, zero_division=0)), 4),
        "recall_at_0_5": round(float(recall_score(y_true, predictions, zero_division=0)), 4),
        "f1_at_0_5": round(float(f1_score(y_true, predictions, zero_division=0)), 4),
        "confusion_matrix_at_0_5": confusion_matrix(y_true, predictions, labels=[0, 1]).tolist(),
    }


def temporal_holdout(data: pd.DataFrame) -> dict:
    train = data.loc[data["year"] <= TEMPORAL_TRAIN_END_YEAR]
    test = data.loc[data["year"] > TEMPORAL_TRAIN_END_YEAR]
    if train[TARGET].nunique() != 2 or test[TARGET].nunique() != 2:
        raise ValueError("Temporal split must contain both classes in train and test.")

    model = make_model().fit(train[FEATURES], train[TARGET])
    metrics = metric_summary(test[TARGET], model.predict_proba(test[FEATURES])[:, 1])
    return {
        "train_years": [int(train.year.min()), int(train.year.max())],
        "test_years": [int(test.year.min()), int(test.year.max())],
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        **metrics,
    }


def spatial_blocked_cv(data: pd.DataFrame) -> dict:
    """Out-of-fold evaluation while holding out whole 1° spatial blocks."""
    blocks = data["lat"].floordiv(1).astype(int).astype(str) + "_" + data["lon"].floordiv(1).astype(int).astype(str)
    if blocks.nunique() < 5:
        raise ValueError("Need at least five spatial blocks for blocked CV.")

    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    out_of_fold = np.zeros(len(data))
    folds = []
    for fold, (train_index, test_index) in enumerate(splitter.split(data[FEATURES], data[TARGET], groups=blocks), start=1):
        model = make_model().fit(data.iloc[train_index][FEATURES], data.iloc[train_index][TARGET])
        probabilities = model.predict_proba(data.iloc[test_index][FEATURES])[:, 1]
        out_of_fold[test_index] = probabilities
        folds.append(
            {
                "fold": fold,
                "train_rows": int(len(train_index)),
                "test_rows": int(len(test_index)),
                "test_spatial_blocks": int(blocks.iloc[test_index].nunique()),
                **metric_summary(data.iloc[test_index][TARGET], probabilities),
            }
        )
    return {
        "block_definition": "floor(latitude)_floor(longitude), approximately 1 degree",
        "unique_spatial_blocks": int(blocks.nunique()),
        "folds": folds,
        "out_of_fold": metric_summary(data[TARGET], out_of_fold),
    }


def main() -> None:
    data = pd.read_csv(DATA_CSV)
    required_columns = set(FEATURES + [TARGET, "year", "sample_type"])
    missing = required_columns.difference(data.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing)}")
    if data[FEATURES + [TARGET]].isna().any().any():
        raise ValueError("Dataset contains missing model features or targets.")
    if set(data[TARGET].unique()) != {0, 1}:
        raise ValueError("Target must contain both 0 and 1.")

    temporal = temporal_holdout(data)
    spatial = spatial_blocked_cv(data)

    final_model = make_model().fit(data[FEATURES], data[TARGET])
    joblib.dump(final_model, CANDIDATE_MODEL)
    feature_importance = {
        feature: round(float(importance), 6)
        for feature, importance in zip(FEATURES, final_model.feature_importances_)
    }
    metadata = {
        "artifact_status": "candidate_not_deployed",
        "model_type": "RandomForestClassifier",
        "features": FEATURES,
        "target": TARGET,
        "training_rows": int(len(data)),
        "training_years": [int(data.year.min()), int(data.year.max())],
        "sample_types": {str(key): int(value) for key, value in data.sample_type.value_counts().items()},
        "feature_importance": feature_importance,
        "deployment_guardrail": "Do not wire this model into live alerts until data coverage, calibration, and operational thresholds are reviewed.",
    }
    report = {
        "dataset": {
            "path": str(DATA_CSV),
            "rows": int(len(data)),
            "years": [int(data.year.min()), int(data.year.max())],
            "target": TARGET,
            "control_caveat": "Controls are background_no_record, not confirmed no-landslide observations.",
        },
        "temporal_holdout": temporal,
        "spatial_blocked_cv": spatial,
        "candidate_artifact": str(CANDIDATE_MODEL),
        "status": "candidate_not_deployed",
    }
    METADATA_JSON.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("v3 candidate model saved:", CANDIDATE_MODEL)
    print("Temporal holdout:", json.dumps(temporal, indent=2))
    print("Spatial out-of-fold:", json.dumps(spatial["out_of_fold"], indent=2))
    print("Evaluation report:", REPORT_JSON)


if __name__ == "__main__":
    main()

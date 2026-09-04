"""
Model v2 Training — Rainfall + Terrain (Elevation, Slope)
Compare: v1 (93.6%) vs v2
Usage: python train_model_v2.py
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, f1_score, classification_report

DATA_CSV = "data/final_training_data.csv"
FEATURES = ["lat", "lon", "month", "rainfall", "elevation", "slope"]
TARGET = "landslide"


def main():
    df = pd.read_csv(DATA_CSV)
    print(f"📊 Training data: {len(df)} rows")

    X = df[FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=200, max_depth=12, random_state=42
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)

    print("\n" + "="*45)
    print("🏆 MODEL v2 RESULTS (Rainfall + Terrain)")
    print("="*45)
    print(f"   Accuracy:  {acc*100:.1f}%   (v1: 93.6%)")
    print(f"   Precision: {prec*100:.1f}%")
    print(f"   F1 Score:  {f1*100:.1f}%")
    print("="*45)
    print(classification_report(y_test, y_pred))

    # Feature Importance (pitch deck ke liye graph!)
    imp = pd.Series(model.feature_importances_, index=FEATURES).sort_values()
    print("📌 Feature Importance:")
    print(imp.sort_values(ascending=False).round(3))

    plt.figure(figsize=(8, 5))
    colors = ["#22c55e" if v < 0.2 else "#f59e0b" if v < 0.3 else "#ef4444" for v in imp]
    imp.plot(kind="barh", color=colors)
    plt.title("Feature Importance — Landslide Model v2")
    plt.xlabel("Importance")
    plt.tight_layout()
    plt.savefig("data/feature_importance_v2.png", dpi=150)
    print("\n📊 Graph saved → data/feature_importance_v2.png")

    # Save model v2 (v1 ko touch nahi kiya — safe!)
    joblib.dump(model, "ml_model/landslide_model_v2.pkl")
    print("💾 Model saved → ml_model/landslide_model_v2.pkl")


if __name__ == "__main__":
    main()

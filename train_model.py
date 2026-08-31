import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import joblib

print("LANDSLIDE MODEL TRAINING START...")
df = pd.read_csv("data/Global_Landslide_Catalog_Export.csv", encoding="latin1")
india = df[df['country_name'].str.contains('India', case=False, na=False)].copy()

ner_keywords = ['assam', 'nagaland', 'manipur', 'mizoram', 'tripura', 'meghalaya', 'arun', 'sikkim', 'bengal']
mask = india['admin_division_name'].fillna('').astype(str).str.lower().apply(lambda x: any(k in x for k in ner_keywords))

ner = india[mask].copy()
print("NER events mile:", len(ner))

pos = ner[['latitude', 'longitude', 'event_date']].dropna().copy()
pos['event_date'] = pd.to_datetime(pos['event_date'], errors='coerce')
pos = pos.dropna()
pos['month'] = pos['event_date'].dt.month
pos['landslide'] = 1
print("Positive samples:", len(pos))

np.random.seed(42)
n_neg = len(pos)
neg = pd.DataFrame({
    'latitude': np.random.uniform(21.5, 28.5, n_neg),
    'longitude': np.random.uniform(88.0, 97.5, n_neg),
    'month': np.random.choice([1,2,3,4,11,12], n_neg),
    'landslide': 0
})
print("Negative samples:", len(neg))

RAINFALL = {1:10, 2:15, 3:30, 4:60, 5:120, 6:320, 7:380, 8:340, 9:250, 10:120, 11:20, 12:12}

def make_features(data):
    d = data.copy()
    d['rainfall'] = d['month'].map(RAINFALL)
    d['terrain_risk'] = (np.abs(d['latitude'] - 25.5) + np.abs(d['longitude'] - 93.0))
    d['terrain_risk'] = 1 / (1 + d['terrain_risk'])
    return d[['latitude', 'longitude', 'month', 'rainfall', 'terrain_risk', 'landslide']]

data = pd.concat([make_features(pos), make_features(neg)], ignore_index=True)
print("Total training samples:", len(data))

X = data[['latitude', 'longitude', 'month', 'rainfall', 'terrain_risk']]

y = data['landslide']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42)
model.fit(X_train, y_train)
print("Model train ho gaya!")

y_pred = model.predict(X_test)
print("Accuracy: ", round(accuracy_score(y_test, y_pred)*100, 1), "%")
print("Precision:", round(precision_score(y_test, y_pred)*100, 1), "%")
print("Recall:   ", round(recall_score(y_test, y_pred)*100, 1), "%")
print("F1-Score: ", round(f1_score(y_test, y_pred)*100, 1), "%")
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

print("Feature Importance:")
for feat, imp in zip(X.columns, model.feature_importances_):
    print(" ", feat, "=", round(imp*100, 1), "%")

import os
os.makedirs("ml_model", exist_ok=True)
import joblib
joblib.dump(model, "ml_model/landslide_model.pkl")
print("Model saved: ml_model/landslide_model.pkl")

print("LIVE TEST - NER Locations:")
tests = [
    ("Guwahati Assam July", 26.14, 91.73, 7),
    ("Shillong Megh July", 25.57, 91.88, 7),
    ("Imphal Manipur July", 24.81, 93.94, 7),
    ("Guwahati Assam Dec", 26.14, 91.73, 12),
]
for name, lat, lon, month in tests:
    rain = RAINFALL.get(month, 50)
    terr = 1 / (1 + abs(lat - 25.5) + abs(lon - 93.0))
    inp = pd.DataFrame([[lat, lon, month, rain, terr]], columns=X.columns)
    prob = model.predict_proba(inp)[0][1]
    if prob > 0.6: risk = "HIGH"
    elif prob > 0.3: risk = "MEDIUM"
    else: risk = "LOW"
    print(" ", name, "-> Risk:", round(prob*100, 1), "%", risk)

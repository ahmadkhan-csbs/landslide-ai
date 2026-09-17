import urllib.request
import json
import os

url = "https://raw.githubusercontent.com/geohacker/india/master/state/india_telengana.geojson"
try:
    print("Downloading India GeoJSON...")
    response = urllib.request.urlopen(url)
    data = json.loads(response.read())
    
    ner_states = [
        "Arunachal Pradesh", "Assam", "Meghalaya", "Nagaland", 
        "Manipur", "Mizoram", "Tripura", "Sikkim"
    ]
    
    ner_features = []
    for feature in data.get("features", []):
        state_name = feature.get("properties", {}).get("st_nm", "")
        if state_name in ner_states:
            ner_features.append(feature)
            
    ner_geojson = {
        "type": "FeatureCollection",
        "features": ner_features
    }
    
    os.makedirs("dashboard/public", exist_ok=True)
    with open("dashboard/public/ner.geojson", "w") as f:
        json.dump(ner_geojson, f)
        
    print(f"Saved {len(ner_features)} NER states to dashboard/public/ner.geojson")
except Exception as e:
    print("Error:", e)

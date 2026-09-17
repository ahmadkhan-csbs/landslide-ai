import requests
import json

def fetch_ner_geojson():
    print("Fetching India GeoJSON...")
    url = "https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        ner_states = [
            "Assam", "Arunachal Pradesh", "Meghalaya", "Nagaland", 
            "Manipur", "Mizoram", "Tripura", "Sikkim"
        ]
        
        ner_features = []
        for feature in data.get('features', []):
            # Property name might be 'NAME_1', 'st_nm', or 'name' depending on the GeoJSON
            props = feature.get('properties', {})
            state_name = props.get('NAME_1') or props.get('st_nm') or props.get('name', '')
            
            if state_name in ner_states:
                ner_features.append(feature)
                
        if not ner_features:
            print("Could not find NER states in this dataset. Checking properties...")
            if data.get('features'):
                print("Available properties in first feature:", data['features'][0]['properties'])
            return
            
        ner_geojson = {
            "type": "FeatureCollection",
            "features": ner_features
        }
        
        with open('ner_boundary.geojson', 'w') as f:
            json.dump(ner_geojson, f)
        print(f"Successfully saved {len(ner_features)} NER states to ner_boundary.geojson")
        
    except Exception as e:
        print(f"Error fetching GeoJSON: {e}")

if __name__ == "__main__":
    fetch_ner_geojson()

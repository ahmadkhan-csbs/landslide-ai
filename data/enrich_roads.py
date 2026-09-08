import json
import requests
import time

with open("ner_connectivity_demo.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for corridor in data.get("corridors", []):
    points = corridor.get("points", [])
    if not points:
        continue
    
    # OSRM expects lon,lat
    waypoints = ";".join([f"{p[1]},{p[0]}" for p in points])
    url = f"http://router.project-osrm.org/route/v1/driving/{waypoints}?overview=full&geometries=geojson"
    print(f"Fetching route for {corridor['name']}...")
    
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            res = r.json()
            if "routes" in res and len(res["routes"]) > 0:
                # OSRM returns GeoJSON coordinates as [lon, lat]
                coords = res["routes"][0]["geometry"]["coordinates"]
                # Convert back to Leaflet format [lat, lon]
                leaflet_points = [[c[1], c[0]] for c in coords]
                corridor["points"] = leaflet_points
                print(f"  Success: {len(leaflet_points)} points")
            else:
                print("  No route found")
        else:
            print(f"  Failed with status {r.status_code}")
    except Exception as e:
        print(f"  Error: {e}")
        
    # Sleep to respect OSRM public API rate limits (max 100 req/min)
    time.sleep(1)

with open("ner_connectivity_demo.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done enriching geometries!")

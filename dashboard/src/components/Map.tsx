"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, LayersControl, LayerGroup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface Alert {
  name: string;
  lat: number;
  lon: number;
  state: string;
  risk: number;
  level: string;
  main_reason: string;
  rainfall_mm: number;
  susceptibility_score: number;
  trigger_prob: number;
  pred_24h: number;
  pred_48h: number;
  pred_72h: number;
  soil_moisture: number;
  soil_saturation: string;
  soil_24h_change: string | number;
  sat_detected: boolean;
  sat_confidence: number;
  exp_rain: number;
  exp_soil: number;
  exp_slope: number;
  exp_hist: number;
  exp_sat: number;
  road_closure_prob: number;
  road_status: string;
  affected_villages: number;
  rainfall_source: string;
  weather_status: string;
  elevation: number;
  slope: number;
  nearest_city: string;
  data_source: string;
}

export default function Map() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nerGeoData, setNerGeoData] = useState<any>(null);
  const [isHudOpen, setIsHudOpen] = useState(false);

  useEffect(() => {
    // Fix Leaflet icon issue in Next.js
    delete (window.L.Icon.Default.prototype as any)._getIconUrl;
    window.L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    const fetchAlerts = async () => {
      try {
        setError(null);
        // Fetch GeoJSON for border
        if (!nerGeoData) {
          fetch("/ner.geojson")
            .then(res => res.json())
            .then(data => setNerGeoData(data))
            .catch(e => console.error("Could not load NER GeoJSON", e));
        }

        const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
        const url = apiBase ? `${apiBase}/alerts?use_live=true` : "/api/alerts?use_live=true";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setAlerts(data);
        } else {
          setError(`Backend Error: ${res.status} ${res.statusText}`);
        }
      } catch (err: any) {
        console.error("Map failed to fetch alerts", err);
        setError("Cannot connect to backend API. Is the FastAPI server running?");
      } finally {
        setLoading(false);
      }
    };
    
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const getMarkerColor = (level: string) => {
    if (level === "HIGH") return "#ef4444"; // red-500
    if (level === "MEDIUM") return "#f97316"; // orange-500
    return "#10b981"; // emerald-500
  };

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-3xl overflow-hidden">
      <MapContainer 
        center={[25.7, 93.5]} 
        zoom={7} 
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="📡 Google Satellite">
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              attribution="&copy; Google Maps"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🛣️ Google Road Map">
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              attribution="&copy; Google Maps"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🏔️ Google Terrain">
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
              attribution="&copy; Google Maps"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🌙 Dark Map (Minimal)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />
          </LayersControl.BaseLayer>

          {/* Regional Risk Heatmap Simulation */}
          <LayersControl.Overlay name="🔥 Regional Risk Heatmap">
            <LayerGroup>
              {alerts.map((alert, idx) => (
                <Circle
                  key={`heat-outer-${idx}`}
                  center={[alert.lat, alert.lon]}
                  radius={45000} // 45km outer blend radius
                  pathOptions={{
                    fillColor: alert.level === "HIGH" ? "#ef4444" : alert.level === "MEDIUM" ? "#f97316" : "#10b981",
                    fillOpacity: 0.15,
                    stroke: false,
                  }}
                />
              ))}
              {alerts.map((alert, idx) => (
                <Circle
                  key={`heat-inner-${idx}`}
                  center={[alert.lat, alert.lon]}
                  radius={15000} // 15km inner core
                  pathOptions={{
                    fillColor: alert.level === "HIGH" ? "#ef4444" : alert.level === "MEDIUM" ? "#f97316" : "#10b981",
                    fillOpacity: 0.35,
                    stroke: false,
                  }}
                />
              ))}
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>

        {nerGeoData && (
          <GeoJSON 
            data={nerGeoData} 
            style={() => ({
              color: '#06b6d4', // cyan-500 border
              weight: 3,
              opacity: 0.8,
              fillColor: '#000000',
              fillOpacity: 0.1,
              dashArray: '5, 5'
            })} 
          />
        )}

        {alerts.map((alert, idx) => (
          <CircleMarker
            key={idx}
            center={[alert.lat, alert.lon]}
            radius={alert.level === "HIGH" ? 12 : alert.level === "MEDIUM" ? 8 : 5}
            pathOptions={{ 
              color: getMarkerColor(alert.level),
              fillColor: getMarkerColor(alert.level),
              fillOpacity: 0.8,
              weight: 2
            }}
          >
            <Popup className="custom-popup">
              <div className="p-1 text-slate-100 font-sans">
                <h3 className="font-bold text-lg mb-1">{alert.name}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                    alert.level === "HIGH" ? "bg-red-500" : 
                    alert.level === "MEDIUM" ? "bg-orange-500" : "bg-emerald-500"
                  }`}>
                    {alert.level} RISK
                  </span>
                  <span className="font-bold">{alert.risk.toFixed(1)}%</span>
                </div>
                <p className="text-sm border-t border-slate-600 pt-2 mb-2 text-slate-300">
                  <strong className="text-white">Trigger:</strong> {alert.main_reason}
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs bg-slate-800/80 border border-slate-700 p-3 rounded mt-2 text-white w-64">
                  <div className="col-span-2 border-b border-slate-700 pb-1 mb-1 font-bold text-slate-300">Terrain & Weather</div>
                  <div><span className="text-slate-400">Rain (24h):</span> {alert.rainfall_mm.toFixed(1)} mm</div>
                  <div><span className="text-slate-400">Forecast:</span> {alert.pred_24h?.toFixed(1) || 0} mm</div>
                  <div><span className="text-slate-400">Elev:</span> {alert.elevation} m</div>
                  <div><span className="text-slate-400">Slope:</span> {alert.slope}%</div>
                  <div><span className="text-slate-400">Soil Moist:</span> {alert.soil_moisture}%</div>
                  <div><span className="text-slate-400">Saturation:</span> {alert.soil_saturation}</div>
                  
                  <div className="col-span-2 border-b border-slate-700 pb-1 mb-1 mt-2 font-bold text-slate-300">Impact & Sensors</div>
                  <div><span className="text-slate-400">Roads:</span> <span className={alert.road_status === 'CLOSED' ? 'text-red-400' : 'text-emerald-400'}>{alert.road_status}</span></div>
                  <div><span className="text-slate-400">Villages:</span> {alert.affected_villages || 0} at risk</div>
                  <div className="col-span-2 flex items-center justify-between mt-1">
                    <span className="text-slate-400">Sat Anomaly:</span> 
                    {alert.sat_detected ? <span className="text-red-400 font-bold animate-pulse">DETECTED ({alert.sat_confidence}%)</span> : <span className="text-emerald-400">CLEAR</span>}
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* HUD Overlay with NER Demographics */}
      <div className="absolute top-6 left-6 z-10 pointer-events-none flex flex-col gap-4">
        {!isHudOpen ? (
          <button 
            onClick={() => setIsHudOpen(true)}
            className="pointer-events-auto bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-3 hover:bg-slate-800 transition-colors text-white"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
            <span className="font-bold text-sm">Region Info</span>
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        ) : (
          <div className="pointer-events-auto flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl relative">
              <button 
                onClick={() => setIsHudOpen(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <h3 className="font-bold text-lg mb-1 flex items-center gap-2 text-white pr-6">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
                Northeast India
              </h3>
              <p className="text-xs text-slate-400">Monitoring {alerts.length || 53} high-risk zones</p>
              
              <div className="mt-4 space-y-2 border-t border-slate-700/50 pt-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-sm text-slate-300">High Risk</span>
                  </div>
                  <span className="font-bold text-white">{alerts.filter(a => a.level === "HIGH").length}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="text-sm text-slate-300">Medium Risk</span>
                  </div>
                  <span className="font-bold text-white">{alerts.filter(a => a.level === "MEDIUM").length}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-sm text-slate-300">Low Risk</span>
                  </div>
                  <span className="font-bold text-white">{alerts.filter(a => a.level === "LOW").length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Region Statistics</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-500">States</span>
                  <p className="text-white font-medium">8 (incl. Sikkim)</p>
                </div>
                <div>
                  <span className="text-slate-500">Population</span>
                  <p className="text-white font-medium">~4.58 Crore</p>
                </div>
                <div>
                  <span className="text-slate-500">Area</span>
                  <p className="text-white font-medium">262,179 km²</p>
                </div>
                <div>
                  <span className="text-slate-500">Districts</span>
                  <p className="text-white font-medium">131</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="absolute top-6 right-6 z-20 max-w-sm">
          <div className="bg-red-950/90 border border-red-500/50 p-4 rounded-xl shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-white font-bold text-lg">Backend Disconnected</h3>
            </div>
            <p className="text-red-200 text-sm">
              {error}
            </p>
            <p className="text-red-300 text-xs mt-2 border-t border-red-900/50 pt-2">
              Please open a new terminal and run:<br/>
              <code className="text-white bg-black/30 px-1 py-0.5 rounded mt-1 block font-mono text-[10px]">
                python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
              </code>
            </p>
          </div>
        </div>
      )}

      {loading && !error && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="bg-slate-800 p-6 rounded-xl shadow-xl flex flex-col items-center border border-slate-700">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white font-medium">Loading Live Satellite & Terrain Data...</p>
          </div>
        </div>
      )}
    </div>
  );
}

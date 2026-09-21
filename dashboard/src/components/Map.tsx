"use client";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, LayersControl, LayerGroup, Circle, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, Route, X, Clock, Play, Pause, ChevronRight, Car, ShieldCheck, Camera, Sparkles } from "lucide-react";

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

interface MapProps {
  filters?: {
    state: string;
    isLiveMode: boolean;
    simMonth: string;
    showCitizenReports: boolean;
    showConnectivity: boolean;
    showHeatmap: boolean;
    showEvacRoutes: boolean;
    showEmergencyAssets: boolean;
    assetSearch: string;
    assetType: string;
  };
  onStatsUpdate?: (stats: { total: number; highRisk: number; mlInputs: number }) => void;
  resetKey?: number;
  isCitizenAppOpen?: boolean;
  onToggleCitizenApp?: () => void;
}

interface RouteLocation {
  name: string;
  lat: number;
  lon: number;
}

interface RouteStep {
  instruction: string;
  distance: number;
  name: string;
}

interface CalculatedRoute {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  steps: RouteStep[];
  hazardHits: number;
  isAlternative: boolean;
}

interface Corridor {
  id: string;
  name: string;
  highway_ref?: string;
  points: [number, number][];
  status: string;
  priority_score: number;
  alternate_route?: string | null;
  action?: string;
}

interface CitizenReport {
  lat: number;
  lon: number;
  description: string;
  severity: string;
  verification_status: string;
}

interface EmergencyAsset {
  name: string;
  type: string;
  lat: number;
  lon: number;
  source: string;
  location_accuracy: string;
  status: string;
  contact_available: boolean;
}

function RouteViewport({ route }: { route: CalculatedRoute[] }) {
  const map = useMap();

  useEffect(() => {
    if (route.length > 0) {
      const points = route.flatMap(item => item.coordinates);
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, route]);

  return null;
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function distanceBetweenPoints(first: [number, number], second: [number, number]) {
  const radius = 6371;
  const latDelta = (second[0] - first[0]) * Math.PI / 180;
  const lonDelta = (second[1] - first[1]) * Math.PI / 180;
  const latitude = first[0] * Math.PI / 180;
  const nextLatitude = second[0] * Math.PI / 180;
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos(latitude) * Math.cos(nextLatitude) * Math.sin(lonDelta / 2) ** 2;
  return radius * 2 * Math.asin(Math.sqrt(value));
}

function routeHazardCount(route: [number, number][], corridors: Corridor[]) {
  const hazardCorridors = corridors.filter(corridor => corridor.status !== "NO_REPORTED_DISRUPTION");
  return hazardCorridors.filter(corridor => corridor.points.some(point => route.some(routePoint => distanceBetweenPoints(routePoint, point) <= 8))).length;
}

function getInterpolatedCoordinate(coordinates: [number, number][], progressPercent: number): [number, number] {
  if (!coordinates || coordinates.length === 0) return [0, 0];
  if (progressPercent <= 0) return coordinates[0];
  if (progressPercent >= 100) return coordinates[coordinates.length - 1];

  const totalSegments = coordinates.length - 1;
  const rawIndex = (progressPercent / 100) * totalSegments;
  const index = Math.floor(rawIndex);
  const fraction = rawIndex - index;

  if (index >= totalSegments) return coordinates[coordinates.length - 1];

  const p1 = coordinates[index];
  const p2 = coordinates[index + 1];

  const lat = p1[0] + (p2[0] - p1[0]) * fraction;
  const lon = p1[1] + (p2[1] - p1[1]) * fraction;

  return [lat, lon];
}

function RoutePlanner({
  locations,
  corridors,
  routes,
  start,
  end,
  avoidBlocked,
  loading,
  onStartChange,
  onEndChange,
  onAvoidChange,
  onCalculate,
  onClear,
  onStartSimulation,
  plannerRef,
}: {
  locations: RouteLocation[];
  corridors: Corridor[];
  routes: CalculatedRoute[];
  start: string;
  end: string;
  avoidBlocked: boolean;
  loading: boolean;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onAvoidChange: (value: boolean) => void;
  onCalculate: () => void;
  onClear: () => void;
  onStartSimulation: (route: CalculatedRoute) => void;
  plannerRef: { current: HTMLDivElement | null };
}) {
  const blocked = corridors.filter(c => c.status !== "NO_REPORTED_DISRUPTION");

  return (
    <div ref={plannerRef} className="absolute left-4 top-20 z-30 w-[min(320px,calc(100%-2rem))] max-h-[calc(100%-6rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl" onPointerDown={event => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold"><Route className="h-4 w-4 text-emerald-400" /> Road Planner</h3>
          <p className="mt-1 text-[11px] text-slate-400">Routes, road hazards and directions</p>
        </div>
        {routes.length > 0 && <button onClick={onClear} aria-label="Clear routes" className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-400">From
          <select value={start} onChange={event => onStartChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white outline-none focus:border-blue-400">
            {locations.map(location => <option key={`start-${location.name}`} value={location.name}>{location.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">To
          <select value={end} onChange={event => onEndChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white outline-none focus:border-blue-400">
            {locations.map(location => <option key={`end-${location.name}`} value={location.name}>{location.name}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={avoidBlocked} onChange={event => onAvoidChange(event.target.checked)} className="accent-emerald-500" />
        Review roads with reported hazards ({blocked.length})
      </label>
      <button disabled={loading || !start || !end || start === end} onClick={onCalculate} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
        <Navigation className="h-4 w-4" /> {loading ? "Finding best roads..." : "Show directions"}
      </button>

      {routes.length > 0 && <div className="mt-3 space-y-2">
        {routes.map((route, index) => <div key={`${route.distance}-${index}`} className={`rounded-xl border p-3 ${route.isAlternative ? "border-amber-500/40 bg-amber-500/10" : "border-blue-500/40 bg-blue-500/10"}`}>
          <div className="flex items-center justify-between text-sm font-semibold"><span>{route.isAlternative ? "Alternative route" : "Recommended route"}</span><span>{formatDistance(route.distance)}</span></div>
          <div className="mt-1 text-xs text-slate-300">{formatDuration(route.duration)} driving time · {route.hazardHits} reported hazard area{route.hazardHits === 1 ? "" : "s"} nearby</div>
          {index === 0 && route.steps.length > 0 && <div className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-300">
            {route.steps.slice(0, 5).map((step, stepIndex) => <div key={`${step.instruction}-${stepIndex}`} className="flex gap-2 py-1"><span className="w-5 shrink-0 text-center font-bold text-slate-500">{stepIndex + 1}</span><span>{step.instruction} <em className="text-slate-500">({formatDistance(step.distance)})</em></span></div>)}
            {route.steps.length > 5 && <div className="pt-1 text-slate-500">+ {route.steps.length - 5} more directions</div>}
          </div>}
          
          {index === 0 && (
            <button 
              onClick={() => onStartSimulation(route)}
              className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
            >
              <Car className="w-4 h-4" /> Start Evacuation Simulation
            </button>
          )}
        </div>)}
      </div>}
    </div>
  );
}

// A component to handle map resetting
function MapController({ resetKey, center, zoom }: { resetKey: number; center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (resetKey > 0) {
      map.setView(center, zoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, map, center[0], center[1], zoom]);
  return null;
}

export default function Map({ filters, onStatsUpdate, resetKey = 0, isCitizenAppOpen, onToggleCitizenApp }: MapProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nerGeoData, setNerGeoData] = useState<any>(null);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [corridorAlternates, setCorridorAlternates] = useState<Record<string, [number, number][]>>({});
  const [evacRoutes, setEvacRoutes] = useState<Record<string, [number, number][]>>({});
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [emergencyAssets, setEmergencyAssets] = useState<EmergencyAsset[]>([]);
  const [routeLocations, setRouteLocations] = useState<RouteLocation[]>([]);
  const [routes, setRoutes] = useState<CalculatedRoute[]>([]);
  const [routeStart, setRouteStart] = useState("");
  const [routeEnd, setRouteEnd] = useState("");
  const [avoidBlocked, setAvoidBlocked] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [isPredictionOpen, setIsPredictionOpen] = useState(false);
  const plannerRef = useRef<HTMLDivElement>(null);
  const [timeOffset, setTimeOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulatingRoute, setSimulatingRoute] = useState<CalculatedRoute | null>(null);
  const [simProgress, setSimProgress] = useState(0);

  // Handle auto-play for time slider
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeOffset((prev) => {
          if (prev >= 72) {
            setIsPlaying(false);
            return 72;
          }
          return prev + 12;
        });
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Handle evacuation simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (simulatingRoute) {
      interval = setInterval(() => {
        setSimProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 0.3; // Speed of simulation
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [simulatingRoute]);

  useEffect(() => {
    const closePlannerOnOutsideClick = (event: PointerEvent) => {
      if (plannerRef.current && !plannerRef.current.contains(event.target as Node)) {
        setIsPlannerOpen(false);
      }
    };
    document.addEventListener("pointerdown", closePlannerOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closePlannerOnOutsideClick);
  }, []);

  useEffect(() => {
    // Fix Leaflet icon issue in Next.js
    delete (window.L.Icon.Default.prototype as any)._getIconUrl;
    window.L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setError(null);
        if (!nerGeoData) {
          fetch("/ner_boundary.geojson")
            .then(res => res.json())
            .then(data => setNerGeoData(data))
            .catch(e => console.error("Could not load NER GeoJSON", e));
        }

        const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
        
        // Fetch Alerts
        const isLive = filters?.isLiveMode ?? true;
        const monthStr = filters?.simMonth ? `&month=${filters.simMonth}` : '';
        const url = apiBase ? `${apiBase}/alerts?use_live=${isLive}${monthStr}` : `/api/alerts?use_live=${isLive}${monthStr}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setAlerts(data);
          const locations = data.map((item: Alert) => ({ name: item.name, lat: item.lat, lon: item.lon }));
          setRouteLocations(locations);
          setRouteStart((current: string) => current || locations[0]?.name || "");
          setRouteEnd((current: string) => current || locations[1]?.name || "");
        } else {
          setError(`Backend Error: ${res.status}`);
        }

        // Fetch Corridors
        const corrRes = await fetch(apiBase ? `${apiBase}/connectivity-impact` : `/api/connectivity-impact`);
        if (corrRes.ok) {
          const corrData = await corrRes.json();
          setCorridors(corrData.corridors || []);
        }

        const assetsRes = await fetch(apiBase ? `${apiBase}/emergency-assets` : "/api/emergency-assets");
        if (assetsRes.ok) {
          const assetsData = await assetsRes.json();
          setEmergencyAssets(assetsData.assets || []);
        }

        // Fetch Reports
        const repRes = await fetch(apiBase ? `${apiBase}/reports` : `/api/reports`);
        if (repRes.ok) {
          const repData = await repRes.json();
          setReports(repData || []);
        }

      } catch (err: any) {
        console.error("Map failed to fetch alerts", err);
        setError("Cannot connect to backend API. Is the FastAPI server running?");
      } finally {
        setLoading(false);
      }
    };
    
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [filters?.isLiveMode, filters?.simMonth]); // Refetch when mode changes

  // Auto-calculate alternate routes for disrupted corridors
  useEffect(() => {
    const fetchAlternates = async () => {
      const disrupted = corridors.filter(c => c.status !== 'NO_REPORTED_DISRUPTION' && c.points.length > 1);
      
      const newAlternates: Record<string, [number, number][]> = {};
      
      for (const corridor of disrupted) {
        if (corridorAlternates[corridor.id]) {
          newAlternates[corridor.id] = corridorAlternates[corridor.id];
          continue;
        }
        
        try {
          const start = corridor.points[0];
          const end = corridor.points[corridor.points.length - 1];
          const query = `${start[1]},${start[0]};${end[1]},${end[0]}`;
          
          const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${query}?overview=full&geometries=geojson&alternatives=true`);
          if (response.ok) {
            const payload = await response.json();
            if (payload.code === "Ok" && payload.routes?.length > 0) {
              // Try to pick the alternative route (index 1), if not fallback to primary
              const routeToUse = payload.routes.length > 1 ? payload.routes[1] : payload.routes[0];
              const coords = routeToUse.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]);
              newAlternates[corridor.id] = coords;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch alternate for corridor ${corridor.id}`, error);
        }
      }
      
      setCorridorAlternates(prev => ({ ...prev, ...newAlternates }));
    };

    if (corridors.length > 0) {
      fetchAlternates();
    }
  }, [corridors]);

  // Auto-calculate evacuation routes for HIGH risk cities
  useEffect(() => {
    const fetchEvacRoutes = async () => {
      if (!filters?.showEvacRoutes) return;
      
      const highRiskCities = alerts.filter(a => a.level === "HIGH");
      const safeZones = emergencyAssets.filter(a => a.type === "hospital" || a.type === "rescue_base");
      
      if (highRiskCities.length === 0 || safeZones.length === 0) return;
      
      const newEvacRoutes: Record<string, [number, number][]> = {};
      
      for (const city of highRiskCities) {
        if (evacRoutes[city.name]) {
          newEvacRoutes[city.name] = evacRoutes[city.name];
          continue;
        }
        
        // Find nearest safe zone
        let nearest = safeZones[0];
        let minDist = Infinity;
        for (const zone of safeZones) {
          const dist = distanceBetweenPoints([city.lat, city.lon], [zone.lat, zone.lon]);
          if (dist < minDist) {
            minDist = dist;
            nearest = zone;
          }
        }
        
        try {
          const query = `${city.lon},${city.lat};${nearest.lon},${nearest.lat}`;
          const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${query}?overview=full&geometries=geojson`);
          if (response.ok) {
            const payload = await response.json();
            if (payload.code === "Ok" && payload.routes?.length > 0) {
              const coords = payload.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]);
              newEvacRoutes[city.name] = coords;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch evac route for ${city.name}`, error);
        }
      }
      
      setEvacRoutes(prev => ({ ...prev, ...newEvacRoutes }));
    };

    fetchEvacRoutes();
  }, [alerts, emergencyAssets, filters?.showEvacRoutes]);

  const calculateRoute = async () => {
    const origin = routeLocations.find(location => location.name === routeStart);
    const destination = routeLocations.find(location => location.name === routeEnd);
    if (!origin || !destination || origin.name === destination.name) return;

    setRouteLoading(true);
    setRouteError("");
    try {
      const query = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${query}?overview=full&geometries=geojson&steps=true&alternatives=true`);
      if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
      const payload = await response.json();
      if (payload.code !== "Ok" || !payload.routes?.length) throw new Error("No drivable road found between these locations.");

      const calculated: CalculatedRoute[] = payload.routes.slice(0, 2).map((item: { geometry: { coordinates: [number, number][] }; distance: number; duration: number; legs: { steps: { maneuver: { type: string; modifier?: string }; distance: number; name?: string }[] }[] }) => {
        const coordinates = item.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
        return {
        coordinates,
        distance: item.distance,
        duration: item.duration,
        hazardHits: routeHazardCount(coordinates, corridors),
        isAlternative: false,
        steps: item.legs.flatMap(leg => leg.steps).map(step => ({
          instruction: `${step.maneuver.type === "depart" ? "Start" : step.maneuver.type === "arrive" ? "Arrive" : `${step.maneuver.type}${step.maneuver.modifier ? ` ${step.maneuver.modifier}` : ""}`} ${step.name || "onto the mapped road"}`,
          distance: step.distance,
          name: step.name || "",
        })),
        };
      });
      if (avoidBlocked) calculated.sort((first: CalculatedRoute, second: CalculatedRoute) => first.hazardHits - second.hazardHits || first.distance - second.distance);
      setRoutes(calculated.map((route: CalculatedRoute, index: number) => ({ ...route, isAlternative: index > 0 })));
    } catch (error) {
      console.error("Route calculation failed", error);
      setRoutes([]);
      setRouteError("Live road routing is temporarily unavailable. Check the map connection and try again.");
    } finally {
      setRouteLoading(false);
    }
  };

  // Filter alerts by state and apply Time-Travel Prediction Logic
  const visibleAlerts = alerts
    .filter(a => !filters?.state || filters.state === "ALL" || a.state === filters.state)
    .map(a => {
      if (timeOffset === 0) return a;
      
      // Simulate future risk based on rainfall prediction
      const rainDelta = a.pred_24h ? (a.pred_24h - a.rainfall_mm) : 0;
      let riskDelta = 0;
      if (rainDelta > 50) riskDelta = 15;
      else if (rainDelta > 10) riskDelta = 5;
      else if (rainDelta < 0) riskDelta = -10;
      else riskDelta = 2; // general slight increase over time if monsoon sim is active

      // Scale risk Delta based on hours
      const simulatedRisk = Math.max(0, Math.min(99.9, a.risk + (riskDelta * (timeOffset / 24))));
      
      // Update risk level threshold dynamically
      let newLevel = "LOW";
      if (simulatedRisk >= 75) newLevel = "HIGH";
      else if (simulatedRisk >= 40) newLevel = "MEDIUM";

      return {
        ...a,
        risk: simulatedRisk,
        level: newLevel,
        main_reason: timeOffset > 0 && newLevel === "HIGH" ? `Predicted heavy rainfall (${(a.pred_24h || 120).toFixed(0)}mm) causing soil failure` : a.main_reason
      };
    });

  // Update Sidebar stats
  useEffect(() => {
    if (onStatsUpdate) {
      onStatsUpdate({
        total: visibleAlerts.length,
        highRisk: visibleAlerts.filter(a => a.level === "HIGH").length,
        mlInputs: 6
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, filters?.state, onStatsUpdate]);

  const getMarkerColor = (level: string) => {
    if (level === "HIGH") return "#ef4444";
    if (level === "MEDIUM") return "#f97316";
    return "#10b981";
  };

  const getCorridorColor = (status: string) => {
    if (status === 'CONFIRMED_BLOCKED') return '#ef4444';
    if (status === 'CONFIRMED_HAZARD_NEARBY') return '#f97316';
    if (status === 'UNVERIFIED_INCIDENT_NEARBY') return '#ec4899';
    return '#64748b';
  };

  const getAssetColor = (type: string) => {
    if (type === "hospital") return "#22d3ee";
    if (type === "police" || type === "emergency_coordination") return "#a78bfa";
    if (type === "rescue_base") return "#f97316";
    return "#34d399";
  };

  const visibleEmergencyAssets = emergencyAssets.filter(asset => {
    const search = filters?.assetSearch?.trim().toLowerCase() || "";
    const matchesSearch = !search || asset.name.toLowerCase().includes(search) || asset.type.toLowerCase().includes(search);
    const matchesType = !filters?.assetType || filters.assetType === "ALL" || asset.type === filters.assetType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-3xl overflow-hidden">
      <MapContainer 
        center={[25.7, 93.5]} 
        zoom={7} 
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <MapController resetKey={resetKey} center={[25.7, 93.5]} zoom={7} />
        <RouteViewport route={routes} />
        
        <LayersControl position="topleft">
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
          <LayersControl.BaseLayer name="🌙 Dark Map (Minimal)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {routes.map((route, index) => (
          <Polyline
            key={`route-${index}`}
            positions={route.coordinates}
            pathOptions={{ color: route.isAlternative ? "#f59e0b" : "#2563eb", weight: route.isAlternative ? 5 : 7, opacity: 0.9, dashArray: route.isAlternative ? "10, 8" : undefined }}
          >
            <Popup>
              <div className="text-sm text-slate-100">
                <strong className="text-white">{route.isAlternative ? "Alternative road route" : "Recommended road route"}</strong>
                <p>{formatDistance(route.distance)} · {formatDuration(route.duration)}</p>
                <p className="text-slate-300">Directions are based on the current open road graph and must be verified locally.</p>
              </div>
            </Popup>
          </Polyline>
        ))}

        {/* NER Boundary GeoJSON */}
        {nerGeoData && (
          <GeoJSON 
            data={nerGeoData} 
            style={() => ({
              color: '#0ea5e9',
              weight: 3,
              opacity: 0.8,
              fillColor: '#000000',
              fillOpacity: 0.05,
              dashArray: '10, 10'
            })} 
          />
        )}

        {/* Rainfall Heatmap Mock (using Circles) */}
        {filters?.showHeatmap && (
          <LayerGroup>
            {visibleAlerts.map((alert, idx) => (
              <Circle
                key={`heat-outer-${idx}`}
                center={[alert.lat, alert.lon]}
                radius={45000}
                pathOptions={{
                  fillColor: alert.level === "HIGH" ? "#ef4444" : alert.level === "MEDIUM" ? "#f97316" : "#10b981",
                  fillOpacity: 0.15,
                  stroke: false,
                }}
              />
            ))}
            {visibleAlerts.map((alert, idx) => (
              <Circle
                key={`heat-inner-${idx}`}
                center={[alert.lat, alert.lon]}
                radius={15000}
                pathOptions={{
                  fillColor: alert.level === "HIGH" ? "#ef4444" : alert.level === "MEDIUM" ? "#f97316" : "#10b981",
                  fillOpacity: 0.35,
                  stroke: false,
                }}
              />
            ))}
          </LayerGroup>
        )}

        {/* Connectivity Corridors */}
        {filters?.showConnectivity && corridors.map((corridor, idx) => {
          const color = getCorridorColor(corridor.status);
          const points = corridor.points as [number, number][];
          const altRoute = corridorAlternates[corridor.id];
          const isDisrupted = corridor.status !== 'NO_REPORTED_DISRUPTION';
          
          return (
            <div key={`corr-wrapper-${idx}`}>
              {/* Background Outline for clarity */}
              <Polyline
                positions={points}
                pathOptions={{
                  color: '#000000',
                  weight: isDisrupted ? 10 : 7,
                  opacity: 0.6
                }}
              />
              {/* Main Corridor Line */}
              <Polyline
                positions={points}
                pathOptions={{
                  color,
                  weight: isDisrupted ? 6 : 4,
                  dashArray: isDisrupted ? undefined : '8, 7',
                  opacity: 0.95
                }}
              >
                <Popup>
                  <div className="font-sans text-sm text-slate-100">
                    <h4 className="font-bold text-white">{corridor.name}</h4>
                    <p>Status: <strong className="text-slate-200">{corridor.status}</strong></p>
                    <p>Priority Score: {corridor.priority_score}</p>
                    {corridor.highway_ref && <p>Road: {corridor.highway_ref}</p>}
                    {corridor.action && <p className="mt-1 text-amber-200">{corridor.action}</p>}
                    {corridor.alternate_route && <p className="mt-1 text-emerald-200">{corridor.alternate_route}</p>}
                  </div>
                </Popup>
              </Polyline>

              {/* Auto-calculated Alternate Route */}
              {isDisrupted && altRoute && (
                <Polyline
                  positions={altRoute}
                  pathOptions={{
                    color: '#34d399', // Emerald green
                    weight: 5,
                    dashArray: '10, 10',
                    opacity: 0.9
                  }}
                >
                  <Popup>
                    <div className="font-sans text-sm text-slate-100">
                      <h4 className="font-bold text-emerald-400">Live Alternate Route</h4>
                      <p>Bypassing: {corridor.name}</p>
                      <p className="text-xs text-slate-300 mt-1">Generated via OSRM in response to corridor disruption.</p>
                    </div>
                  </Popup>
                </Polyline>
              )}
            </div>
          )
        })}

        {/* Auto-Evacuation Routes */}
        {filters?.showEvacRoutes && Object.entries(evacRoutes).map(([cityName, coords], idx) => (
          <div key={`evac-wrapper-${idx}`}>
            <Polyline
              positions={coords}
              pathOptions={{
                color: '#3b82f6', // Blue
                weight: 6,
                opacity: 0.85,
                dashArray: '12, 10' // Dashed line to differentiate from normal routes
              }}
            >
              <Popup>
                <div className="font-sans text-sm text-slate-100">
                  <h4 className="font-bold text-blue-400">🚨 Emergency Evacuation Route</h4>
                  <p>From: <strong>{cityName}</strong> (HIGH RISK)</p>
                  <p className="text-xs text-slate-300 mt-1">Auto-routed via OSRM to the nearest Hospital or Rescue Base.</p>
                </div>
              </Popup>
            </Polyline>
          </div>
        ))}

        {/* EVACUATION SIMULATION TRAIL & VEHICLE */}
        {simulatingRoute && (
          <>
            <Polyline
              positions={simulatingRoute.coordinates.slice(0, Math.floor((simProgress / 100) * (simulatingRoute.coordinates.length - 1)) + 1)}
              pathOptions={{ color: '#10b981', weight: 6, opacity: 1, dashArray: '10, 10', dashOffset: '0' }}
            />
            <CircleMarker
              center={getInterpolatedCoordinate(simulatingRoute.coordinates, simProgress)}
              radius={8}
              pathOptions={{ color: '#ffffff', fillColor: '#10b981', fillOpacity: 1, weight: 3 }}
            >
              <Popup autoPan={false}>Evacuation Convoy<br/>Progress: {Math.round(simProgress)}%</Popup>
            </CircleMarker>
            
            {/* Blinking Halo for the car */}
            <CircleMarker
              center={getInterpolatedCoordinate(simulatingRoute.coordinates, simProgress)}
              radius={18}
              pathOptions={{ color: '#10b981', fillColor: 'transparent', weight: 2, className: 'animate-ping' }}
            />
          </>
        )}

        {filters?.showEmergencyAssets && visibleEmergencyAssets.map((asset, idx) => (
          <CircleMarker
            key={`asset-${asset.type}-${idx}`}
            center={[asset.lat, asset.lon]}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: getAssetColor(asset.type), fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="text-sm text-slate-100">
                <h4 className="font-bold text-white">{asset.name}</h4>
                <p className="capitalize">Category: {asset.type.replaceAll("_", " ")}</p>
                <p>Coordinates: {asset.lat.toFixed(5)}, {asset.lon.toFixed(5)}</p>
                <p className="text-amber-200">{asset.location_accuracy.replaceAll("_", " ")}; verify before emergency deployment.</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Unverified Citizen Reports */}
        {filters?.showCitizenReports && reports.filter(r => r.verification_status === 'UNVERIFIED').map((report, idx) => (
          <CircleMarker
            key={`rep-${idx}`}
            center={[report.lat, report.lon]}
            radius={8}
            pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>
              <div className="text-slate-100 text-sm">
                <strong className="text-white">⚠️ Citizen Report</strong><br/>
                {report.description}<br/>
                Severity: {report.severity}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Primary Alert Markers */}
        {visibleAlerts.map((alert, idx) => (
          <CircleMarker
            key={`alert-${idx}`}
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
                  
                  <div className="col-span-2 border-b border-slate-700 pb-1 mb-1 mt-2 font-bold text-slate-300">Impact & Sensors</div>
                  <div><span className="text-slate-400">Roads:</span> <span className={alert.road_status === 'CLOSED' ? 'text-red-400' : 'text-emerald-400'}>{alert.road_status}</span></div>
                  <div><span className="text-slate-400">Villages:</span> {alert.affected_villages || 0} at risk</div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {error && (
        <div className="absolute top-6 left-6 z-20 max-w-sm pointer-events-none">
          <div className="bg-red-950/90 border border-red-500/50 p-4 rounded-xl shadow-2xl backdrop-blur-md">
            <h3 className="text-white font-bold">Backend Disconnected</h3>
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        </div>
      )}
      
      {loading && !error && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="bg-slate-800 p-6 rounded-xl shadow-xl flex flex-col items-center border border-slate-700">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white font-medium">Loading Live Data...</p>
          </div>
        </div>
      )}

      {isPlannerOpen && (
        <RoutePlanner
          locations={routeLocations}
          corridors={corridors}
          routes={routes}
          start={routeStart}
          end={routeEnd}
          avoidBlocked={avoidBlocked}
          loading={routeLoading}
          onStartChange={setRouteStart}
          onEndChange={setRouteEnd}
          onAvoidChange={setAvoidBlocked}
          onCalculate={calculateRoute}
          onClear={() => { setRoutes([]); setRouteError(""); setSimulatingRoute(null); }}
          onStartSimulation={(route) => {
            setSimulatingRoute(route);
            setSimProgress(0);
            setIsPlannerOpen(false); // Hide planner to focus on simulation
          }}
          plannerRef={plannerRef}
        />
      )}
      {routeError && <div className="absolute bottom-4 left-4 z-40 mb-1 w-[min(390px,calc(100%-2rem))] translate-y-full rounded-xl border border-red-500/50 bg-red-950/95 p-3 text-xs text-red-100 shadow-xl">{routeError}</div>}

      {/* EVACUATION SIMULATION HUD */}
      {simulatingRoute && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[500] w-full max-w-sm px-4 pointer-events-none">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-emerald-500/50 rounded-2xl p-4 shadow-[0_20px_50px_rgba(16,185,129,0.3)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-white font-bold text-xs tracking-widest uppercase">Convoy Status</h4>
                  <p className="text-emerald-400 text-[10px] font-bold">En Route to Safe Zone</p>
                </div>
              </div>
              <button 
                onClick={() => setSimulatingRoute(null)} 
                className="pointer-events-auto bg-slate-800 hover:bg-red-500 hover:text-white text-slate-400 p-1.5 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-700">
              <div 
                className="bg-emerald-500 h-full transition-all duration-75 relative"
                style={{ width: `${simProgress}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[stripes_1s_linear_infinite]"></div>
              </div>
            </div>
            
            <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400">
              <span>{Math.round(simProgress)}% Complete</span>
              <span>{formatDistance(simulatingRoute.distance * (1 - simProgress / 100))} remaining</span>
            </div>
          </div>
        </div>
      )}

      {/* PREMIUM TIME-TRAVEL SLIDER (AI FORECAST HUD) - COMPACT */}
      {isPredictionOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[400] w-full max-w-lg px-4 pointer-events-auto transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
          <div className={`relative overflow-hidden backdrop-blur-2xl rounded-2xl border p-3.5 shadow-2xl transition-all duration-500 ${
            isPlaying ? "bg-slate-950/90 border-cyan-500/50 shadow-cyan-500/20" : "bg-slate-900/80 border-slate-700/50"
          }`}>
          
          {/* Animated Tech Background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div className={`absolute inset-0 bg-[linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(0deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:16px_16px] transition-opacity duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}></div>
            {isPlaying && (
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50 animate-[scan_2s_ease-in-out_infinite]"></div>
            )}
          </div>

          <div className="relative z-10 flex flex-col gap-3">
            {/* Top Bar: Title & Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-sm transition-all duration-500 ${isPlaying ? "border-cyan-500 bg-cyan-500/20 text-cyan-400 shadow-cyan-500/40 animate-pulse" : "border-slate-700 bg-slate-800 text-slate-400"}`}>
                  <Clock className={`w-4 h-4 ${isPlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />
                </div>
                <div>
                  <h4 className="font-black text-[11px] tracking-widest uppercase bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">AI Predictive Engine</h4>
                  <p className={`text-[9px] font-bold tracking-wider uppercase transition-colors ${isPlaying ? "text-cyan-400" : "text-slate-500"}`}>
                    {isPlaying ? "Simulating Future Weather..." : "System Idle - Awaiting Input"}
                  </p>
                </div>
              </div>
              
              <div className={`px-3 py-1 rounded-full border text-[10px] font-black tracking-widest uppercase shadow-inner transition-all duration-500 flex items-center gap-1.5 ${
                timeOffset === 0 
                  ? "bg-slate-800 border-slate-700 text-slate-300" 
                  : timeOffset >= 48 
                    ? "bg-red-950/80 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.3)]" 
                    : "bg-cyan-950/80 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              }`}>
                {timeOffset === 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                {timeOffset === 0 ? "LIVE MAP" : `+${timeOffset} HOURS`}
              </div>
            </div>

            {/* Slider Control Area */}
            <div className="flex items-center gap-4 bg-black/40 p-2.5 rounded-xl border border-white/5 relative">
              {/* Play/Pause Button */}
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 relative group ${
                  isPlaying ? "bg-cyan-600 text-white shadow-[0_0_15px_rgba(8,145,178,0.6)]" : "bg-slate-700 text-white hover:bg-slate-600 hover:shadow-md"
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                {isPlaying && (
                  <div className="absolute inset-[-3px] rounded-full border border-cyan-400/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                )}
              </button>
              
              {/* Custom Timeline Slider */}
              <div className="flex-1 relative group py-1">
                <input 
                  type="range" 
                  min="0" 
                  max="72" 
                  step="12"
                  value={timeOffset} 
                  onChange={(e) => {
                    setTimeOffset(parseInt(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-800 outline-none transition-all relative z-20 
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.8)]
                    [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-cyan-500 [&::-webkit-slider-thumb]:transition-transform
                    [&::-webkit-slider-thumb]:hover:scale-125
                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-cyan-500 [&::-moz-range-thumb]:rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${timeOffset >= 48 ? '#ef4444' : '#06b6d4'} ${(timeOffset/72)*100}%, #1e293b ${(timeOffset/72)*100}%)`
                  }}
                />
                
                {/* Tick Marks & Labels */}
                <div className="flex justify-between text-[8px] font-black tracking-widest text-slate-500 mt-2 absolute w-full left-0">
                  {['NOW', '12H', '24H', '36H', '48H', '60H', '72H'].map((label, idx) => (
                    <div key={label} className="flex flex-col items-center gap-0.5">
                      <div className={`w-1 h-1 rounded-full ${timeOffset >= idx * 12 ? (timeOffset >= 48 ? 'bg-red-500' : 'bg-cyan-500') : 'bg-slate-700'}`}></div>
                      <span className={timeOffset === idx * 12 ? 'text-white scale-110 transition-transform' : ''}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* UNIFIED APP DOCK */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto">
        <div className="flex items-center gap-2 p-2 bg-slate-950/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl">
          <button 
            onClick={() => setIsPlannerOpen(!isPlannerOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-semibold text-sm ${isPlannerOpen ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Route className="w-4 h-4" /> Road Planner
          </button>
          
          <div className="w-px h-6 bg-slate-800"></div>
          
          <button 
            onClick={() => setIsPredictionOpen(!isPredictionOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-semibold text-sm ${isPredictionOpen ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(8,145,178,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Sparkles className="w-4 h-4" /> AI Prediction
          </button>
          
          <div className="w-px h-6 bg-slate-800"></div>
          
          <button 
            onClick={onToggleCitizenApp}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-semibold text-sm ${isCitizenAppOpen ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Camera className="w-4 h-4" /> Citizen App
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { 
  AlertTriangle, Info, MapPin, Activity, X, 
  Satellite, Droplets, Mountain, History, 
  Radio, Users, Car, Building2, Wind, Target
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  const sortAlerts = (items: Alert[]) =>
    [...items].sort((a: Alert, b: Alert) => {
      if (b.risk !== a.risk) return b.risk - a.risk;
      return a.name.localeCompare(b.name);
    });

  const fetchAlerts = async () => {
    try {
      setError(null);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const url = apiBase ? `${apiBase}/alerts?use_live=true` : "/api/alerts?use_live=true";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const sorted = sortAlerts(data);
        setAlerts(sorted);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        setError("Backend returned an error. Is the server running?");
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
      setError("Cannot connect to backend API. Please start the FastAPI server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  const getRiskColor = (level: string) => {
    switch (level) {
      case "HIGH": return "border-red-500/50 bg-red-500/10 text-red-400";
      case "MEDIUM": return "border-orange-500/50 bg-orange-500/10 text-orange-400";
      case "LOW": return "border-emerald-500/50 bg-emerald-500/10 text-emerald-400";
      default: return "border-slate-500/50 bg-slate-500/10 text-slate-400";
    }
  };

  const getRiskGradient = (level: string) => {
    switch (level) {
      case "HIGH": return "from-red-900/50 to-slate-900";
      case "MEDIUM": return "from-orange-900/50 to-slate-900";
      case "LOW": return "from-emerald-900/50 to-slate-900";
      default: return "from-slate-800 to-slate-900";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold">Live Risk Dashboard</h2>
          <p className="text-slate-400 mt-1">Real-time ML screening across 53 NER locations. Click any card to launch Digital Twin Simulation.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 shadow-inner">
          <Activity className="w-4 h-4 text-green-400 animate-pulse" />
          Last synced: {lastUpdated || "..."}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-500/50 p-6 rounded-2xl flex items-center gap-4 shadow-lg shadow-red-900/20">
          <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />
          <div>
            <h3 className="text-red-400 font-bold text-lg">Backend Connection Failed</h3>
            <p className="text-red-200">{error}</p>
          </div>
        </div>
      )}

      {loading && !error ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-48 bg-slate-800/50 rounded-2xl animate-pulse border border-slate-700/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {alerts.map((alert, idx) => (
            <div 
              key={idx} 
              onClick={() => setSelectedAlert(alert)}
              className={`relative overflow-hidden rounded-2xl border backdrop-blur-sm p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-${alert.level === 'HIGH' ? 'red' : alert.level === 'MEDIUM' ? 'orange' : 'emerald'}-900/20 ${
                alert.level === "HIGH" ? "border-red-500/30 bg-red-950/20" : 
                alert.level === "MEDIUM" ? "border-orange-500/30 bg-orange-950/20" : 
                "border-emerald-500/30 bg-emerald-950/20"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{alert.name.split(',')[0]}</h3>
                  <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {alert.state}
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-lg text-xs font-bold border ${getRiskColor(alert.level)}`}>
                  {alert.level} RISK
                </div>
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-black">{alert.risk.toFixed(1)}%</span>
                <span className="text-sm text-slate-400">prob.</span>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Trigger Analysis</span>
                </div>
                <p className="text-sm text-slate-300 leading-tight line-clamp-2">
                  {alert.main_reason}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DIGITAL TWIN SIMULATION MODAL */}
      <AnimatePresence>
        {selectedAlert && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setSelectedAlert(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
              className={`w-full max-w-6xl max-h-[95vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col bg-gradient-to-br ${getRiskGradient(selectedAlert.level)} border border-slate-700/50`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex justify-between items-start bg-slate-950/40 backdrop-blur-md">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <Activity className={`w-6 h-6 animate-pulse ${selectedAlert.level === 'HIGH' ? 'text-red-500' : selectedAlert.level === 'MEDIUM' ? 'text-orange-500' : 'text-emerald-500'}`} />
                    <h2 className="text-3xl font-black text-white tracking-tight">{selectedAlert.name}</h2>
                    <span className={`px-4 py-1.5 rounded-full text-sm font-bold tracking-widest border ${getRiskColor(selectedAlert.level)} ml-2`}>
                      {selectedAlert.level} RISK
                    </span>
                  </div>
                  <p className="text-slate-300 flex items-center gap-2 text-sm mt-2 font-medium">
                    <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30 font-mono text-xs">DIGITAL TWIN SIMULATION</span>
                    <span>Lat: {selectedAlert.lat.toFixed(4)}, Lon: {selectedAlert.lon.toFixed(4)}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedAlert(null)}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* LEFT COLUMN: Data Factors */}
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Terrain & Soil */}
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors">
                      <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3">
                        <Mountain className="w-5 h-5 text-amber-400" />
                        <h4 className="font-bold text-slate-200 uppercase tracking-wider text-sm">Terrain & Soil</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Elevation</span>
                          <span className="text-white font-mono">{selectedAlert.elevation} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Slope</span>
                          <span className="text-white font-mono">{selectedAlert.slope}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Soil Moisture</span>
                          <span className="text-white font-mono">{selectedAlert.soil_moisture}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Saturation Status</span>
                          <span className={`text-xs px-2 py-1 rounded font-bold ${
                            selectedAlert.soil_saturation === "HIGH" ? "bg-red-500/20 text-red-400" :
                            selectedAlert.soil_saturation === "MEDIUM" ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"
                          }`}>{selectedAlert.soil_saturation}</span>
                        </div>
                      </div>
                    </div>

                    {/* Meteorological */}
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors">
                      <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3">
                        <Droplets className="w-5 h-5 text-blue-400" />
                        <h4 className="font-bold text-slate-200 uppercase tracking-wider text-sm">Meteorological</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Current 24h Rain</span>
                          <span className="text-blue-300 font-mono font-bold">{(selectedAlert.rainfall_mm || 0).toFixed(1)} mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Forecast (24h)</span>
                          <span className="text-white font-mono">{(selectedAlert.pred_24h || 0).toFixed(1)} mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">7-Day Cumulative</span>
                          <span className="text-white font-mono">{(selectedAlert.rainfall_mm * 7).toFixed(1)} mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Data Source</span>
                          <span className="text-white font-mono text-xs truncate max-w-[120px]" title={selectedAlert.rainfall_source}>Open-Meteo</span>
                        </div>
                      </div>
                    </div>

                    {/* Satellite & Sensors */}
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors">
                      <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3">
                        <Satellite className="w-5 h-5 text-purple-400" />
                        <h4 className="font-bold text-slate-200 uppercase tracking-wider text-sm">Remote Sensing</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Satellite Anomaly</span>
                          {selectedAlert.sat_detected ? (
                            <span className="text-xs px-2 py-1 rounded font-bold bg-red-500/20 text-red-400 animate-pulse">DETECTED</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded font-bold bg-slate-700/50 text-slate-400">CLEAR</span>
                          )}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Sat Confidence</span>
                          <span className="text-white font-mono">{selectedAlert.sat_confidence}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Local Sensors</span>
                          <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                            <Radio className="w-3 h-3" /> ONLINE
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Last Synced</span>
                          <span className="text-white font-mono text-xs">{selectedAlert.weather_status || "LIVE"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Infrastructure & Population */}
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-900/80 transition-colors">
                      <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3">
                        <Building2 className="w-5 h-5 text-teal-400" />
                        <h4 className="font-bold text-slate-200 uppercase tracking-wider text-sm">Impact Analysis</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm flex items-center gap-1"><Car className="w-3 h-3"/> Road Status</span>
                          <span className={`text-xs px-2 py-1 rounded font-bold ${
                            selectedAlert.road_status === "CLOSED" ? "bg-red-500/20 text-red-400" :
                            selectedAlert.road_status === "AT RISK" ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"
                          }`}>{selectedAlert.road_status}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Closure Prob.</span>
                          <span className="text-white font-mono">{selectedAlert.road_closure_prob}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm flex items-center gap-1"><Users className="w-3 h-3"/> Affected Villages</span>
                          <span className="text-white font-mono font-bold text-red-400">{selectedAlert.affected_villages || "0"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-sm">Est. Population</span>
                          <span className="text-white font-mono">~{(selectedAlert.affected_villages * 850).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Explainable AI & Predictions */}
                  <div className="flex flex-col gap-4">
                    <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 flex-1 flex flex-col justify-center items-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Target className="w-32 h-32" />
                      </div>
                      <h4 className="font-bold text-slate-200 uppercase tracking-widest text-sm mb-6 text-center z-10 w-full border-b border-slate-700/50 pb-3">
                        AI Probability Engine
                      </h4>
                      
                      <div className="relative w-40 h-40 flex items-center justify-center mb-6 z-10">
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-800" />
                          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${selectedAlert.risk * 2.827} 282.7`} className={`${selectedAlert.level === 'HIGH' ? 'text-red-500' : selectedAlert.level === 'MEDIUM' ? 'text-orange-500' : 'text-emerald-500'} transition-all duration-1000 ease-out`} />
                        </svg>
                        <div className="flex flex-col items-center">
                          <span className="text-4xl font-black text-white">{selectedAlert.risk.toFixed(0)}%</span>
                          <span className="text-xs text-slate-400 font-bold">RISK</span>
                        </div>
                      </div>

                      <div className="w-full space-y-4 z-10">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">Rainfall Factor</span>
                            <span className="text-blue-400">{selectedAlert.exp_rain}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${selectedAlert.exp_rain}%` }}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">Terrain/Slope Factor</span>
                            <span className="text-amber-400">{selectedAlert.exp_slope}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${selectedAlert.exp_slope}%` }}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">Soil Factor</span>
                            <span className="text-orange-400">{selectedAlert.exp_soil}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500" style={{ width: `${selectedAlert.exp_soil}%` }}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">Historical Events</span>
                            <span className="text-purple-400">{selectedAlert.exp_hist}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500" style={{ width: `${selectedAlert.exp_hist}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI SUMMARY BLOCK */}
                <div className="mt-6 bg-slate-950/50 rounded-2xl p-5 border border-slate-700/50 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500"></div>
                  <div className="flex gap-4">
                    <div className="mt-1 flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                        <Wind className="w-5 h-5 text-blue-400" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">AI Diagnostic Summary</h4>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        Simulation for {selectedAlert.name} indicates a <strong className={selectedAlert.level === 'HIGH' ? 'text-red-400' : 'text-orange-400'}>{selectedAlert.risk}% probability</strong> of landslide events within the next 24-72 hours. 
                        The primary trigger is <strong>{selectedAlert.main_reason.toLowerCase()}</strong> on a {selectedAlert.slope}% slope gradient. 
                        Soil saturation is currently {selectedAlert.soil_saturation} at {selectedAlert.soil_moisture}%. 
                        {selectedAlert.road_status === 'CLOSED' || selectedAlert.road_status === 'AT RISK' ? ` Critical infrastructure is threatened, with ~${selectedAlert.affected_villages} villages potentially isolated.` : ` Infrastructure remains stable for now.`}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

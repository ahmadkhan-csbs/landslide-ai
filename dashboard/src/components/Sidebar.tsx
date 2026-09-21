import { useState } from "react";
import { Map, Bell, FlaskConical, BellRing, Settings2, X, FileWarning, GitMerge, ThermometerSun, Route, Mail, Info, ShieldCheck, Hospital, Scan } from "lucide-react";
import DroneOverlay from "./DroneOverlay";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  stats: { total: number; highRisk: number; mlInputs: number };
  filters: {
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
  onFilterChange: (key: string, value: any) => void;
  onResetMap: () => void;
}

const STATES = [
  "ALL",
  "Assam",
  "Sikkim",
  "Meghalaya",
  "Arunachal Pradesh",
  "Nagaland",
  "Manipur",
  "Mizoram",
  "Tripura",
];

const MONTHS = [
  { val: "1", label: "January" },
  { val: "2", label: "February" },
  { val: "3", label: "March" },
  { val: "4", label: "April" },
  { val: "5", label: "May" },
  { val: "6", label: "June" },
  { val: "7", label: "July" },
  { val: "8", label: "August" },
  { val: "9", label: "September" },
  { val: "10", label: "October" },
  { val: "11", label: "November" },
  { val: "12", label: "December" },
];

export default function Sidebar({ isOpen, onClose, stats, filters, onFilterChange, onResetMap }: SidebarProps) {
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [broadcastStatus, setBroadcastStatus] = useState("Initiating broadcast protocol...");
  
  const [showDroneOverlay, setShowDroneOverlay] = useState(false);

  const handleBroadcast = () => {
    setShowBroadcastModal(true);
    setBroadcastProgress(0);
    setBroadcastStatus("Connecting to telecom gateways...");
    
    setTimeout(() => { setBroadcastProgress(25); setBroadcastStatus("Targeting High-Risk zones..."); }, 1000);
    setTimeout(() => { setBroadcastProgress(50); setBroadcastStatus("Dispatching WhatsApp Alerts..."); }, 2000);
    setTimeout(() => { setBroadcastProgress(75); setBroadcastStatus("Dispatching SMS fallbacks..."); }, 3000);
    setTimeout(() => { setBroadcastProgress(100); setBroadcastStatus("Broadcast Complete!"); }, 4000);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute top-0 right-0 h-full w-[380px] bg-slate-900/95 backdrop-blur-xl border-l border-slate-700 shadow-2xl flex flex-col z-40 transform transition-transform animate-in slide-in-from-right overflow-hidden pointer-events-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {filters.isLiveMode ? <Bell className="w-5 h-5 text-blue-400" /> : <FlaskConical className="w-5 h-5 text-purple-400" />}
            Risk Screening
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 hide-scrollbar">
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-white">{stats.total}</div>
              <div className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mt-1">Cities</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 border border-red-900/50 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-red-500/10" />
              <div className="text-2xl font-bold text-red-500 relative">{stats.highRisk}</div>
              <div className="text-[10px] uppercase text-red-400 font-semibold tracking-wider mt-1 relative">High Risk</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-emerald-400">{stats.mlInputs}</div>
              <div className="text-[10px] uppercase text-emerald-500 font-semibold tracking-wider mt-1">ML Inputs</div>
            </div>
          </div>

          {/* State Filters */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Region Select</h3>
            <div className="flex flex-wrap gap-2">
              {STATES.map((state) => (
                <button
                  key={state}
                  onClick={() => onFilterChange("state", state)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    filters.state === state
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                  }`}
                >
                  {state === "ALL" ? "All (53)" : state}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Toggles */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operation Mode</h3>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onFilterChange("isLiveMode", true)}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  filters.isLiveMode 
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50" 
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                }`}
              >
                <BellRing className={`w-6 h-6 ${filters.isLiveMode ? "animate-pulse" : ""}`} />
                <span className="font-bold text-sm">LIVE DATA</span>
              </button>

              <button
                onClick={() => onFilterChange("isLiveMode", false)}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  !filters.isLiveMode 
                    ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50" 
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                }`}
              >
                <FlaskConical className="w-6 h-6" />
                <span className="font-bold text-sm">MONSOON SIM</span>
              </button>
            </div>

            {!filters.isLiveMode && (
              <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                <label className="text-xs text-slate-400 mb-1 block">Simulation Month</label>
                <select
                  value={filters.simMonth}
                  onChange={(e) => onFilterChange("simMonth", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                >
                  {MONTHS.map(m => (
                    <option key={m.val} value={m.val}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4 border-t border-slate-700">
            <button onClick={onResetMap} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-sm font-semibold transition-colors flex justify-center items-center gap-2">
              <Map className="w-4 h-4" /> Reset Map View
            </button>
            <button onClick={() => setShowDroneOverlay(true)} className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-green-900/50 transition-colors flex justify-center items-center gap-2">
              <Scan className="w-4 h-4" /> Launch AI Drone Scan
            </button>
            <button onClick={handleBroadcast} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-900/50 transition-colors flex justify-center items-center gap-2">
              <Mail className="w-4 h-4" /> Broadcast SMS/WhatsApp
            </button>
            <button
              onClick={() => { window.location.href = "/admin"; }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-semibold transition-colors flex justify-center items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" /> Admin Portal
            </button>
          </div>

          {/* Map Layers */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Map Layers & Overlays
            </h3>
            
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={filters.showCitizenReports} onChange={(e) => onFilterChange("showCitizenReports", e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800" />
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <FileWarning className="w-4 h-4 text-orange-400" />
                  Unverified citizen reports
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={filters.showConnectivity} onChange={(e) => onFilterChange("showConnectivity", e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800" />
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <GitMerge className="w-4 h-4 text-pink-500" />
                  Connectivity corridors
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={filters.showHeatmap} onChange={(e) => onFilterChange("showHeatmap", e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800" />
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <ThermometerSun className="w-4 h-4 text-red-500" />
                  Rainfall Heatmap
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={filters.showEvacRoutes} onChange={(e) => onFilterChange("showEvacRoutes", e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800" />
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <Route className="w-4 h-4 text-emerald-400" />
                  Safe Evacuation Routes
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={filters.showEmergencyAssets} onChange={(e) => onFilterChange("showEmergencyAssets", e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800" />
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <Hospital className="w-4 h-4 text-cyan-400" />
                  Emergency assets &amp; facilities
                </div>
              </label>
            </div>

            {filters.showEmergencyAssets && (
              <div className="space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <label className="block text-xs font-semibold text-cyan-200">Find facility
                  <input
                    value={filters.assetSearch}
                    onChange={(e) => onFilterChange("assetSearch", e.target.value)}
                    placeholder="Hospital, police, shelter..."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </label>
                <label className="block text-xs font-semibold text-cyan-200">Facility category
                  <select value={filters.assetType} onChange={(e) => onFilterChange("assetType", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400">
                    <option value="ALL">All facilities</option>
                    <option value="hospital">Hospitals</option>
                    <option value="police">Police HQ</option>
                    <option value="rescue_base">NDRF / SDRF bases</option>
                    <option value="shelter">Shelters</option>
                    <option value="emergency_coordination">Emergency coordination</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Disclaimers */}
          <div className="pt-4 border-t border-slate-700 flex items-start gap-3 bg-slate-800/30 p-4 rounded-xl">
            <Info className="w-8 h-8 text-slate-500 flex-shrink-0" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Experimental screening data. Not an official warning. Corridors and evacuation routes are for demonstration purposes only. For real emergencies, dial 112.
            </p>
          </div>

        </div>
      </div>

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl p-8 max-w-md w-full shadow-2xl shadow-indigo-900/20">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-8 h-8 text-indigo-400" />
              <h2 className="text-2xl font-bold text-white">Emergency Broadcast</h2>
            </div>
            
            <p className="text-slate-300 text-sm mb-6">
              Simulating mass SMS & WhatsApp alert dispatch to {stats.highRisk * 125000}+ citizens in High-Risk zones.
            </p>

            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-400">
                <span>{broadcastStatus}</span>
                <span>{broadcastProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-1000 ease-in-out relative"
                  style={{ width: `${broadcastProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>

            {broadcastProgress === 100 ? (
              <button 
                onClick={() => setShowBroadcastModal(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg"
              >
                Close Dashboard
              </button>
            ) : (
              <button 
                disabled
                className="w-full py-3 bg-slate-800 text-slate-500 rounded-xl font-bold cursor-not-allowed"
              >
                Broadcasting...
              </button>
            )}
          </div>
        </div>
      )}

      {showDroneOverlay && <DroneOverlay onClose={() => setShowDroneOverlay(false)} />}
    </>
  );
}

"use client";
import { useState, useEffect } from "react";
import { Crosshair, Scan, Video, Wifi, Battery, AlertTriangle, X, Target, Navigation, Loader2 } from "lucide-react";

interface DroneOverlayProps {
  onClose: () => void;
}

export default function DroneOverlay({ onClose }: DroneOverlayProps) {
  const [scanProgress, setScanProgress] = useState(0);
  const [targetLocked, setTargetLocked] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [targetData, setTargetData] = useState<any>(null);

  useEffect(() => {
    // 1. Fetch Real Data First
    const fetchTarget = async () => {
      try {
        const res = await fetch('/api/alerts?use_live=true');
        if (res.ok) {
          const data = await res.json();
          // Find the location with the highest risk
          const highestRisk = data.sort((a: any, b: any) => b.risk - a.risk)[0];
          setTargetData(highestRisk);
          startSimulation(highestRisk);
        } else {
          // Fallback if API fails
          const fallback = { name: "Mangan", lat: 27.516, lon: 88.533, risk: 89, main_reason: "Heavy rainfall over 150mm" };
          setTargetData(fallback);
          startSimulation(fallback);
        }
      } catch (err) {
        const fallback = { name: "Mangan", lat: 27.516, lon: 88.533, risk: 89, main_reason: "Heavy rainfall over 150mm" };
        setTargetData(fallback);
        startSimulation(fallback);
      }
    };

    fetchTarget();
  }, []);

    const startSimulation = (data: any) => {
    // Simulated Satellite Scan Sequence
    const sequence = [
      { time: 500, log: "Connecting to ESA Sentinel-2 API..." },
      { time: 1500, log: `Fetching multispectral imagery for Sector: ${data.name.toUpperCase()}` },
      { time: 2500, log: `Processing NDVI (Normalized Difference Vegetation Index)...` },
      { time: 3500, log: "Calculating tree cover loss on steep slopes (>35°)..." },
      { time: 4500, log: "Applying U-Net model to identify deforestation hotspots..." },
    ];

    sequence.forEach((s) => {
      setTimeout(() => setLogs((prev) => [...prev, s.log]), s.time);
    });

    const progressInterval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTargetLocked(true);
          setLogs((logs) => [...logs, `CRITICAL: 84% Deforestation detected in last 6 months. Landslide vulnerability increased by 3.2x!`]);
          return 100;
        }
        return prev + 5;
      });
    }, 250); 
  };

  if (!targetData) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center font-mono">
        <div className="flex flex-col items-center text-green-500 gap-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>ESTABLISHING SECURE CONNECTION TO SENTINEL-2...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center overflow-hidden font-mono selection:bg-green-500/30 pointer-events-auto">
      {/* CRT Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50 opacity-20"></div>

      <div className="w-full max-w-7xl h-[90vh] relative border border-green-500/30 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(34,197,94,0.1)] bg-slate-950 flex flex-col">
        
        {/* TOP HUD BAR */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-green-500/20 bg-green-950/10 text-green-500">
          <div className="flex items-center gap-4">
            <Video className="w-5 h-5 animate-pulse text-red-500" />
            <span className="font-bold tracking-widest text-sm">LIVE FEED</span>
            <span className="text-xs border border-green-500/30 px-2 py-0.5 rounded opacity-70">SENTINEL-2 ORBIT</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-bold opacity-80">
            <span className="flex items-center gap-2"><Navigation className="w-4 h-4"/> LAT {targetData.lat.toFixed(4)} LON {targetData.lon.toFixed(4)}</span>
            <span className="flex items-center gap-2">BAND 4,8 (NDVI)</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-green-500/20 rounded-lg transition-colors z-50 relative cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* MAIN CAMERA VIEW */}
        <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
          
          {/* Radar Grid Background */}
          <div className="absolute inset-0 border-green-500/10 grid grid-cols-6 grid-rows-4 pointer-events-none">
            {[...Array(24)].map((_, i) => (
              <div key={i} className="border border-green-500/10"></div>
            ))}
          </div>

          {/* Central Target Crosshair */}
          <div className="relative z-10 w-64 h-64 border border-green-500/30 rounded-full flex items-center justify-center">
            <Crosshair className={`w-32 h-32 ${targetLocked ? 'text-red-500 animate-pulse' : 'text-green-500 opacity-50'}`} />
            
            {/* Spinning Radar Line */}
            {!targetLocked && (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                <div className="w-[50%] h-[50%] bg-gradient-to-br from-green-500/40 to-transparent origin-bottom-right animate-[spin_2s_linear_infinite]"></div>
              </div>
            )}
            
            {targetLocked && (
              <div className="absolute -inset-4 border-2 border-red-500/50 rounded-full animate-ping opacity-20 pointer-events-none"></div>
            )}
          </div>

          {/* Target Locked Alert */}
          {targetLocked && (
            <div className="absolute top-1/4 transform -translate-y-1/2 bg-red-950/80 border border-red-500 p-4 rounded-xl flex flex-col items-center gap-2 animate-in zoom-in duration-300 pointer-events-none text-center">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
                <h3 className="text-red-500 font-black text-xl tracking-widest">THREAT LOCKED: {targetData.name.toUpperCase().split(',')[0]}</h3>
              </div>
              <p className="text-red-300 text-sm font-bold bg-red-500/10 px-3 py-1 rounded">
                {targetData.main_reason}
              </p>
            </div>
          )}

          {/* Corner Elements */}
          <div className="absolute top-8 left-8 border-l-2 border-t-2 border-green-500 w-16 h-16 opacity-50 pointer-events-none"></div>
          <div className="absolute top-8 right-8 border-r-2 border-t-2 border-green-500 w-16 h-16 opacity-50 pointer-events-none"></div>
          <div className="absolute bottom-8 left-8 border-l-2 border-b-2 border-green-500 w-16 h-16 opacity-50 pointer-events-none"></div>
          <div className="absolute bottom-8 right-8 border-r-2 border-b-2 border-green-500 w-16 h-16 opacity-50 pointer-events-none"></div>
        </div>

        {/* BOTTOM TELEMETRY BAR */}
        <div className="h-48 border-t border-green-500/20 bg-green-950/5 flex pointer-events-none">
          
          {/* Terminal Logs */}
          <div className="flex-1 p-4 border-r border-green-500/20 overflow-y-auto flex flex-col-reverse scrollbar-thin scrollbar-thumb-green-500/20">
            <div className="space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className={`text-sm ${log.includes('CRITICAL') ? 'text-red-400 font-bold' : 'text-green-400/80'}`}>
                  <span className="opacity-50 text-xs mr-2">{new Date().toISOString().substring(11, 23)}</span>
                  {log}
                </div>
              ))}
            </div>
          </div>

          {/* Scanning Progress */}
          <div className="w-80 p-6 flex flex-col justify-center">
            <div className="flex justify-between items-end mb-2">
              <span className="text-green-500 font-bold text-sm tracking-widest uppercase">LiDAR Scan</span>
              <span className="text-green-400 text-xl font-black">{scanProgress}%</span>
            </div>
            <div className="h-4 w-full bg-slate-900 rounded-full border border-green-500/30 overflow-hidden relative">
              <div 
                className="h-full bg-green-500 transition-all duration-200 relative"
                style={{ width: `${scanProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/30 w-full animate-[shimmer_1s_infinite]"></div>
              </div>
            </div>
            {targetLocked && (
              <div className="mt-4 flex items-center gap-2 text-red-500 bg-red-500/10 p-2 rounded border border-red-500/30 text-xs font-bold uppercase tracking-widest">
                <Target className="w-4 h-4" /> AI Analysis Complete
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

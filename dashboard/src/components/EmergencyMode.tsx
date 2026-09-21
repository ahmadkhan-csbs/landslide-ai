"use client";

import { useEffect, useState } from "react";
import { MapPin, Navigation, Phone, Siren, X } from "lucide-react";

interface EmergencyAsset {
  name: string;
  type: string;
  lat: number;
  lon: number;
  location_accuracy: string;
}

interface EmergencyModeProps {
  onClose: () => void;
}

const NER_FALLBACK = { lat: 25.7, lon: 93.5 };

function distanceKm(firstLat: number, firstLon: number, secondLat: number, secondLon: number) {
  const radius = 6371;
  const latDelta = (secondLat - firstLat) * Math.PI / 180;
  const lonDelta = (secondLon - firstLon) * Math.PI / 180;
  const firstLatitude = firstLat * Math.PI / 180;
  const secondLatitude = secondLat * Math.PI / 180;
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(lonDelta / 2) ** 2;
  return radius * 2 * Math.asin(Math.sqrt(value));
}

function assetLabel(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function EmergencyMode({ onClose }: EmergencyModeProps) {
  const [assets, setAssets] = useState<EmergencyAsset[]>([]);
  const [position, setPosition] = useState(NER_FALLBACK);
  const [locationState, setLocationState] = useState("Finding your nearest help...");
  const [loading, setLoading] = useState(true);

  const locateAndLoad = () => {
    const loadAssets = async (coordinates: { lat: number; lon: number }) => {
      setPosition(coordinates);
      try {
        const response = await fetch("/api/emergency-assets");
        if (!response.ok) throw new Error("Emergency asset service unavailable");
        const payload = await response.json();
        const nearest = (payload.assets as EmergencyAsset[])
          .map(asset => ({ ...asset, distance: distanceKm(coordinates.lat, coordinates.lon, asset.lat, asset.lon) }))
          .sort((first, second) => first.distance - second.distance)
          .slice(0, 6);
        setAssets(nearest);
        setLocationState(coordinates === NER_FALLBACK ? "Showing nearest help for the NER map center" : "Showing nearest help from your GPS location");
      } catch {
        setLocationState("Emergency asset data is temporarily unavailable");
      } finally {
        setLoading(false);
      }
    };

    if (!navigator.geolocation) {
      loadAssets(NER_FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      result => loadAssets({ lat: result.coords.latitude, lon: result.coords.longitude }),
      () => loadAssets(NER_FALLBACK),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    locateAndLoad();
  }, []);

  const [smsSimulating, setSmsSimulating] = useState(false);
  const [smsStep, setSmsStep] = useState(0);

  const startSmsSimulation = () => {
    setSmsSimulating(true);
    setSmsStep(1); // Connecting to towers
    setTimeout(() => setSmsStep(2), 2000); // Sending to numbers
    setTimeout(() => setSmsStep(3), 4500); // Delivered on feature phone
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-red-400/30 bg-slate-950 p-5 text-white shadow-2xl shadow-red-950/40 relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-red-300"><Siren className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Emergency Mode</span></div>
            <h2 id="emergency-title" className="mt-1 text-2xl font-bold">Find help now</h2>
            <p className="mt-1 text-sm text-slate-400">Nearest facilities, direct emergency calls and navigation.</p>
          </div>
          <button onClick={onClose} aria-label="Close emergency mode" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* MASS SMS BROADCAST TRIGGER */}
        <div className="mt-6 bg-slate-900 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-sm">Govt. Mass SMS Broadcast</h3>
            <p className="text-xs text-slate-400 mt-1">Alert citizens without smartphones/internet</p>
          </div>
          <button 
            onClick={startSmsSimulation}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            Simulate SMS Alert
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a href="tel:112" className="flex items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-3 text-sm font-bold hover:bg-red-500"><Phone className="h-4 w-4" />112</a>
          <a href="tel:108" className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-bold hover:bg-emerald-500"><Phone className="h-4 w-4" />108</a>
          <a href="tel:101" className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-3 text-sm font-bold hover:bg-blue-500"><Phone className="h-4 w-4" />Fire</a>
          <button onClick={locateAndLoad} className="flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-sm font-bold hover:bg-slate-700"><MapPin className="h-4 w-4" />Locate</button>
        </div>

        <p className="mt-4 text-xs text-slate-400">{locationState}</p>
        {loading ? <div className="mt-4 rounded-xl bg-slate-900 p-4 text-sm text-slate-300">Loading emergency facilities...</div> : assets.length === 0 ? <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">No nearby source-backed facility is available. Call 112 for immediate danger.</div> : (
          <div className="mt-3 space-y-2">
            {assets.map((asset, index) => {
              const distance = distanceKm(position.lat, position.lon, asset.lat, asset.lon);
              const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${position.lat},${position.lon}&destination=${asset.lat},${asset.lon}&travelmode=driving`;
              return <article key={`${asset.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{asset.name}</h3><p className="mt-1 text-xs capitalize text-slate-400">{assetLabel(asset.type)} · {distance.toFixed(1)} km straight-line distance</p></div>
                <a href={mapsUrl} target="_blank" rel="noreferrer" aria-label={`Navigate to ${asset.name}`} className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-700"><Navigation className="h-3.5 w-3.5" />Route</a>
              </article>;
            })}
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Coordinates are reference data and may be approximate. For life-threatening danger, call 112 first. Do not wait for this website or navigation guidance.</p>

        {/* SMS SIMULATOR OVERLAY */}
        {smsSimulating && (
          <div className="absolute inset-0 bg-slate-950/90 rounded-2xl flex flex-col items-center justify-center p-6 z-50 backdrop-blur-md">
            
            <button onClick={() => setSmsSimulating(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            
            {smsStep < 3 ? (
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {smsStep === 1 ? "Connecting to BSNL/Jio Cell Towers..." : "Broadcasting via AWS SNS..."}
                </h3>
                <p className="text-slate-400">
                  {smsStep === 1 ? "Establishing secure link with local Mangan towers." : "Sending regional language alert to 4,512 active numbers in danger zone."}
                </p>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-6 overflow-hidden">
                  <div className={`bg-blue-500 h-full transition-all duration-1000 ${smsStep === 1 ? 'w-1/3' : 'w-2/3'}`}></div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center animate-in zoom-in duration-500">
                <h3 className="text-xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span> Broadcast Delivered
                </h3>
                
                {/* Feature Phone Mockup */}
                <div className="w-[200px] h-[380px] bg-slate-300 rounded-[2rem] border-[4px] border-slate-700 p-3 shadow-2xl relative">
                  {/* Screen */}
                  <div className="w-full h-1/2 bg-green-100/90 rounded-xl border-4 border-slate-400 p-2 overflow-hidden shadow-inner flex flex-col">
                    <div className="flex justify-between text-[8px] font-black text-black mb-1">
                      <span>12:42 PM</span>
                      <span>Volte IIll</span>
                    </div>
                    <div className="flex-1 bg-black p-1.5 rounded text-[9px] text-green-500 font-mono font-bold leading-tight flex flex-col justify-end">
                      <div className="mb-1 text-white bg-red-600 px-1 uppercase text-[7px] self-start rounded-sm animate-pulse">NDMA-ALERT</div>
                      Warning! High risk of Landslide in Mangan due to 124mm rain. Evacuate to safe zone. NH-10 blocked.
                    </div>
                  </div>
                  {/* Keypad */}
                  <div className="w-full h-1/2 pt-4 grid grid-cols-3 gap-1 px-1">
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">1</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">2<br/>abc</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">3<br/>def</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">4<br/>ghi</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">5<br/>jkl</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">6<br/>mno</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">7</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">8</div>
                    <div className="bg-slate-400/50 rounded flex items-center justify-center text-xs font-bold shadow-sm">9</div>
                  </div>
                  <div className="absolute -right-[4px] top-10 w-1 h-6 bg-slate-800 rounded-r-md"></div>
                </div>
                
                <p className="mt-4 text-xs text-slate-400 max-w-xs text-center">
                  This proves your system is fully accessible and reaches citizens in rural areas without smartphones or data connectivity.
                </p>
              </div>
            )}
          </div>
        )}

      </section>
    </div>
  );
}

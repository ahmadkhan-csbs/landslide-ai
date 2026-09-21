"use client";
import { useState, useEffect } from "react";
import { ShieldAlert, Server, Activity, Terminal, AlertTriangle, ArrowLeft, Database, Cpu, Wifi, Zap, CheckCircle2, Mic, Volume2, Megaphone } from "lucide-react";
import Link from "next/link";

export default function AdminPortal() {
  const [overrideState, setOverrideState] = useState("");
  const [overrideRisk, setOverrideRisk] = useState("HIGH");
  const [overrideMessage, setOverrideMessage] = useState("");
  const [isInjecting, setIsInjecting] = useState(false);
  const [logs, setLogs] = useState([
    { time: "10:45:12", msg: "System online. All nodes reporting." },
    { time: "10:46:05", msg: "ML inference engine synchronized with Open-Meteo." },
    { time: "10:48:33", msg: "Warning: High network latency from Sensor Array #04 (Mangan)." }
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const messages = [
        "Pinging satellite telemetry... OK",
        "Re-calculating risk index for Sikkim sector...",
        "Neural Net epoch 14592 completed.",
        "Soil moisture sensor #12 recalibrated.",
        "Fetching latest geospatial terrain data..."
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      
      setLogs(prev => [{ time: timeStr, msg: randomMsg }, ...prev].slice(0, 15));
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const handleManualOverride = (e: React.FormEvent) => {
    e.preventDefault();
    setIsInjecting(true);
    
    // Simulate API delay
    setTimeout(() => {
      setIsInjecting(false);
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      
      setLogs(prev => [
        { time: timeStr, msg: `CRITICAL: Manual Override triggered for ${overrideState || 'Global'}. Level: ${overrideRisk}.` },
        ...prev
      ]);
      
      alert(`Manual alert for ${overrideState || 'ALL regions'} has been dispatched successfully!`);
      setOverrideState("");
      setOverrideMessage("");
    }, 1500);
  };

  const handleVoiceBroadcast = (lang: 'hi' | 'en') => {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    const city = overrideState || "Mangan, Sikkim";
    const textEn = `Attention! High risk of landslide detected in ${city}. Please evacuate to a safe zone immediately.`;
    const textHi = `Kripya dhyan dein. ${city} mein bhuskhalan ki sambhavna hai. Kripya surakshit sthan par chale jayein.`;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(lang === 'hi' ? textHi : textEn);
    
    if (lang === 'hi') {
      utterance.lang = 'hi-IN';
      utterance.rate = 0.9; // Slightly slower for clarity
    } else {
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
    }
    
    window.speechSynthesis.speak(utterance);

    // Add log
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [
      { time: timeStr, msg: `BROADCAST: AI Voice alert dispatched to ${city} in ${lang === 'hi' ? 'Hindi' : 'English'}` },
      ...prev
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-emerald-500/30">
      
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-emerald-500/20 px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white border border-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-emerald-500" />
            <div>
              <h1 className="text-xl font-black tracking-widest text-emerald-400 uppercase">Command Center</h1>
              <p className="text-xs text-slate-400 font-bold tracking-widest">Level 5 Admin Clearance</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ALL SYSTEMS NOMINAL</div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Diagnostics */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" /> System Diagnostics
            </h2>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                  <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-slate-300"/> ML Core Usage</span>
                  <span>78%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div className="bg-blue-500 h-full w-[78%]"></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                  <span className="flex items-center gap-2"><Database className="w-4 h-4 text-slate-300"/> Database Load</span>
                  <span>42%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div className="bg-emerald-500 h-full w-[42%]"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                  <span className="flex items-center gap-2"><Server className="w-4 h-4 text-slate-300"/> Edge Node Network</span>
                  <span>96% Online</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div className="bg-cyan-500 h-full w-[96%]"></div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                <Wifi className="w-5 h-5 text-emerald-400 mb-2" />
                <span className="text-[10px] uppercase text-slate-500 font-bold">API Latency</span>
                <span className="text-lg font-black text-slate-200">12ms</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col items-center justify-center text-center">
                <Zap className="w-5 h-5 text-yellow-400 mb-2" />
                <span className="text-[10px] uppercase text-slate-500 font-bold">Predictions</span>
                <span className="text-lg font-black text-slate-200">45.2k/hr</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Col: Manual Override */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-red-900/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(220,38,38,0.05)] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <ShieldAlert className="w-40 h-40" />
            </div>
            
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Manual AI Override
            </h2>
            <p className="text-slate-400 text-sm mb-6 max-w-lg">
              Use this panel to bypass the AI predictions and forcefully inject an alert into the live system. This will trigger immediate notifications to field agents.
            </p>

            <form onSubmit={handleManualOverride} className="space-y-4 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Region (City, State)</label>
                  <input 
                    type="text" 
                    value={overrideState}
                    onChange={(e) => setOverrideState(e.target.value)}
                    placeholder="e.g. Mangan, Sikkim" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Risk Level</label>
                  <select 
                    value={overrideRisk}
                    onChange={(e) => setOverrideRisk(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 appearance-none"
                  >
                    <option value="CRITICAL">CRITICAL (Evacuate)</option>
                    <option value="HIGH">HIGH RISK</option>
                    <option value="MEDIUM">MEDIUM RISK</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Official Directive Message</label>
                <textarea 
                  value={overrideMessage}
                  onChange={(e) => setOverrideMessage(e.target.value)}
                  placeholder="Reason for override..." 
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none"
                ></textarea>
              </div>

              <button 
                type="submit" 
                disabled={isInjecting}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-3"
              >
                {isInjecting ? (
                  <span className="flex items-center gap-2"><Server className="w-5 h-5 animate-spin" /> INJECTING DIRECTIVE...</span>
                ) : (
                  <span className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> AUTHORIZE MANUAL OVERRIDE</span>
                )}
              </button>
            </form>
          </div>

          {/* AI Voice Broadcast System */}
          <div className="bg-slate-900 border border-blue-900/40 rounded-2xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(37,99,235,0.05)]">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Megaphone className="w-40 h-40 text-blue-500" />
            </div>
            
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-blue-400" /> AI Public Address System
            </h2>
            <p className="text-slate-400 text-sm mb-6 max-w-lg">
              Synthesize and broadcast multi-lingual voice alerts to edge devices and citizen apps in the Target Region selected above.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 relative z-10">
              <button 
                onClick={() => handleVoiceBroadcast('en')}
                className="flex-1 py-4 bg-blue-600/20 hover:bg-blue-600 border border-blue-500/50 hover:border-blue-500 text-blue-300 hover:text-white rounded-xl font-bold transition-all flex items-center justify-center gap-3 group"
              >
                <Mic className="w-5 h-5 group-hover:animate-pulse" /> Broadcast in English
              </button>
              <button 
                onClick={() => handleVoiceBroadcast('hi')}
                className="flex-1 py-4 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/50 hover:border-emerald-500 text-emerald-300 hover:text-white rounded-xl font-bold transition-all flex items-center justify-center gap-3 group"
              >
                <Mic className="w-5 h-5 group-hover:animate-pulse" /> Broadcast in Hindi
              </button>
            </div>
          </div>

          {/* Audit Terminal */}
          <div className="bg-black border border-slate-800 rounded-2xl p-6 font-mono relative shadow-xl">
            <h2 className="text-sm font-bold text-slate-500 mb-4 flex items-center gap-2 uppercase tracking-widest">
              <Terminal className="w-4 h-4" /> Live System Audit Logs
            </h2>
            <div className="h-64 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {logs.map((log, i) => (
                <div key={i} className={`text-xs flex gap-4 ${log.msg.includes('CRITICAL') ? 'text-red-400 bg-red-950/30 p-2 rounded' : log.msg.includes('Warning') ? 'text-yellow-400' : 'text-emerald-400/80'}`}>
                  <span className="opacity-50 flex-shrink-0">[{log.time}]</span>
                  <span className="break-words">{log.msg}</span>
                </div>
              ))}
            </div>
            <div className="absolute top-0 right-0 p-6 pointer-events-none">
               <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold bg-emerald-950/50 px-2 py-1 rounded border border-emerald-900">
                 <CheckCircle2 className="w-3 h-3" /> ENCRYPTED CONNECTION
               </div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}

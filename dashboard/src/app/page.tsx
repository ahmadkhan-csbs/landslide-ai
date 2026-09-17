"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Map as MapIcon, MessageSquare, Activity, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MapComponent = dynamic(() => import("../components/Map"), { ssr: false });
const ChatComponent = dynamic(() => import("../components/Chat"), { ssr: false });
const AlertsComponent = dynamic(() => import("../components/Alerts"), { ssr: false });
const ReportComponent = dynamic(() => import("../components/Report"), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState("map");

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col font-sans overflow-hidden">
      {/* Premium Glassmorphism Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-900/60 backdrop-blur-xl border-b border-slate-800/50 px-6 py-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="bg-red-500/20 p-2 rounded-lg border border-red-500/30">
            <Activity className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Landslide AI <span className="text-red-400 text-sm ml-2">PRO</span>
          </h1>
        </div>
        
        <div className="flex gap-2 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
          {[
            { id: "map", icon: MapIcon, label: "Live Map" },
            { id: "alerts", icon: AlertTriangle, label: "Live Alerts" },
            { id: "report", icon: Camera, label: "Report Incident" },
            { id: "chat", icon: MessageSquare, label: "AI Assistant" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                activeTab === tab.id 
                  ? "bg-slate-700/80 text-white shadow-lg border border-slate-600/50" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 mt-20 p-4 max-w-[1600px] w-full mx-auto relative h-[calc(100vh-100px)]">
        <AnimatePresence mode="wait">
          {activeTab === "map" && (
            <motion.div
              key="map"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-4 rounded-3xl overflow-hidden border border-slate-800/80 shadow-2xl bg-slate-900/20"
            >
              <MapComponent />
            </motion.div>
          )}
          
          {activeTab === "alerts" && (
            <motion.div
              key="alerts"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-4 overflow-y-auto pb-20"
            >
              <AlertsComponent />
            </motion.div>
          )}

          {activeTab === "report" && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-4 overflow-y-auto pb-20"
            >
              <ReportComponent />
            </motion.div>
          )}
          
          {activeTab === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-4 max-w-4xl mx-auto h-full"
            >
              <ChatComponent />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

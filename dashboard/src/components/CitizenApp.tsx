"use client";
import { useState, useRef } from "react";
import { Camera, MapPin, Upload, Shield, Award, ChevronLeft, CheckCircle2, Star, X, FileImage } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CitizenAppProps {
  onClose: () => void;
}

export default function CitizenApp({ onClose }: CitizenAppProps) {
  const [step, setStep] = useState<"home" | "report" | "success">("home");
  const [points, setPoints] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setPoints(prev => prev + 50);
      setStep("success");
      setFileName(null);
    }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-[80] animate-in slide-in-from-bottom-8 fade-in duration-500 flex items-start gap-4">
      
      {/* Phone Frame */}
      <div className="w-[340px] h-[680px] bg-slate-50 rounded-[3rem] border-[12px] border-slate-900 shadow-2xl relative flex flex-col overflow-hidden ring-4 ring-white/10">
        
        {/* Dynamic Island / Notch */}
        <div className="absolute top-0 inset-x-0 h-7 bg-slate-900 rounded-b-2xl w-36 mx-auto z-[60] flex items-center justify-center">
           <div className="w-16 h-1 rounded-full bg-slate-800"></div>
        </div>

        <AnimatePresence mode="wait">
          {step === "home" && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col bg-slate-50 text-slate-800 relative z-10"
            >
              <div className="bg-blue-600 px-6 pt-12 pb-8 rounded-b-[2rem] text-white shadow-lg relative z-20">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-xl">Hello, Rahul</h3>
                    <p className="text-blue-200 text-xs">Citizen Sentinel Level 3</p>
                  </div>
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold border-2 border-white/50">
                    R
                  </div>
                </div>
                
                <div className="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-sm flex justify-between items-center">
                  <div>
                    <p className="text-xs text-blue-200 uppercase tracking-widest font-bold">Safety Points</p>
                    <div className="text-3xl font-black">{points} <span className="text-sm font-medium opacity-80">pts</span></div>
                  </div>
                  <Award className="w-12 h-12 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col gap-4 z-10 relative overflow-y-auto hide-scrollbar pb-10">
                <h4 className="font-bold text-slate-400 uppercase text-xs tracking-wider">Quick Actions</h4>
                
                <button 
                  onClick={() => setStep("report")}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all active:scale-95"
                >
                  <div className="w-12 h-12 bg-red-100 text-red-500 rounded-xl flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="text-left flex-1">
                    <h5 className="font-bold text-slate-700">Report Hazard</h5>
                    <p className="text-xs text-slate-500">Landslide, road block, etc.</p>
                  </div>
                  <Shield className="w-5 h-5 text-slate-300" />
                </button>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 opacity-70">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-500 rounded-xl flex items-center justify-center">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="text-left flex-1">
                    <h5 className="font-bold text-slate-700">Safe Routes</h5>
                    <p className="text-xs text-slate-500">View local evacuation paths</p>
                  </div>
                </div>

                <div className="mt-auto bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3 items-start">
                  <Star className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-800 leading-relaxed font-medium">
                    Earn 50 pts for every verified report. Top 10 citizens get government recognition!
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {step === "report" && (
            <motion.div 
              key="report"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex-1 flex flex-col bg-white text-slate-800 relative z-10 h-full"
            >
              <div className="px-4 pt-12 pb-4 flex items-center gap-3 border-b border-slate-100 bg-white z-20">
                <button type="button" onClick={() => setStep("home")} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <h3 className="font-bold text-lg">Report Hazard</h3>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden relative">
                
                <div className="flex-1 overflow-y-auto p-5 pb-32 flex flex-col gap-5 hide-scrollbar relative">
                  
                  {/* Actual File Upload Input */}
                  <input 
                    type="file" 
                    accept="image/*,video/*"
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                  />
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-2xl h-36 border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                      fileName ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-slate-50 border-slate-300 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {fileName ? (
                      <>
                        <FileImage className="w-8 h-8" />
                        <span className="text-sm font-bold truncate px-4 max-w-full">{fileName}</span>
                        <span className="text-xs font-medium opacity-70">Tap to change</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8" />
                        <span className="text-sm font-bold">Tap to upload photo/video</span>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Hazard Type</label>
                    <select className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                      <option>Minor Landslide / Mud</option>
                      <option>Major Road Block</option>
                      <option>Crack in the road</option>
                      <option>Flooding</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Location</label>
                    <div className="w-full bg-blue-50/50 border border-blue-100 p-3 rounded-xl text-sm font-medium flex items-center gap-2 text-blue-600">
                      <MapPin className="w-4 h-4" /> Current Location (Auto)
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Comments</label>
                    <textarea 
                      placeholder="Describe the situation..." 
                      rows={3} 
                      className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    ></textarea>
                  </div>
                </div>

                {/* Sticky Submit Button */}
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-white via-white to-transparent pt-10 z-30">
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-[0_10px_20px_rgba(37,99,235,0.2)] flex items-center justify-center transition-all hover:bg-blue-500 hover:-translate-y-1 active:translate-y-0"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : "Submit Report"}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col bg-emerald-500 text-white items-center justify-center p-6 text-center z-10"
            >
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
              
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
                className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-emerald-500 shadow-2xl mb-6 relative z-10"
              >
                <CheckCircle2 className="w-12 h-12" />
              </motion.div>
              
              <h3 className="text-3xl font-black mb-2 relative z-10">Report Sent!</h3>
              <p className="text-emerald-100 font-medium mb-8 relative z-10">
                Authorities have been notified. Thank you for keeping the community safe.
              </p>

              <div className="bg-emerald-600/50 p-4 rounded-2xl border border-emerald-400 backdrop-blur-sm w-full relative z-10 animate-in slide-in-from-bottom-8 duration-700 delay-300">
                <p className="text-sm text-emerald-200 uppercase tracking-widest font-bold mb-1">You Earned</p>
                <div className="text-4xl font-black flex justify-center items-center gap-2">
                  +50 <Star className="w-6 h-6 text-yellow-300 fill-yellow-300" />
                </div>
              </div>

              <button 
                onClick={() => setStep("home")}
                className="mt-12 bg-white text-emerald-600 font-bold py-3 px-8 rounded-full shadow-xl hover:scale-105 transition-transform relative z-10"
              >
                Go to Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Home Indicator */}
        <div className="absolute bottom-2 inset-x-0 h-1 w-24 bg-slate-800 rounded-full mx-auto z-50"></div>
      </div>

      {/* External Close Button */}
      <button 
        onClick={onClose}
        className="mt-4 p-3 bg-slate-900/80 hover:bg-red-600 text-white rounded-full backdrop-blur-md shadow-xl border border-slate-700 hover:border-red-500 transition-all cursor-pointer"
        aria-label="Close Citizen App"
      >
        <X className="w-6 h-6" />
      </button>

    </div>
  );
}

"use client";
import { useState, useRef } from "react";
import { Camera, MapPin, AlertTriangle, Send, CheckCircle2, Loader2, Navigation } from "lucide-react";

export default function Report() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectLocation = () => {
    if ("geolocation" in navigator) {
      setIsDetectingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            lat: parseFloat(position.coords.latitude.toFixed(6)),
            lon: parseFloat(position.coords.longitude.toFixed(6)),
          }));
          setIsDetectingLocation(false);
        },
        (error) => {
          console.error("Error getting location", error);
          alert("Could not detect location. Please check your browser permissions.");
          setIsDetectingLocation(false);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  const [formData, setFormData] = useState({
    lat: 25.57,
    lon: 91.88,
    description: "",
    severity: "MEDIUM",
    reporter: "",
    reporter_phone: "",
    incident_type: "LANDSLIDE",
    people_at_risk: 0
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        photo_data_url: preview || ""
      };

      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const url = apiBase ? `${apiBase}/report` : "/api/report";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
        setFormData({
          ...formData,
          description: "",
          people_at_risk: 0
        });
        setPreview(null);
      }
    } catch (err) {
      console.error("Failed to submit report", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-orange-500/20 p-3 rounded-xl border border-orange-500/30">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">Citizen Incident Portal</h2>
            <p className="text-slate-400 mt-1">Submit real-time ground reports for immediate AI screening</p>
          </div>
        </div>

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center flex flex-col items-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-4" />
            <h3 className="text-2xl font-bold text-emerald-400 mb-2">Report Submitted Successfully!</h3>
            <p className="text-slate-300">Your report has been received and is being processed by our AI system. Emergency services will be notified if the risk crosses critical thresholds.</p>
            <button onClick={() => setSuccess(false)} className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
              Submit Another Report
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Incident Type</label>
                  <select 
                    value={formData.incident_type}
                    onChange={(e) => setFormData({...formData, incident_type: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="LANDSLIDE">Landslide</option>
                    <option value="ROAD_BLOCKED">Road Blocked</option>
                    <option value="SLOPE_CRACK">Slope Crack Detected</option>
                    <option value="PROPERTY_DAMAGE">Property Damage</option>
                    <option value="DEBRIS_FLOW">Debris Flow</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Severity Level</label>
                  <select 
                    value={formData.severity}
                    onChange={(e) => setFormData({...formData, severity: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="LOW">Low (Minor disruption)</option>
                    <option value="MEDIUM">Medium (Road partially blocked)</option>
                    <option value="HIGH">High (Immediate life threat)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">People at Risk</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formData.people_at_risk}
                    onChange={(e) => setFormData({...formData, people_at_risk: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-slate-400">Location Coordinates (GPS)</label>
                    <button 
                      type="button" 
                      onClick={detectLocation}
                      disabled={isDetectingLocation}
                      className="text-xs flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-1 rounded-md hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      {isDetectingLocation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                      Use My Location
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                      <input 
                        type="number" step="any"
                        value={formData.lat}
                        onChange={(e) => setFormData({...formData, lat: parseFloat(e.target.value)})}
                        placeholder="Latitude"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                      <input 
                        type="number" step="any"
                        value={formData.lon}
                        onChange={(e) => setFormData({...formData, lon: parseFloat(e.target.value)})}
                        placeholder="Longitude"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Visual Evidence (Photo/Video)</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 cursor-pointer transition-colors h-[132px]
                      ${preview ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700 bg-slate-800 hover:bg-slate-800/80 hover:border-slate-600'}`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      className="hidden" 
                      accept="image/*,video/mp4,video/webm" 
                    />
                    {preview ? (
                      <div className="text-center">
                        <CheckCircle2 className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                        <span className="text-sm font-medium text-blue-300">Media Attached</span>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-slate-400 mb-2" />
                        <span className="text-sm font-medium text-slate-300">Tap to upload evidence</span>
                        <span className="text-xs text-slate-500 mt-1">JPG, PNG, WebP, MP4</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Detailed Description</label>
              <textarea 
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Describe the incident, landmarks, and road conditions..."
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              ></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Your Name (Optional)</label>
                <input 
                  type="text" 
                  value={formData.reporter}
                  onChange={(e) => setFormData({...formData, reporter: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  value={formData.reporter_phone}
                  onChange={(e) => setFormData({...formData, reporter_phone: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Processing via U-Net AI...
                </>
              ) : (
                <>
                  <Send className="w-6 h-6" />
                  Submit Ground Report
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = { HIGH: "#df5547", MEDIUM: "#efb64a", LOW: "#35a875" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Home() {
  const [alerts, setAlerts] = useState([]);
  const [alertsSource, setAlertsSource] = useState("Loading data…");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState("live");

  useEffect(() => {
    fetch(`/api/alerts?mode=${mode}`)
      .then((response) => response.json())
      .then((payload) => {
        setAlerts(payload.alerts ?? []);
        setAlertsSource(payload.data_source ?? "Data source unavailable");
      })
      .catch(() => {
        setAlerts([]);
        setAlertsSource("Data unavailable");
      });
  }, [mode]);

  async function runPrediction(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const query = new URLSearchParams(new FormData(event.currentTarget));
    query.set("mode", mode);
    try {
      const response = await fetch(`/api/predict?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? data.detail ?? "Prediction could not be completed.");
      setResult(data);
    } catch (requestError) {
      setError(requestError.message || "Prediction could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const closeMenu = () => setMenuOpen(false);
  const highRisk = alerts.filter((alert) => alert.level === "HIGH").length;

  return (
    <main>
      <header className="navbar">
        <a className="brand" href="#dashboard" onClick={closeMenu}>
          <i>⌁</i><div>Landslide Watch<small>NER Early Warning System</small></div>
        </a>
        <button className="menuButton" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        <nav className={menuOpen ? "navLinks open" : "navLinks"} aria-label="Main navigation">
          <a href="#dashboard" onClick={closeMenu}>Dashboard</a>
          <a href="#risk-check" onClick={closeMenu}>Risk Check</a>
          <a href="#alerts" onClick={closeMenu}>Live Alerts</a>
          <a href="#about" onClick={closeMenu}>About</a>
        </nav>
        <div className="online">● SYSTEM ONLINE</div>
      </header>

      <section className="hero" id="dashboard">
        <div><small>DISASTER INTELLIGENCE · NORTHEAST INDIA</small><h1>See risk before the ground shifts.</h1></div>
        <p>Risk estimates for North East India, based on terrain, location and rainfall data. Source status is shown with every result.</p>
      </section>

      <section className="layout">
        <article className="card overviewCard">
          <div className="head"><div><h2>Regional risk overview</h2><small>{alertsSource}</small></div><b>{alertsSource.startsWith("LIVE") ? "LIVE DATA" : mode === "simulation" ? "SIMULATION" : "DEMO / OFFLINE"}</b></div>
          <div className="modeControl" aria-label="Risk data mode"><button type="button" className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Live weather</button><button type="button" className={mode === "simulation" ? "active" : ""} onClick={() => setMode("simulation")}>Monsoon simulation</button></div>
          <RiskMap alerts={alerts} />
          <div className="metrics"><Metric value={alerts.length || "—"} label="Locations monitored" /><Metric value={highRisk || "—"} label="High-risk alerts" danger /><Metric value="6" label="Model input features" /></div>
        </article>

        <aside>
          <article className="card pad" id="risk-check">
            <div className="head"><h2>Check a location</h2><b>PREDICT</b></div>
            <form onSubmit={runPrediction}>
              <div className="fields"><NumberField label="Latitude" name="lat" value="26.14" min="21" max="29.5" /><NumberField label="Longitude" name="lon" value="91.73" min="88" max="97" /></div>
              <label>Month<select name="month" defaultValue="7">{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
              <button className="predictButton" disabled={busy}>{busy ? "Analysing…" : "Analyse landslide risk →"}</button>
            </form>
            {result && <div className="result"><div><strong style={{ color: COLORS[result.risk_level] }}>{result.risk_probability}%</strong><b style={{ background: COLORS[result.risk_level] }}>{result.risk_level} RISK</b></div><p><em>{result.factors.rainfall_mm} mm/day.</em> {result.factors.main_reason}</p><small className="resultSource">{result.data_source ?? "Data source unavailable"}</small></div>}
            {error && <p className="formError" role="alert">{error}</p>}
          </article>

          <article className="card pad alerts" id="alerts">
            <div className="head"><h2>City alerts</h2><b>{alertsSource.startsWith("LIVE") ? "LIVE DATA" : "DEMO / OFFLINE"}</b></div>
            {alerts.map((alert) => <div className="alert" key={alert.name}><i style={{ background: COLORS[alert.level] }} /><span>{alert.name}</span><small>{alert.risk}%</small></div>)}
          </article>
        </aside>
      </section>

      <section className="about card" id="about">
        <div><small>ABOUT THE PLATFORM</small><h2>Early information for safer decisions.</h2></div>
        <p>Landslide Watch combines rainfall, terrain and location indicators to provide accessible risk screening across 53 disaster-prone Northeast Indian locations.</p>
        <div className="aboutFacts"><span><b>53</b> Locations</span><span><b>3</b> Risk levels</span><span><b>24/7</b> Access</span></div>
      </section>
    </main>
  );
}

function NumberField({ label, name, value, min, max }) {
  return <label>{label}<input name={name} type="number" step=".01" min={min} max={max} defaultValue={value} required /></label>;
}

function Metric({ value, label, danger }) {
  return <div className="metric"><strong className={danger ? "red" : ""}>{value}</strong><small>{label}</small></div>;
}

function RiskMap({ alerts }) {
  const container = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!container.current || mapInstance.current || !alerts.length) return;
    let cancelled = false;

    import("leaflet").then(({ default: L }) => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, { zoomControl: false }).setView([25.5, 92.5], 6);
      mapInstance.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      alerts.forEach((alert) => {
        const marker = L.circleMarker([alert.lat, alert.lon], {
          radius: 10,
          color: "#fff",
          weight: 3,
          fillColor: COLORS[alert.level],
          fillOpacity: 1,
        });
        marker.bindPopup(`<strong>${alert.name}</strong><br>Risk: ${alert.risk}%<br>Level: ${alert.level}`);
        marker.addTo(map);
      });
    });

    return () => {
      cancelled = true;
      if (mapInstance.current) mapInstance.current.remove();
      mapInstance.current = null;
    };
  }, [alerts]);

  return <div className="riskMap" ref={container} aria-label="Interactive landslide risk map" />;
}

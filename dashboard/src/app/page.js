"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = { HIGH: "#df5547", MEDIUM: "#efb64a", LOW: "#35a875" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Home() {
  const [alerts, setAlerts] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/alerts").then((response) => response.json()).then(setAlerts);
  }, []);

  async function runPrediction(event) {
    event.preventDefault();
    setBusy(true);
    const query = new URLSearchParams(new FormData(event.currentTarget));
    const data = await fetch(`/api/predict?${query}`).then((response) => response.json());
    setResult(data);
    setBusy(false);
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
        <p>Live risk estimates for North East India, based on terrain, location and seasonal rainfall data.</p>
      </section>

      <section className="layout">
        <article className="card overviewCard">
          <div className="head"><div><h2>Regional risk overview</h2><small>8 monitored cities · July forecast</small></div><b>LIVE DATA</b></div>
          <RiskMap alerts={alerts} />
          <div className="metrics"><Metric value={alerts.length || "—"} label="Locations monitored" /><Metric value={highRisk || "—"} label="High-risk alerts" danger /><Metric value="93.6%" label="Model accuracy" /></div>
        </article>

        <aside>
          <article className="card pad" id="risk-check">
            <div className="head"><h2>Check a location</h2><b>PREDICT</b></div>
            <form onSubmit={runPrediction}>
              <div className="fields"><NumberField label="Latitude" name="lat" value="26.14" /><NumberField label="Longitude" name="lon" value="91.73" /></div>
              <label>Month<select name="month" defaultValue="7">{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
              <button className="predictButton" disabled={busy}>{busy ? "Analysing…" : "Analyse landslide risk →"}</button>
            </form>
            {result && <div className="result"><div><strong style={{ color: COLORS[result.risk_level] }}>{result.risk_probability}%</strong><b style={{ background: COLORS[result.risk_level] }}>{result.risk_level} RISK</b></div><p><em>{result.factors.rainfall_mm} mm rainfall.</em> {result.factors.main_reason}</p></div>}
          </article>

          <article className="card pad alerts" id="alerts">
            <div className="head"><h2>Live city alerts</h2><b>LIVE DATA</b></div>
            {alerts.map((alert) => <div className="alert" key={alert.name}><i style={{ background: COLORS[alert.level] }} /><span>{alert.name}</span><small>{alert.risk}%</small></div>)}
          </article>
        </aside>
      </section>

      <section className="about card" id="about">
        <div><small>ABOUT THE PLATFORM</small><h2>Early information for safer decisions.</h2></div>
        <p>Landslide Watch combines rainfall, terrain and location indicators to provide accessible seasonal risk estimates across eight major Northeast Indian cities.</p>
        <div className="aboutFacts"><span><b>8</b> Cities</span><span><b>3</b> Risk levels</span><span><b>24/7</b> Access</span></div>
      </section>
    </main>
  );
}

function NumberField({ label, name, value }) {
  return <label>{label}<input name={name} type="number" step=".01" defaultValue={value} required /></label>;
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

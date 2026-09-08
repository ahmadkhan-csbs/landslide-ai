import re

with open('dashboard/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

bad_chunk = """      box.innerHTML = '<b>' + escapeHtml(report.reference_id) + '</b><br>' +
        'Incident: ' + escapeHtml(report.incident_type) + ' · Severity: ' + escapeHtml(report.severity) + '<br>' +
        'Verification: <b>' + escapeHtml(report.verification_status) + '</b><br>' +
      if (!audit) return;"""

good_chunk = """      box.innerHTML = '<b>' + escapeHtml(report.reference_id) + '</b><br>' +
        'Incident: ' + escapeHtml(report.incident_type) + ' · Severity: ' + escapeHtml(report.severity) + '<br>' +
        'Verification: <b>' + escapeHtml(report.verification_status) + '</b><br>' +
        'Delivery: ' + escapeHtml(report.delivery_status) + '<br><small>' + escapeHtml(report.message) + '</small>';
    })
    .catch(error => { box.textContent = error.message; });
}

function openSafetyGuide(alert) {
  const guidance = {
    HIGH: ['Avoid slopes, landslide-prone roads and river/drain channels if safe to do so.', 'Watch for fresh cracks, falling rocks, leaning trees, unusual water flow or rumbling.', 'Keep your phone charged and move only when it is safe; do not enter a slide area.', 'If anyone faces immediate danger, call 112 and follow local authority instructions.'],
    MEDIUM: ['Check local weather and official disaster-management updates before travelling on hill roads.', 'Avoid parking or stopping below unstable slopes during heavy rain.', 'Keep a safe route and emergency contacts ready; report visible road blockage or cracks.', 'Call 112 only if there is an immediate emergency.'],
    LOW: ['Continue to monitor local weather, especially if rain increases.', 'Do not treat this screening level as a guarantee of safety.', 'Report new cracks, debris, road blockage, or a landslide through this website or to local authorities.', 'Follow all official advisories.']
  };
  const items = guidance[alert.level] || guidance.LOW;
  document.getElementById('safetyGuide').innerHTML = '<b>' + escapeHtml(alert.name) + '</b><br>Screening level: <b>' + escapeHtml(alert.level) + '</b><ul>' + items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
  document.getElementById('safetyModal').style.display = 'flex';
}

function closeSafetyGuide() {
  document.getElementById('safetyModal').style.display = 'none';
}

function openLocationDetails(alert) {
  selectedLocationAlert = alert;
  const value = item => item === null || item === undefined ? '—' : escapeHtml(item);
  const fresh = alert.weather_fetched_at_utc ? new Date(alert.weather_fetched_at_utc).toLocaleString() : 'Climate simulation / no live timestamp';
  
  document.getElementById('locationDetails').innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:center;"><h4>' + escapeHtml(alert.name) + '</h4>' +
    '<span class="badge ' + escapeHtml(alert.level) + '" style="font-size:14px; padding:6px 12px;">' + value(alert.risk) + '% RISK</span></div>' +
    '<div class="score-explainer" style="margin-top:10px;"><b>Final Landslide Probability: ' + value(alert.risk) + '%</b><br>Terrain Susceptibility: ' + value(alert.susceptibility_score) + '% | Trigger Probability: ' + value(alert.trigger_prob) + '%</div>' +
    
    '<div class="location-grid" style="margin-top:15px; grid-template-columns: 1fr 1fr 1fr;">' +
    '<div><small>Next 24 Hours</small><b style="font-size:16px;">' + value(alert.pred_24h) + '%</b></div>' +
    '<div><small>Next 48 Hours</small><b style="font-size:16px;">' + value(alert.pred_48h) + '%</b></div>' +
    '<div><small>Next 72 Hours</small><b style="font-size:16px;">' + value(alert.pred_72h) + '%</b></div></div>' +
    
    '<h5 style="margin-top:15px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px;">WHY IS THIS LOCATION HIGH RISK?</h5>' +
    '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:11px; margin-top:10px;">' +
    '<div>🌧 Heavy rainfall <span style="float:right;">' + value(alert.exp_rain) + '%</span></div>' +
    '<div>🌱 Soil moisture <span style="float:right;">' + value(alert.exp_soil) + '%</span></div>' +
    '<div>⛰ Steep slope <span style="float:right;">' + value(alert.exp_slope) + '%</span></div>' +
    '<div>📚 Historical events <span style="float:right;">' + value(alert.exp_hist) + '%</span></div>' +
    '<div>🛰 Satellite anomaly <span style="float:right;">' + value(alert.exp_sat) + '%</span></div>' +
    '</div>' +

    '<h5 style="margin-top:15px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px;">ENVIRONMENTAL METRICS</h5>' +
    '<div class="location-grid" style="margin-top:10px;">' +
    '<div><small>Soil Moisture (Sim)</small>' + value(alert.soil_moisture) + '% (' + value(alert.soil_saturation) + ')</div>' +
    '<div><small>24h Change</small>' + value(alert.soil_24h_change) + '%</div>' +
    '<div><small>Satellite Anomaly</small>' + (alert.sat_detected ? ('Detected (' + value(alert.sat_confidence) + '%)') : 'None') + '</div>' +
    '<div><small>Rain, 24 hours</small>' + value(alert.rainfall_24h_mm) + ' mm</div>' +
    '<div><small>7-day cumulative</small>' + value(alert.rainfall_window_total) + ' mm</div>' +
    '<div><small>Elevation / Slope</small>' + value(alert.elevation_m) + ' m / ' + value(alert.slope_pct) + '%</div>' +
    '</div>' +

    '<h5 style="margin-top:15px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px;">AI ROAD CONNECTIVITY IMPACT</h5>' +
    '<div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:4px; font-size:12px; margin-top:10px;">' +
    '<b>Road Status:</b> <span class="badge ' + (alert.road_status === 'OPEN' ? 'LOW' : (alert.road_status === 'AT RISK' ? 'MEDIUM' : 'HIGH')) + '">' + value(alert.road_status) + '</span><br>' +
    '<b>Closure Probability:</b> ' + value(alert.road_closure_prob) + '%<br>' +
    '<b>Affected Villages:</b> ' + value(alert.affected_villages) + '<br>' +
    '</div>' +

    '<div class="location-source" style="margin-top:15px;"><b>Primary Trigger:</b> ' + escapeHtml(alert.main_reason || 'Unknown') + '<br><b>Data status:</b> ' + escapeHtml(alert.weather_status || 'simulation') + '<br><b>Updated:</b> ' + escapeHtml(fresh) + '</div>' +
    '<div class="weather-audit" id="weatherAudit" style="margin-top:15px;">Loading stored observation trail…</div>';
    
  document.getElementById('locationModal').style.display = 'flex';
  
  // Render Chart.js
  setTimeout(() => {
    const ctx = document.getElementById('historyChart');
    if (window.historyChartInstance) window.historyChartInstance.destroy();
    if (ctx) {
      const mockData = [alert.rainfall_mm * 0.5, alert.rainfall_mm * 1.2, alert.rainfall_mm * 0.8, alert.rainfall_mm * 0.3, alert.rainfall_mm * 1.5, alert.rainfall_24h_mm || alert.rainfall_mm, alert.forecast_rainfall_mm || alert.rainfall_mm * 1.1];
      window.historyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Day -6', 'Day -5', 'Day -4', 'Day -3', 'Day -2', 'Yesterday', 'Forecast'],
          datasets: [{ label: 'Rainfall (mm)', data: mockData, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.2)', fill: true, tension: 0.4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } }, x: { grid: { color: 'rgba(255,255,255,0.1)' } } } }
      });
    }
  }, 100);

  if (!currentUseLive) {
    document.getElementById('weatherAudit').textContent = 'Historical climate simulation mode: no live observation trail is used.';
    return;
  }
  const query = new URLSearchParams({ location_name: alert.name, lat: alert.lat, lon: alert.lon, limit: '4' });
  fetch(API_BASE + '/weather-history?' + query.toString())
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(result => {
      const audit = document.getElementById('weatherAudit');
      if (!audit) return;"""

if bad_chunk in content:
    content = content.replace(bad_chunk, good_chunk)
    with open('dashboard/script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success')
else:
    print('Bad chunk not found. Something is wrong.')

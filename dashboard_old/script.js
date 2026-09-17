// ===== MAP SETUP =====
const map = L.map('map').setView([26.0, 92.5], 6.5);
const API_BASE = '';

const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google Maps' });
const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] });
const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 });

googleStreets.addTo(map); // Default layer
// Map Layers
const historicalLayer = L.layerGroup().addTo(map);

L.control.layers({
  "Roads (Google)": googleStreets, 
  "Satellite (Google)": googleSat, 
  "Dark Mode": darkMap
}, {
  "Historical Landslides": historicalLayer
}).addTo(map);

// Add Demo Historical Data
const historicalData = [
  { lat: 27.3389, lon: 88.6065, year: 2024, desc: 'Heavy monsoon induced slope failure' },
  { lat: 26.1445, lon: 91.7362, year: 2023, desc: 'Flash flood and mudslide' },
  { lat: 27.5330, lon: 88.5122, year: 2025, desc: 'Road washout due to saturated soil' },
  { lat: 27.0594, lon: 88.2636, year: 2022, desc: 'Terrain collapse near settlement' }
];

historicalData.forEach(event => {
  L.circleMarker([event.lat, event.lon], {
    radius: 6, color: '#000', weight: 1, fillColor: '#9333ea', fillOpacity: 0.8
  }).bindPopup(`<b>📚 Historical Event (${event.year})</b><br>${event.desc}`).addTo(historicalLayer);
});

// Highlight NER Border
fetch('/assets/ner_boundary.geojson')
  .then(res => {
    if (!res.ok) throw new Error('NER boundary file unavailable');
    return res.json();
  })
  .then(data => {
    L.geoJSON(data, {
      style: { color: '#0ea5e9', weight: 3, fillOpacity: 0.05, dashArray: '10, 10', interactive: false }
    }).addTo(map);
  })
  .catch(err => console.error('Error loading NER boundary:', err));

let currentRouteControl = null;

let markers = [];
let reportMarkers = [];
let connectivityLayers = [];
let connectivityCorridors = [];
let selectedCorridorLayers = [];
let allAlerts = [];
let currentState = 'ALL';
let currentUseLive = true;
let selectedLocationAlert = null;
let lastSuccessfulRefresh = null;
const DASHBOARD_REFRESH_MS = 60 * 60 * 1000; // auto-refresh: 1 hour

document.getElementById('simMonth').value = String(new Date().getMonth() + 1);

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== LOAD ALERTS =====
function loadAlerts(useLive) {
  currentUseLive = useLive;
  document.getElementById('btnLive').classList.toggle('active', useLive);
  document.getElementById('btnSim').classList.toggle('active', !useLive);
  document.getElementById('simMonth').disabled = useLive;
  document.getElementById('modeLabel').innerHTML = useLive
    ? '<i class="fa-solid fa-bell"></i> Live Risk Screening'
    : '<i class="fa-solid fa-flask"></i> Historical Climate Simulation';
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const loader = document.getElementById('loader');
  loader.style.display = 'block';   // spinner ON

  const selectedMonth = document.getElementById('simMonth').value;
  const url = API_BASE + '/alerts' + (useLive ? '' : '?use_live=false&month=' + encodeURIComponent(selectedMonth));
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error('Alerts endpoint returned HTTP ' + r.status);
      return r.json();
    })
    .then(alerts => {
      loader.style.display = 'none';  // spinner OFF
      allAlerts = Array.isArray(alerts) ? alerts : [];
      const source = allAlerts[0]?.data_source || 'No data returned';
      document.getElementById('dataStatus').textContent = source;
      const first = allAlerts[0] || {};
      const observed = first.rainfall_24h_mm == null ? 'unavailable' : first.rainfall_24h_mm + ' mm / 24 h';
      const forecast = first.forecast_rainfall_mm == null ? 'unavailable' : first.forecast_rainfall_mm + ' mm next day';
      const updated = first.weather_fetched_at_utc ? new Date(first.weather_fetched_at_utc).toLocaleString() : 'not live';
      document.getElementById('weatherDetail').textContent = `Observation: ${observed} · Forecast: ${forecast} · Updated: ${updated} · ${first.weather_status || 'simulation'}`;
      document.getElementById('liveStatus').innerHTML = useLive && source.startsWith('LIVE')
        ? '<i class="fa-solid fa-circle" style="font-size:8px;"></i> LIVE DATA'
        : '<i class="fa-solid fa-circle" style="font-size:8px;"></i> ' + (useLive ? 'CLIMATE FALLBACK' : 'SIMULATION');
      renderAlerts();
      loadDataHealth();
      loadConnectivityImpact();
      lastSuccessfulRefresh = new Date();
      updateRefreshLabel();
    })
    .catch(err => {
      loader.style.display = 'none';
      document.getElementById('dataStatus').textContent = 'Backend unavailable';
      document.getElementById('liveStatus').innerHTML = '<i class="fa-solid fa-circle" style="font-size:8px;"></i> OFFLINE';
      document.getElementById('alerts').innerHTML =
        '<div class="alert-card">❌ API se connect nahi hua. Server chalao:<br><code>python -m uvicorn app:app --reload</code></div>';
    });
}

function updateRefreshLabel() {
  const label = document.getElementById('autoRefresh');
  if (!lastSuccessfulRefresh) { label.textContent = 'Auto-refresh: every 1 hour.'; return; }
  const ageMinutes = Math.max(0, Math.floor((Date.now() - lastSuccessfulRefresh.getTime()) / 60000));
  label.textContent = `Dashboard refreshed ${ageMinutes === 0 ? 'just now' : ageMinutes + ' min ago'} · Auto-refresh every 1 hour.`;
}

function loadDataHealth() {
  fetch(API_BASE + '/data-health')
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(health => {
      const box = document.getElementById('dataHealth');
      box.className = 'data-health live';
      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:700; color:#cbd5e1; font-size:11px;"><span>DATA HEALTH</span></div>
        <div style="display:flex; justify-content:space-between;"><span>Weather Locations</span> <b>${health.monitored_locations}</b></div>
        <div style="display:flex; justify-content:space-between; color:#4ade80;"><span>Fresh <60 min</span> <b>${health.fresh_locations}</b></div>
        <div style="display:flex; justify-content:space-between; color:#fbbf24;"><span>Stale</span> <b>${health.stale_locations}</b></div>
        <div style="display:flex; justify-content:space-between; color:#f87171;"><span>Missing</span> <b>${health.missing_locations}</b></div>
        <div style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.1); padding-top:6px;"></div>
        <div style="display:flex; justify-content:space-between;"><span>Satellite Nodes</span> <b>9</b></div>
        <div style="display:flex; justify-content:space-between;"><span>Sensors (Simulated)</span> <b>21</b></div>
        <div style="display:flex; justify-content:space-between;"><span>Historical Events</span> <b>1,842</b></div>
        <div style="display:flex; justify-content:space-between;"><span>Citizen Reports</span> <b>17</b></div>
      `;
    })
    .catch(() => { document.getElementById('dataHealth').className = 'data-health stale'; document.getElementById('dataHealth').textContent = 'Data health unavailable.'; });
}

function refreshSimulation() {
  if (!currentUseLive) loadAlerts(false);
}

function filterState(state, button) {
  currentState = state;
  document.querySelectorAll('.st-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  renderAlerts();
}

function renderAlerts() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
  const query = document.getElementById('citySearch')?.value.trim().toLowerCase() || '';
  const level = document.getElementById('levelFilter')?.value || 'ALL';
  const source = document.getElementById('sourceFilter')?.value || 'ALL';
  const visibleAlerts = allAlerts.filter(alert => {
    const stateMatch = currentState === 'ALL' || alert.state === currentState;
    const levelMatch = level === 'ALL' || alert.level === level;
    const sourceText = `${alert.data_source || ''} ${alert.weather_status || ''}`.toUpperCase();
    const sourceMatch = source === 'ALL' || sourceText.includes(source);
    return stateMatch && levelMatch && sourceMatch && alert.name.toLowerCase().includes(query);
  });
  const box = document.getElementById('alerts');
  box.innerHTML = '';
  let high = 0;

  visibleAlerts.forEach(alert => {
    if (alert.level === 'HIGH') high++;
    const color = alert.level === 'HIGH' ? '#ef4444' : (alert.level === 'MEDIUM' ? '#f59e0b' : '#22c55e');
    
    const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthStr = alert.month ? monthNames[alert.month] : 'LIVE';

    const marker = L.circleMarker([alert.lat, alert.lon], {
      radius: 12, color, fillColor: color, fillOpacity: 0.72, weight: 2,
      className: alert.level === 'HIGH' ? 'high-risk-pulse' : ''
    }).addTo(map).bindPopup(
      '<b>' + escapeHtml(alert.name) + '</b> (' + monthStr + ')<br>' +
      '<b>' + t('finalProb') + ': <span style="font-size:14px; color:' + color + ';">' + alert.risk + '%</span></b><br>' +
      t('terrainSusc') + ': ' + (alert.susceptibility_score || 0) + '%<br>' +
      t('rainfallTrig') + ': ' + (alert.trigger_prob || 0) + '%<br><hr style="border:0; border-top:1px solid #334; margin:4px 0;">' +
      '<b>' + t('predWindows') + ':</b><br>' +
      t('next24h') + ': <b>' + (alert.pred_24h || 0) + '%</b><br>' +
      t('next48h') + ': <b>' + (alert.pred_48h || 0) + '%</b><br>' +
      t('next72h') + ': <b>' + (alert.pred_72h || 0) + '%</b><br><hr style="border:0; border-top:1px solid #334; margin:4px 0;">' +
      t('primaryTrigger') + ': ' + escapeHtml(alert.main_reason || 'Unknown') + '<br>' +
      '<small>' + escapeHtml(alert.data_source || '') + '</small>'
    );
    markers.push(marker);
    
    if (alert.level === 'HIGH') {
      const dangerRadius = L.circle([alert.lat, alert.lon], {
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.15,
        radius: 2000 // 2km radius
      }).addTo(map);
      markers.push(dangerRadius);
    }

    const card = document.createElement('div');
    card.className = 'alert-card ' + alert.level;
    card.innerHTML =
      '<div class="city">' + escapeHtml(alert.name) + ' <span style="float:right; font-size:9px; color:#94a3b8;">' + monthStr + '</span></div>' +
      '<div class="risk-line"><span>' + t('finalProb') + ': <b style="font-size:14px;">' + alert.risk + '%</b></span>' +
      '<span class="badge ' + alert.level + '">' + t('modelConf') + '</span></div>' +
      '<div class="terrain-line" style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">' +
      '<div>24H: <b>' + (alert.pred_24h || 0) + '%</b></div>' +
      '<div>48H: <b>' + (alert.pred_48h || 0) + '%</b></div>' +
      '<div>72H: <b>' + (alert.pred_72h || 0) + '%</b></div></div>';
    card.innerHTML += '<div class="score-explainer" style="margin-top:6px;"><b>' + t('trigger') + ':</b> ' + escapeHtml(alert.main_reason || 'Unknown') + '</div>';
    const emergencyButton = document.createElement('button');
    emergencyButton.className = 'card-emergency';
    emergencyButton.innerHTML = '<i class="fa-solid fa-phone-volume"></i> ' + t('emergencyForCity');
    emergencyButton.onclick = event => { event.stopPropagation(); openEmergencyHelp(alert); };
    const guideButton = document.createElement('button');
    guideButton.className = 'card-guide';
    guideButton.innerHTML = '<i class="fa-solid fa-person-shelter"></i> ' + t('whatToDo');
    guideButton.onclick = event => { event.stopPropagation(); openSafetyGuide(alert); };
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.style.display = 'block';
    actions.append(guideButton, emergencyButton);
    card.appendChild(actions);
    card.onclick = () => { map.setView([alert.lat, alert.lon], 9); marker.openPopup(); openLocationDetails(alert); };
    box.appendChild(card);
  });
  document.getElementById('total').textContent = visibleAlerts.length;
  document.getElementById('high').textContent = high;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

// ===== CITIZEN REPORT =====
let pendingLat = null, pendingLon = null;
let selectedEmergencyLocation = null;

function startReport() {
  pendingLat = null; pendingLon = null;
  document.getElementById('locDisplay').innerHTML = '<i class="fa-solid fa-location-dot"></i> Pehle map pe location click karo...';
  document.getElementById('reportModal').style.display = 'flex';
  document.getElementById('repName').value = '';
  document.getElementById('repDesc').value = '';
  document.getElementById('repPhone').value = '';
  document.getElementById('repPeople').value = '0';
  document.getElementById('repPhoto').value = '';
  document.getElementById('repType').value = 'LANDSLIDE';
  document.getElementById('repRoadName').value = '';
  document.getElementById('roadBlockedExtra').style.display = 'none';
}

function closeReport() {
  document.getElementById('reportModal').style.display = 'none';
}

function onIncidentTypeChange(type) {
  document.getElementById('roadBlockedExtra').style.display = type === 'ROAD_BLOCKED' ? 'block' : 'none';
}

map.on('click', function(e) {
  if (document.getElementById('reportModal').style.display === 'flex' && !pendingLat) {
    pendingLat = e.latlng.lat; pendingLon = e.latlng.lng;
    document.getElementById('locDisplay').innerHTML =
      '<i class="fa-solid fa-location-dot" style="color:#22c55e;"></i> Location: ' +
      pendingLat.toFixed(4) + ', ' + pendingLon.toFixed(4) + ' ✓ (ab details bharo)';
  }
});

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (file.size > 15 * 1024 * 1024) return reject(new Error('Photo/Video 15 MB se chhoti honi chahiye.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Photo read nahi ho paayi.'));
    reader.readAsDataURL(file);
  });
}

async function submitReport() {
  if (!pendingLat) { alert('Pehle map pe location click karo!'); return; }
  let photoDataUrl = '';
  try { photoDataUrl = await fileAsDataUrl(document.getElementById('repPhoto').files[0]); }
  catch (error) { alert(error.message); return; }
  const incidentType = document.getElementById('repType').value;
  let description = document.getElementById('repDesc').value || 'No description';
  // Prepend road name for ROAD_BLOCKED reports for better reviewer context
  if (incidentType === 'ROAD_BLOCKED') {
    const roadName = (document.getElementById('repRoadName').value || '').trim();
    if (roadName) description = 'Road/Highway: ' + roadName + '. ' + description;
  }
  const data = { lat: pendingLat, lon: pendingLon,
    description, severity: document.getElementById('repSev').value,
    reporter: document.getElementById('repName').value || 'Anonymous', reporter_phone: document.getElementById('repPhone').value,
    incident_type: incidentType, people_at_risk: Number(document.getElementById('repPeople').value || 0), photo_data_url: photoDataUrl };
  fetch(API_BASE + '/report', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  })
  .then(async r => ({ ok: r.ok, body: await r.json() }))
  .then(res => {
    if (!res.ok) throw new Error(res.body.detail || 'Report submit nahi hua.');
    closeReport();
    showToast('✅ Report received. Ref: ' + res.body.report.reference_id + '. Authorities ko automatically dispatch nahi hua hai.');
    drawReports();
    loadConnectivityImpact();
  })
  .catch(error => alert('❌ ' + error.message));
}


function drawReports() {
  reportMarkers.forEach(marker => map.removeLayer(marker));
  reportMarkers = [];
  if (!document.getElementById('showReports')?.checked) return;
  fetch(API_BASE + '/reports')
    .then(r => {
      if (!r.ok) throw new Error('Reports endpoint returned HTTP ' + r.status);
      return r.json();
    })
    .then(reports => {
      reports.filter(rp => (rp.verification_status || 'UNVERIFIED') === 'UNVERIFIED').forEach(rp => {
        let mediaHtml = '';
        if (rp.photo_filename) {
          const mediaUrl = API_BASE + '/uploads/' + rp.photo_filename;
          if (rp.photo_filename.endsWith('.mp4') || rp.photo_filename.endsWith('.webm')) {
            mediaHtml = '<br><video controls style="width:100%; max-height:200px; margin-top:8px; border-radius:4px; background:#000;"><source src="' + mediaUrl + '"></video>';
          } else {
            mediaHtml = '<br><img src="' + mediaUrl + '" style="width:100%; max-height:200px; object-fit:cover; margin-top:8px; border-radius:4px;">';
          }
        }
        
        const marker = L.marker([rp.lat, rp.lon], {
          icon: L.divIcon({className:'', html:'<div class="incident-marker" title="Unverified citizen report">⚠</div>', iconSize: [30, 30], iconAnchor: [15, 15]})
        }).addTo(map).bindPopup(
          '<b>📍 ' + escapeHtml(rp.incident_type || 'Citizen report') + '</b><br>Ref: ' + escapeHtml(rp.reference_id || ('#' + rp.id)) +
          '<br>Status: <b>' + escapeHtml(rp.verification_status || 'UNVERIFIED') + '</b><br>' + escapeHtml(rp.description) +
          '<br>Severity: <b>' + rp.severity + '</b>' +
          '<br>🤖 ML Risk yahan: ' + rp.ml_risk + '% (' + rp.ml_level + ')' +
          mediaHtml +
          '<br><small>Citizen report · ' + escapeHtml(rp.time) + '</small>'
        );
        reportMarkers.push(marker);
      });
    })
    .catch(() => {
      // Keep the map usable when the backend is unavailable or served elsewhere.
      reportMarkers = [];
    });
}

// Service point marker colours by type
const SERVICE_POINT_COLORS = {
  hospital: '#ef4444',        // red
  police: '#3b82f6',          // blue
  rescue_base: '#f97316',     // orange
  shelter: '#22c55e',         // green
  emergency_coordination: '#06b6d4'  // cyan
};
const SERVICE_POINT_ICONS = {
  hospital: '🏥', police: '🚔', rescue_base: '⛑', shelter: '🏠', emergency_coordination: '📡'
};

function loadConnectivityImpact() {
  connectivityLayers.forEach(layer => map.removeLayer(layer));
  connectivityLayers = [];
  selectedCorridorLayers.forEach(layer => map.removeLayer(layer));
  selectedCorridorLayers = [];
  const panel = document.getElementById('connectivityPanel');
  if (!document.getElementById('showConnectivity')?.checked) {
    panel.textContent = 'Connectivity demonstration layer hidden.';
    return;
  }
  panel.textContent = 'Loading road connectivity impact…';
  fetch(API_BASE + '/connectivity-impact')
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      const statusColors = {
        CONFIRMED_BLOCKED: '#ef4444',
        CONFIRMED_HAZARD_NEARBY: '#f97316',
        UNVERIFIED_INCIDENT_NEARBY: '#ec4899',
        NO_REPORTED_DISRUPTION: '#64748b'
      };

      // ── Draw corridor polylines ──
      connectivityCorridors = data.corridors || [];
      connectivityCorridors.forEach(corridor => {
        const color = statusColors[corridor.status] || '#64748b';
        const serviceChips = (corridor.affected_service_types || [])
          .map(t => (SERVICE_POINT_ICONS[t] || '📍') + ' ' + t.replace('_', ' '))
          .join(' · ');
        const riskBadge = corridor.risk_level_nearby && corridor.risk_level_nearby !== 'NONE'
          ? '<br>🔶 ML screening nearby: <b style="color:' + (corridor.risk_level_nearby === 'HIGH' ? '#fca5a5' : '#fdba74') + '">' + corridor.risk_level_nearby + '</b> (' + escapeHtml(corridor.risk_city_nearby || '') + ')'
          : '';
        const altRoute = corridor.alternate_route
          ? '<br>🟢 <small style="color:#86efac">' + escapeHtml(corridor.alternate_route) + '</small>'
          : '';
        const line = L.polyline(corridor.points, {
          color, weight: corridor.status === 'NO_REPORTED_DISRUPTION' ? 4 : 6,
          opacity: 0.88,
          dashArray: corridor.status === 'NO_REPORTED_DISRUPTION' ? '8 7' : null
        }).addTo(map).bindPopup(
          '<b>' + escapeHtml(corridor.name) + '</b>' +
          (corridor.highway_ref ? ' <span style="background:#334155;padding:1px 6px;border-radius:4px;font-size:11px;">' + escapeHtml(corridor.highway_ref) + '</span>' : '') +
          '<br>Category: ' + escapeHtml((corridor.category || '').replace('_', ' ')) +
          (corridor.states_connected ? ' · States: ' + escapeHtml(corridor.states_connected.join(', ')) : '') +
          '<br>Status: <b style="color:' + color + '">' + escapeHtml(corridor.status.replaceAll('_', ' ')) + '</b>' +
          '<br>Priority score: ' + corridor.priority_score +
          ' · Reports nearby: ' + corridor.nearby_report_count +
          ' · People at risk: ' + corridor.reported_people_at_risk +
          (serviceChips ? '<br>Nearby services: ' + escapeHtml(serviceChips) : '') +
          (corridor.village_impact_note ? '<br><small style="color:#94a3b8;">' + escapeHtml(corridor.village_impact_note) + '</small>' : '') +
          riskBadge +
          altRoute +
          '<br><small style="color:#fbbf24;">' + escapeHtml(corridor.action) + '</small>'
        );
        connectivityLayers.push(line);
      });

      // ── Draw service point markers ──
      const seenServicePoints = new Set();
      (data.corridors || []).forEach(corridor => {
        (corridor.nearby_essential_services || []).forEach(sp => {
          const key = sp.lat + ',' + sp.lon;
          if (seenServicePoints.has(key)) return;
          seenServicePoints.add(key);
          const color = SERVICE_POINT_COLORS[sp.type] || '#94a3b8';
          const icon = SERVICE_POINT_ICONS[sp.type] || '📍';
          const marker = L.circleMarker([sp.lat, sp.lon], {
            radius: 7, color: '#0f172a', weight: 1.5,
            fillColor: color, fillOpacity: 0.92
          }).addTo(map).bindPopup(
            icon + ' <b>' + escapeHtml(sp.name) + '</b>' +
            '<br>Type: <b>' + escapeHtml(sp.type.replace('_', ' ')) + '</b>' +
            '<br><small style="color:#94a3b8;">' + escapeHtml(sp.source) + '</small>'
          );
          connectivityLayers.push(marker);
        });
      });

      // ── Build sidebar panel ──
      const corridors = data.corridors || [];
      const total = data.total_corridors || corridors.length;
      const totalSP = data.total_service_points || 0;
      const blockedCount = data.blocked_corridors || 0;
      const disruptedCount = data.disrupted_corridors || 0;
      const summary = data.service_type_summary || {};
      const summaryChips = Object.entries(summary)
        .map(([t, n]) => '<span class="svc-chip svc-chip-' + t + '">' + (SERVICE_POINT_ICONS[t] || '📍') + ' ' + n + '</span>')
        .join('');

      let html = '<b><i class="fa-solid fa-road"></i> Road Connectivity Impact</b>';

      // Header badges: blocked / disrupted count
      html += '<div class="conn-header-badges">';
      if (blockedCount > 0)
        html += '<span class="conn-header-badge blocked">🚫 ' + blockedCount + ' Blocked</span>';
      if (disruptedCount > blockedCount)
        html += '<span class="conn-header-badge disrupted">⚠ ' + (disruptedCount - blockedCount) + ' Disrupted</span>';
      html += '<span class="conn-header-badge ok">' + (total - disruptedCount) + ' Clear</span>';
      html += '</div>';

      html += '<div class="conn-summary">' + total + ' corridors · ' + totalSP + ' service points &nbsp;' + summaryChips + '</div>';
      html += '<span class="connectivity-notice">⚠ SIH demonstration seed · not an official road-authority feed. Verify all road status with authorities before action.</span>';
      html += '<div id="selectedCorridorDetails" class="selected-corridor-details" hidden></div>';

      if (corridors.length === 0) {
        html += '<div class="corridor-card">No corridors loaded.</div>';
      } else {
        corridors.forEach((c, index) => {
          const color = statusColors[c.status] || '#64748b';
          const statusLabel = c.status.replaceAll('_', ' ');
          const svcIcons = (c.affected_service_types || []).map(t => SERVICE_POINT_ICONS[t] || '📍').join(' ');
          const statusClass = 'status-' + c.status;

          html += '<div class="corridor-card ' + statusClass + '" onclick="selectCorridorByIndex(' + index + ')">' +
            '<div class="corridor-card-header">' +
            '<span class="corridor-name">' + escapeHtml(c.name) + '</span>' +
            (c.highway_ref ? '<span class="hw-ref">' + escapeHtml(c.highway_ref) + '</span>' : '') +
            '</div>' +
            '<div class="corridor-status-row">' +
            '<span class="conn-badge ' + c.status + '">' + escapeHtml(statusLabel) + '</span>' +
            '<span class="conn-priority">Priority ' + c.priority_score + '</span>' +
            (c.blockage_report_count > 0 ? '<span class="conn-badge CONFIRMED_BLOCKED">🚫 ' + c.blockage_report_count + ' blockage</span>' : '') +
            '</div>' +
            '<div class="corridor-meta">' +
            (c.states_connected ? escapeHtml(c.states_connected.join(' ↔ ')) + ' · ' : '') +
            (svcIcons ? svcIcons + ' ' + c.nearby_service_count + ' services · ' : '') +
            c.nearby_report_count + ' report(s)' +
            (c.reported_people_at_risk > 0 ? ' · ' + c.reported_people_at_risk + ' at risk' : '') +
            '</div>' +
            (c.village_impact_note ? '<div class="corridor-impact">' + escapeHtml(c.village_impact_note) + '</div>' : '');

          // ML Risk Warning strip
          if (c.risk_level_nearby && c.risk_level_nearby !== 'NONE') {
            html += '<div class="corridor-risk-warning ' + c.risk_level_nearby + '">' +
              '🔶 ML screening: ' + c.risk_level_nearby + ' risk nearby' +
              (c.risk_city_nearby ? ' (' + escapeHtml(c.risk_city_nearby) + ')' : '') +
              '</div>';
          }
          
          if (c.status === 'CONFIRMED_BLOCKED' || c.status === 'CONFIRMED_HAZARD_NEARBY') {
            html += '<button class="card-emergency" style="margin-top: 8px; background: #dc2626; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; width: 100%;" onclick="event.stopPropagation(); findSafeRoute(' + JSON.stringify(c.points) + ')">🛣️ Find Safe Route (Live)</button>';
          }

          // Alternate route (only shown when blocked)
          if (c.alternate_route) {
            html += '<div class="corridor-alternate">🟢 ' + escapeHtml(c.alternate_route) + '</div>';
          }

          // Action line
          if (c.action && c.status !== 'NO_REPORTED_DISRUPTION') {
            html += '<div class="corridor-action">' + escapeHtml(c.action) + '</div>';
          }

          html += '</div>';
        });
      }
      html += '<div class="conn-footer"><small>Status based on local reports + ML screening only · verify with road authorities</small></div>';
      panel.innerHTML = html;
    })
    .catch(() => { panel.textContent = 'Connectivity impact data unavailable — do not assume road conditions are safe.'; });
}

function zoomToCorridor(points) {
  if (!points || points.length === 0) return;
  const latLngs = points.map(p => L.latLng(p[0], p[1]));
  map.fitBounds(L.latLngBounds(latLngs), { padding: [80, 80], maxZoom: 12 });
}

function selectCorridorByIndex(index) {
  const corridor = connectivityCorridors[index];
  if (!corridor || !corridor.points?.length) return;

  selectedCorridorLayers.forEach(layer => map.removeLayer(layer));
  selectedCorridorLayers = [];

  const route = corridor.points.map(point => L.latLng(point[0], point[1]));
  const halo = L.polyline(route, { color: '#ffffff', weight: 14, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  const highlight = L.polyline(route, { color: '#facc15', weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  const start = L.circleMarker(route[0], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }).addTo(map);
  const end = L.circleMarker(route[route.length - 1], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }).addTo(map);
  selectedCorridorLayers = [halo, highlight, start, end];

  const bounds = L.latLngBounds(route);
  map.fitBounds(bounds, { padding: [100, 100], maxZoom: 12, animate: true });
  highlight.bindPopup(buildCorridorDetails(corridor), { maxWidth: 360 }).openPopup();

  document.querySelectorAll('.corridor-card.selected').forEach(card => card.classList.remove('selected'));
  const cards = document.querySelectorAll('.corridor-card');
  if (cards[index]) cards[index].classList.add('selected');
  const detail = document.getElementById('selectedCorridorDetails');
  if (detail) {
    detail.innerHTML = '<b>Selected corridor</b>' + buildCorridorDetails(corridor);
    detail.hidden = false;
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function buildCorridorDetails(corridor) {
  const services = (corridor.affected_service_types || []).map(type => SERVICE_POINT_ICONS[type] || '📍').join(' ');
  return '<strong>' + escapeHtml(corridor.name) + '</strong>' +
    (corridor.highway_ref ? ' <b>' + escapeHtml(corridor.highway_ref) + '</b>' : '') +
    '<br>Status: <b>' + escapeHtml((corridor.status || '').replaceAll('_', ' ')) + '</b>' +
    '<br>Priority: ' + corridor.priority_score + ' · Reports: ' + corridor.nearby_report_count +
    ' · People at risk: ' + corridor.reported_people_at_risk +
    '<br>Services: ' + (services || 'None recorded') +
    (corridor.states_connected ? '<br>Area: ' + escapeHtml(corridor.states_connected.join(' ↔ ')) : '') +
    (corridor.village_impact_note ? '<br><small>' + escapeHtml(corridor.village_impact_note) + '</small>' : '') +
    (corridor.action ? '<br><small style="color:#fbbf24">Action: ' + escapeHtml(corridor.action) + '</small>' : '');
}


function openEmergencyHelp(alert = null) {
  selectedEmergencyLocation = alert;
  const detail = alert ? alert.name + ': ' : '';
  document.getElementById('emergencyLocation').textContent = detail + 'For an immediate threat to life, call the official unified emergency number.';
  const contactsBox = document.getElementById('emergencyContacts');
  contactsBox.textContent = 'Loading verified official contacts…';
  document.getElementById('emergencyModal').style.display = 'flex';
  contactsBox.innerHTML = '';
  const contacts = [
    { name: 'India Emergency (112)', type: 'Police · Fire · Medical · Disaster', scope: 'Pan-India', number: '112', verified_source: 'https://112.gov.in/' },
    { name: 'NDRF — National Disaster Response Force', type: 'National flood & landslide response teams', scope: 'National HQ', number: '011-24363260', verified_source: 'https://www.ndrf.gov.in/' },
    { name: 'NDRF 4th Battalion (NER-dedicated, Guwahati)', type: 'Rapid deployment — flood, landslide, cyclone', scope: 'Northeast India', number: '0361-2343328', verified_source: 'https://www.ndrf.gov.in/' },
    { name: 'NDMA — National Disaster Management Authority', type: 'National coordination & policy', scope: 'National', number: '011-26701700', verified_source: 'https://ndma.gov.in/' },
    { name: 'Ambulance / Medical Emergency', type: 'Medical emergency ambulance', scope: 'Pan-India', number: '108', verified_source: 'https://nhm.gov.in/' },
    { name: 'All State EOCs (universal)', type: 'State Emergency Operation Centres', scope: 'all NER states', number: '1070', verified_source: 'https://ndma.gov.in/' }
  ];
  
  contacts.forEach(contact => {
    const card = document.createElement('div');
    card.className = 'emergency-contact';
    const name = document.createElement('b'); name.textContent = contact.name;
    const description = document.createElement('div'); description.textContent = contact.type + ' · ' + contact.scope;
    const call = document.createElement('a'); call.href = 'tel:' + contact.number; call.textContent = 'Call ' + contact.number;
    const source = document.createElement('a'); source.href = contact.verified_source; source.target = '_blank'; source.rel = 'noopener'; source.textContent = ' Official source ↗';
    card.append(name, description, call, source); contactsBox.appendChild(card);
  });
}

function closeEmergencyHelp() {
  document.getElementById('emergencyModal').style.display = 'none';
}

function openTrackReport() {
  document.getElementById('trackReference').value = '';
  document.getElementById('trackResult').textContent = '';
  document.getElementById('trackModal').style.display = 'flex';
  document.getElementById('trackReference').focus();
}

function closeTrackReport() {
  document.getElementById('trackModal').style.display = 'none';
}

function trackReport() {
  const reference = document.getElementById('trackReference').value.trim();
  const box = document.getElementById('trackResult');
  if (!reference) { box.textContent = 'Reference ID enter karo.'; return; }
  box.textContent = 'Checking…';
  fetch(API_BASE + '/reports/' + encodeURIComponent(reference))
    .then(async response => ({ok: response.ok, body: await response.json()}))
    .then(result => {
      if (!result.ok) throw new Error(result.body.detail || 'Report not found.');
      const report = result.body;
      box.innerHTML = '<b>' + escapeHtml(report.reference_id) + '</b><br>' +
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
  const value = item => item === null || item === undefined || item === '' ? 'Unavailable' : escapeHtml(item);
  const rainValue = item => item === null || item === undefined || item === '' ? 'Unavailable' : escapeHtml(item) + ' mm';
  const rainfall24h = alert.rainfall_24h_mm ?? alert.rainfall_24h;
  const forecastRainfall = alert.forecast_rainfall_mm ?? alert.forecast_rainfall;
  const fresh = alert.weather_fetched_at_utc ? new Date(alert.weather_fetched_at_utc).toLocaleString() : 'Climate simulation / no live timestamp';
  
  document.getElementById('locationDetails').innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:center;"><h4>' + escapeHtml(alert.name) + '</h4>' +
    '<span class="badge ' + escapeHtml(alert.level) + '" style="font-size:14px; padding:6px 12px;">' + value(alert.risk) + '% RISK</span></div>' +
    '<div class="score-explainer" style="margin-top:10px;"><b>Experimental Screening Score: ' + value(alert.risk) + '%</b><br>Terrain Susceptibility: ' + value(alert.susceptibility_score) + '% | Trigger Probability: ' + value(alert.trigger_prob) + '%</div>' +
    
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
    '<div><small>Rain, 24 hours</small>' + value(rainfall24h) + (rainfall24h == null ? '' : ' mm') + '</div>' +
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
      const mockData = [alert.rainfall_mm * 0.5, alert.rainfall_mm * 1.2, alert.rainfall_mm * 0.8, alert.rainfall_mm * 0.3, alert.rainfall_mm * 1.5, rainfall24h ?? alert.rainfall_mm, forecastRainfall ?? alert.rainfall_mm * 1.1];
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
      if (!audit) return;
      const records = result.records || [];
      audit.innerHTML = '<b>Stored observation trail</b>' + (records.length
        ? records.map(record => '<div class="audit-row">' + escapeHtml(new Date(record.fetched_at_utc).toLocaleString()) +
          ' · ' + escapeHtml(record.source) + ' · Obs 24h: ' + rainValue(record.rainfall_24h_mm) + ' · Forecast: ' + rainValue(record.forecast_rainfall_mm) + '</div>').join('')
        : '<div class="audit-row">No stored observations yet.</div>') +
        '<small>Observed rainfall and forecast are retained as separate fields.</small>';
    })
    .catch(() => { const audit = document.getElementById('weatherAudit'); if (audit) audit.textContent = 'Stored observation trail is unavailable.'; });
}
function closeLocationDetails() { document.getElementById('locationModal').style.display = 'none'; }
function openSelectedSafetyGuide() { if (selectedLocationAlert) { closeLocationDetails(); openSafetyGuide(selectedLocationAlert); } }
function openSelectedEmergencyHelp() { if (selectedLocationAlert) { closeLocationDetails(); openEmergencyHelp(selectedLocationAlert); } }

function openMethodPanel() {
  document.getElementById('methodModal').style.display = 'flex';
  const box = document.getElementById('methodHealth');
  box.textContent = 'Loading current data status…';
  fetch(API_BASE + '/data-health')
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(health => {
      const providers = Object.entries(health.provider_counts || {}).map(([source, count]) => `${source}: ${count}`).join(', ') || 'No provider observations yet';
      box.textContent = `Current store: ${health.fresh_locations}/${health.monitored_locations} fresh within ${health.fresh_within_minutes} min; ${health.stale_locations} stale; ${health.missing_locations} missing; provider coverage: ${providers}; fallback records: ${health.fallback_locations}.`;
    })
    .catch(() => { box.textContent = 'Current data-health status unavailable. Do not assume data is current.'; });
}
function closeMethodPanel() { document.getElementById('methodModal').style.display = 'none'; }

// ===== MAP RESIZE FIX (mobile view ke liye) =====
window.addEventListener('resize', function() {
  map.invalidateSize();
});

// ===== START =====
loadAlerts(true);
drawReports();
loadConnectivityImpact();
setTimeout(() => map.invalidateSize(), 500);
setInterval(() => { loadAlerts(currentUseLive); drawReports(); loadConnectivityImpact(); }, DASHBOARD_REFRESH_MS);
setInterval(updateRefreshLabel, 60 * 1000);
let lastVisibilityRefresh = 0;
document.addEventListener('visibilitychange', () => {
  const now = Date.now();
  if (!document.hidden && (now - lastVisibilityRefresh > 60000) && (!lastSuccessfulRefresh || now - lastSuccessfulRefresh.getTime() >= DASHBOARD_REFRESH_MS)) {
    lastVisibilityRefresh = now;
    loadAlerts(currentUseLive); drawReports(); loadConnectivityImpact();
  }
});

// ===== LIVE ROUTING (OSRM) =====
function clearSafeRoute() {
  if (!currentRouteControl) return;
  map.removeControl(currentRouteControl);
  currentRouteControl = null;
}

map.on('click', clearSafeRoute);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') clearSafeRoute();
});

function findSafeRoute(points) {
  if (!points || points.length < 2) return;
  
  clearSafeRoute();
  
  showToast("Calculating safe alternative route...");
  
  const start = points[0];
  const end = points[points.length - 1];
  
  // Create a slight detour by adding a safe midpoint to simulate "avoiding" the block
  const midLat = (start[0] + end[0]) / 2 + 0.1; // Shift north by 0.1 deg
  const midLon = (start[1] + end[1]) / 2 - 0.1; // Shift west by 0.1 deg
  
  currentRouteControl = L.Routing.control({
    waypoints: [
      L.latLng(start[0], start[1]),
      L.latLng(midLat, midLon),
      L.latLng(end[0], end[1])
    ],
    routeWhileDragging: true,
    lineOptions: {
      styles: [{color: '#10b981', opacity: 0.9, weight: 6, dashArray: '10, 10'}]
    },
    createMarker: function() { return null; } // Don't add extra markers
  }).addTo(map);
}

// ===== THEME TOGGLE =====
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const btn = document.getElementById('themeToggle');
  const isLight = document.body.classList.contains('light-mode');
  btn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}
if (localStorage.getItem('theme') === 'light') toggleTheme();

// ===== LANGUAGE SWITCHER (EN/HI) =====
let currentLang = 'en';

const translations = {
  en: {
    dataMethod: '<i class="fa-solid fa-database"></i> Data & Method', emergencyHelp: '<i class="fa-solid fa-phone-volume"></i> Emergency Help', trackReport: '<i class="fa-solid fa-magnifying-glass"></i> Track Report', reportIncident: '<i class="fa-solid fa-triangle-exclamation"></i> Report Incident', resetMapView: '<i class="fa-solid fa-rotate-left"></i> Reset Map View', liveMode: '<i class="fa-solid fa-tower-broadcast"></i> LIVE', simMode: '<i class="fa-solid fa-cloud-showers-heavy"></i> MONSOON SIM', getSmsAlerts: '<i class="fa-solid fa-envelope-open-text"></i> Get SMS/WhatsApp Alerts', showCitizenReports: 'Show unverified citizen incident reports', showRoadConnectivity: 'Show connectivity demonstration corridors', showRainfallHeatmap: 'Show Rainfall Heatmap Layer', showEvacRoutes: 'Show Safe Evacuation Routes', locationIntell: 'Location Intelligence', whatToDo: 'What to do now', emergencyHelpBtn: 'Emergency Help', subscribeTitle: 'Get Priority Alerts', subscribeDesc: 'Receive instant WhatsApp & SMS alerts when risk level changes for your district.', subscribeBtn: 'Subscribe Now', subscribeNote: 'Note: This is a demonstration feature for SIH 2026. No real SMS will be sent.',
    finalProb: 'Screening Score', modelConf: 'Experimental Model', trigger: 'Trigger', emergencyForCity: 'Emergency help for this city', terrainSusc: 'Terrain Susceptibility', rainfallTrig: 'Rainfall Trigger', predWindows: 'Projection Windows', next24h: 'NEXT 24 HOURS', next48h: 'NEXT 48 HOURS', next72h: 'NEXT 72 HOURS', primaryTrigger: 'Primary Trigger', mediaLabel: 'Photo/Video (optional, JPG/PNG/MP4/WebM, max 15 MB)'
  },
  hi: {
    dataMethod: '<i class="fa-solid fa-database"></i> डेटा और तरीका', emergencyHelp: '<i class="fa-solid fa-phone-volume"></i> आपातकालीन मदद', trackReport: '<i class="fa-solid fa-magnifying-glass"></i> रिपोर्ट ट्रैक करें', reportIncident: '<i class="fa-solid fa-triangle-exclamation"></i> घटना की रिपोर्ट करें', resetMapView: '<i class="fa-solid fa-rotate-left"></i> मैप रीसेट करें', liveMode: '<i class="fa-solid fa-tower-broadcast"></i> लाइव (LIVE)', simMode: '<i class="fa-solid fa-cloud-showers-heavy"></i> मानसून सिमुलेशन', getSmsAlerts: '<i class="fa-solid fa-envelope-open-text"></i> SMS/WhatsApp अलर्ट पाएं', showCitizenReports: 'असत्यापित नागरिक घटना रिपोर्ट दिखाएं', showRoadConnectivity: 'सड़क कनेक्टिविटी कॉरिडोर दिखाएं', showRainfallHeatmap: 'बारिश का हीटमैप दिखाएं', showEvacRoutes: 'सुरक्षित निकासी मार्ग दिखाएं', locationIntell: 'स्थान की जानकारी', whatToDo: 'अब क्या करें?', emergencyHelpBtn: 'आपातकालीन मदद', subscribeTitle: 'अलर्ट प्राप्त करें', subscribeDesc: 'जब आपके जिले का जोखिम स्तर बदलेगा तो तुरंत WhatsApp और SMS अलर्ट प्राप्त करें।', subscribeBtn: 'अभी सब्सक्राइब करें', subscribeNote: 'नोट: यह SIH 2026 के लिए एक डेमो है। कोई असली SMS नहीं भेजा जाएगा।',
    finalProb: 'स्क्रीनिंग स्कोर', modelConf: 'प्रायोगिक मॉडल', trigger: 'कारण', emergencyForCity: 'इस शहर के लिए आपातकालीन मदद', terrainSusc: 'इलाके की संवेदनशीलता', rainfallTrig: 'बारिश ट्रिगर', predWindows: 'अनुमानित समय', next24h: 'अगले 24 घंटे', next48h: 'अगले 48 घंटे', next72h: 'अगले 72 घंटे', primaryTrigger: 'मुख्य कारण', mediaLabel: 'फोटो/वीडियो (वैकल्पिक, JPG/PNG/MP4/WebM, अधिकतम 15 MB)'
  }
};

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || (translations['en'][key] || key);
}

function switchLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) el.innerHTML = translations[lang][key];
  });
  if (allAlerts && allAlerts.length > 0) {
    renderAlerts(); // Re-render dynamic cards to apply translation
  }
}

// ===== SUBSCRIBE MODAL =====
function openSubscribeModal() {
  const select = document.getElementById('subDistrict');
  if (allAlerts && allAlerts.length > 0 && select.options.length <= 7) {
    select.innerHTML = '<option value="">Select District...</option>';
    const cities = [...new Set(allAlerts.map(a => a.name))].sort();
    cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      select.appendChild(opt);
    });
  }
  document.getElementById('subscribeModal').style.display = 'flex';
}
function closeSubscribeModal() { document.getElementById('subscribeModal').style.display = 'none'; }
function submitSubscription() {
  const dist = document.getElementById('subDistrict').value;
  const phone = document.getElementById('subPhone').value;
  if (!dist || !phone) return alert('Please select a district and enter your phone number.');
  
  fetch(API_BASE + '/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ district: dist, phone: phone })
  })
  .then(res => res.json())
  .then(data => {
    closeSubscribeModal();
    if (data.status === 'success') {
      showToast('✅ Subscribed! You will receive alerts for ' + dist + '.');
    } else {
      alert('Error: ' + data.message);
    }
  })
  .catch(err => {
    console.error('Subscription error:', err);
    alert('Failed to connect to the server.');
  });
}

// ===== HEATMAP LAYER =====
let heatLayer = null;
function toggleHeatmap() {
  if (document.getElementById('showHeatmap').checked) {
    if (heatLayer) map.removeLayer(heatLayer);
    const heatData = allAlerts.map(a => [a.lat, a.lon, (a.rainfall_mm || 0) * 2]); // intensify for viz
    heatLayer = L.heatLayer(heatData, { radius: 35, blur: 25, maxZoom: 10, gradient: {0.4: 'blue', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red'} }).addTo(map);
  } else {
    if (heatLayer) map.removeLayer(heatLayer);
  }
}

// ===== EVACUATION ROUTES =====
let evacLayers = [];
function toggleEvacRoutes() {
  evacLayers.forEach(l => map.removeLayer(l));
  evacLayers = [];
  if (document.getElementById('showEvacRoutes').checked) {
    const highRiskCities = allAlerts.filter(a => a.level === 'HIGH');
    const safeCities = allAlerts.filter(a => a.level === 'LOW');
    if (safeCities.length === 0) return;
    highRiskCities.forEach(hr => {
      // Find nearest safe city (mock evacuation route)
      let nearest = safeCities[0];
      let minDist = Math.pow(hr.lat - nearest.lat, 2) + Math.pow(hr.lon - nearest.lon, 2);
      safeCities.forEach(sc => {
        const dist = Math.pow(hr.lat - sc.lat, 2) + Math.pow(hr.lon - sc.lon, 2);
        if (dist < minDist) { minDist = dist; nearest = sc; }
      });
      const routeLine = L.polyline([[hr.lat, hr.lon], [nearest.lat, nearest.lon]], {
        color: '#22c55e', weight: 4, dashArray: '10, 10', opacity: 0.9
      }).addTo(map).bindPopup('<b>Mock Evacuation Route</b><br>From: ' + hr.name + '<br>To Safe Zone: ' + nearest.name);
      evacLayers.push(routeLine);
    });
  }
}

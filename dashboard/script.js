// ===== MAP SETUP =====
const map = L.map('map').setView([25.5, 92.5], 6);
const API_BASE = 'http://127.0.0.1:8010';
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'OpenStreetMap'
}).addTo(map);

let markers = [];
let reportMarkers = [];
let connectivityLayers = [];
let allAlerts = [];
let currentState = 'ALL';
let currentUseLive = true;
let selectedLocationAlert = null;
let lastSuccessfulRefresh = null;
const DASHBOARD_REFRESH_MS = 15 * 60 * 1000;

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
    .then(r => r.json())
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
  if (!lastSuccessfulRefresh) { label.textContent = 'Auto-refresh: every 15 minutes.'; return; }
  const ageMinutes = Math.max(0, Math.floor((Date.now() - lastSuccessfulRefresh.getTime()) / 60000));
  label.textContent = `Dashboard refreshed ${ageMinutes === 0 ? 'just now' : ageMinutes + ' min ago'} · Auto-refresh every 15 minutes.`;
}

function loadDataHealth() {
  fetch(API_BASE + '/data-health')
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(health => {
      const box = document.getElementById('dataHealth');
      const live = health.overall_status === 'LIVE_READY';
      box.className = 'data-health ' + (live ? 'live' : 'stale');
      box.textContent = `Data health: ${health.fresh_locations}/${health.monitored_locations} fresh (≤${health.fresh_within_minutes} min) · ${health.stale_locations} stale · ${health.missing_locations} missing · fallback: ${health.fallback_locations}`;
    })
    .catch(() => { document.getElementById('dataHealth').className = 'data-health stale'; document.getElementById('dataHealth').textContent = 'Data health unavailable — do not assume data is current.'; });
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
    const marker = L.circleMarker([alert.lat, alert.lon], {
      radius: 12, color, fillColor: color, fillOpacity: 0.72, weight: 2,
      className: alert.level === 'HIGH' ? 'high-risk-pulse' : ''
    }).addTo(map).bindPopup(
      '<b>' + escapeHtml(alert.name) + '</b><br>Experimental terrain susceptibility score: ' + alert.risk + '%<br>Current rainfall-and-terrain screen: <b>' + alert.level + '</b>' +
      '<br>Rainfall: ' + (alert.rainfall_mm ?? '-') + ' mm/day' +
      '<br>Observed: ' + (alert.rainfall_24h_mm ?? '-') + ' mm / 24h · Forecast: ' + (alert.forecast_rainfall_mm ?? '-') + ' mm' +
      '<br>Status: ' + escapeHtml(alert.weather_status || 'simulation') +
      '<br>Elevation: ' + (alert.elevation_m ?? '-') + ' m · Slope: ' + (alert.slope_pct ?? '-') + '%' +
      '<br><small>' + escapeHtml(alert.data_source || '') + '</small>'
    );
    markers.push(marker);

    const card = document.createElement('div');
    card.className = 'alert-card ' + alert.level;
    card.innerHTML =
      '<div class="city">' + escapeHtml(alert.name) + '</div>' +
      '<div class="risk-line"><span>Experimental susceptibility: <b>' + alert.risk + '%</b></span>' +
      '<span class="badge ' + alert.level + '">Current screen: ' + alert.level + '</span></div>' +
      '<div class="terrain-line">Elevation ' + (alert.elevation_m ?? '-') + ' m · Slope ' + (alert.slope_pct ?? '-') + '% · Rain ' + (alert.rainfall_mm ?? '-') + ' mm/day</div>';
    card.innerHTML += '<div class="score-explainer">Score is an experimental model output—not a landslide probability. The badge is the current rainfall-and-terrain screening level.</div>';
    card.innerHTML += '<div class="terrain-line">Source: ' + escapeHtml(alert.rainfall_source || '') + ' · Obs 24h: ' + (alert.rainfall_24h_mm ?? '-') + ' mm · Fcst: ' + (alert.forecast_rainfall_mm ?? '-') + ' mm</div>';
    const emergencyButton = document.createElement('button');
    emergencyButton.className = 'card-emergency';
    emergencyButton.innerHTML = '<i class="fa-solid fa-phone-volume"></i> Emergency help for this city';
    emergencyButton.onclick = event => { event.stopPropagation(); openEmergencyHelp(alert); };
    const guideButton = document.createElement('button');
    guideButton.className = 'card-guide';
    guideButton.innerHTML = '<i class="fa-solid fa-person-shelter"></i> What to do now';
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
}

function closeReport() {
  document.getElementById('reportModal').style.display = 'none';
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
    if (file.size > 5 * 1024 * 1024) return reject(new Error('Photo 5 MB se chhoti honi chahiye.'));
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
  const data = { lat: pendingLat, lon: pendingLon,
    description: document.getElementById('repDesc').value || 'No description', severity: document.getElementById('repSev').value,
    reporter: document.getElementById('repName').value || 'Anonymous', reporter_phone: document.getElementById('repPhone').value,
    incident_type: document.getElementById('repType').value, people_at_risk: Number(document.getElementById('repPeople').value || 0), photo_data_url: photoDataUrl };
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
    .then(r => r.json())
    .then(reports => {
      reports.filter(rp => (rp.verification_status || 'UNVERIFIED') === 'UNVERIFIED').forEach(rp => {
        const marker = L.marker([rp.lat, rp.lon], {
          icon: L.divIcon({className:'', html:'<div class="incident-marker" title="Unverified citizen report">⚠</div>', iconSize: [30, 30], iconAnchor: [15, 15]})
        }).addTo(map).bindPopup(
          '<b>📍 ' + escapeHtml(rp.incident_type || 'Citizen report') + '</b><br>Ref: ' + escapeHtml(rp.reference_id || ('#' + rp.id)) +
          '<br>Status: <b>' + escapeHtml(rp.verification_status || 'UNVERIFIED') + '</b><br>' + escapeHtml(rp.description) +
          '<br>Severity: <b>' + rp.severity + '</b>' +
          '<br>🤖 ML Risk yahan: ' + rp.ml_risk + '% (' + rp.ml_level + ')' +
          '<br><small>Citizen report · ' + escapeHtml(rp.time) + '</small>'
        );
        reportMarkers.push(marker);
      });
    });
}

function loadConnectivityImpact() {
  connectivityLayers.forEach(layer => map.removeLayer(layer));
  connectivityLayers = [];
  const panel = document.getElementById('connectivityPanel');
  if (!document.getElementById('showConnectivity')?.checked) {
    panel.textContent = 'Connectivity demonstration layer hidden.';
    return;
  }
  panel.textContent = 'Loading road connectivity impact…';
  fetch(API_BASE + '/connectivity-impact')
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      const colors = { CONFIRMED_BLOCKED: '#ef4444', CONFIRMED_HAZARD_NEARBY: '#f97316', UNVERIFIED_INCIDENT_NEARBY: '#ec4899', NO_REPORTED_DISRUPTION: '#64748b' };
      (data.corridors || []).forEach(corridor => {
        const line = L.polyline(corridor.points, { color: colors[corridor.status] || '#64748b', weight: 5, opacity: 0.85, dashArray: corridor.status === 'NO_REPORTED_DISRUPTION' ? '8 7' : null })
          .addTo(map).bindPopup(
            '<b>' + escapeHtml(corridor.name) + '</b><br>Status: <b>' + escapeHtml(corridor.status) + '</b><br>' +
            'Reports nearby: ' + corridor.nearby_report_count + ' · People reported at risk: ' + corridor.reported_people_at_risk +
            '<br><small>' + escapeHtml(corridor.action) + '</small>'
          );
        connectivityLayers.push(line);
      });
      const priority = (data.corridors || []).filter(c => c.priority_score > 0).slice(0, 2);
      panel.innerHTML = '<b><i class="fa-solid fa-road"></i> Connectivity impact</b><br>' +
        '<span class="connectivity-notice">Demo corridors only · not an official road-status feed.</span>' +
        (priority.length ? priority.map(c => '<div class="connectivity-row"><b>' + escapeHtml(c.name) + '</b><br><span class="connectivity-status ' + escapeHtml(c.status) + '">' + escapeHtml(c.status.replaceAll('_', ' ')) + '</span> · Priority ' + c.priority_score + '<br><small>' + c.nearby_report_count + ' report(s), ' + c.reported_people_at_risk + ' people reported at risk</small></div>').join('') :
          '<div class="connectivity-row">No report-based corridor impact currently identified. This is not proof that roads are open.</div>') +
        '<small>Alternate route: ' + escapeHtml(data.alternate_route_status) + '</small>';
    })
    .catch(() => { panel.textContent = 'Connectivity impact data unavailable — do not assume road conditions are safe.'; });
}

function openEmergencyHelp(alert = null) {
  selectedEmergencyLocation = alert;
  const detail = alert ? alert.name + ': ' : '';
  document.getElementById('emergencyLocation').textContent = detail + 'For an immediate threat to life, call the official unified emergency number.';
  const contactsBox = document.getElementById('emergencyContacts');
  contactsBox.textContent = 'Loading verified official contacts…';
  document.getElementById('emergencyModal').style.display = 'flex';
  const state = encodeURIComponent(alert?.state || '');
  fetch(API_BASE + '/emergency-contacts?state=' + state)
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Contacts unavailable')))
    .then(data => {
      contactsBox.innerHTML = '';
      (data.contacts || []).forEach(contact => {
        const card = document.createElement('div');
        card.className = 'emergency-contact';
        const name = document.createElement('b'); name.textContent = contact.name;
        const description = document.createElement('div'); description.textContent = contact.type + ' · ' + contact.scope;
        const call = document.createElement('a'); call.href = 'tel:' + contact.number; call.textContent = 'Call ' + contact.number;
        const source = document.createElement('a'); source.href = contact.verified_source; source.target = '_blank'; source.rel = 'noopener'; source.textContent = ' Official source ↗';
        card.append(name, description, call, source); contactsBox.appendChild(card);
      });
      const note = document.createElement('p'); note.className = 'report-note'; note.textContent = data.notice; contactsBox.appendChild(note);
    })
    .catch(() => { contactsBox.textContent = 'Verified state contacts are unavailable. For immediate danger, call 112.'; });
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
  const value = item => item === null || item === undefined ? '—' : escapeHtml(item);
  const fresh = alert.weather_fetched_at_utc ? new Date(alert.weather_fetched_at_utc).toLocaleString() : 'Climate simulation / no live timestamp';
  document.getElementById('locationDetails').innerHTML =
    '<h4>' + escapeHtml(alert.name) + '</h4>' +
    '<div><b>Current rainfall-and-terrain screen:</b> <span class="badge ' + escapeHtml(alert.level) + '">' + escapeHtml(alert.level) + '</span></div>' +
    '<div class="score-explainer">Experimental terrain susceptibility: <b>' + value(alert.risk) + '%</b>. This is not a landslide probability or official warning.</div>' +
    '<div class="location-grid"><div><small>Rain, 1 hour</small>' + value(alert.rainfall_1h_mm) + ' mm</div><div><small>Rain, 24 hours</small>' + value(alert.rainfall_24h_mm) + ' mm</div><div><small>7-day model input</small>' + value(alert.rainfall_mm) + ' mm/day avg</div><div><small>Forecast (next day)</small>' + value(alert.forecast_rainfall_mm) + ' mm</div><div><small>Elevation</small>' + value(alert.elevation_m) + ' m</div><div><small>Slope</small>' + value(alert.slope_pct) + '%</div></div>' +
    '<div class="location-source"><b>Data source:</b> ' + escapeHtml(alert.rainfall_source || alert.data_source || 'Unavailable') + '<br><b>Data status:</b> ' + escapeHtml(alert.weather_status || 'simulation') + '<br><b>Updated:</b> ' + escapeHtml(fresh) + '</div>' +
    '<div class="weather-audit" id="weatherAudit">Loading stored observation trail…</div>';
  document.getElementById('locationModal').style.display = 'flex';
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
          ' · ' + escapeHtml(record.source) + ' · Obs 24h: ' + value(record.rainfall_24h_mm) + ' mm · Forecast: ' + value(record.forecast_rainfall_mm) + ' mm</div>').join('')
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!lastSuccessfulRefresh || Date.now() - lastSuccessfulRefresh.getTime() >= DASHBOARD_REFRESH_MS)) {
    loadAlerts(currentUseLive); drawReports(); loadConnectivityImpact();
  }
});

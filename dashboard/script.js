// ===== MAP SETUP =====
const map = L.map('map').setView([25.5, 92.5], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'OpenStreetMap'
}).addTo(map);

let markers = [];

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== LOAD ALERTS =====
function loadAlerts(useLive) {
  document.getElementById('btnLive').classList.toggle('active', useLive);
  document.getElementById('btnSim').classList.toggle('active', !useLive);
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const loader = document.getElementById('loader');
  loader.style.display = 'block';   // spinner ON

  const url = 'http://127.0.0.1:8000/alerts' + (useLive ? '' : '?use_live=false');
  fetch(url)
    .then(r => r.json())
    .then(alerts => {
      loader.style.display = 'none';  // spinner OFF
      let high = 0;
      const box = document.getElementById('alerts');
      box.innerHTML = '';
      alerts.forEach(a => {
        if (a.level === 'HIGH') high++;
        const color = a.level === 'HIGH' ? '#ef4444' : (a.level === 'MEDIUM' ? '#f59e0b' : '#22c55e');

        const marker = L.circleMarker([a.lat, a.lon], {
          radius: 14, color: color, fillColor: color, fillOpacity: 0.7, weight: 2,
          className: a.level === 'HIGH' ? 'high-risk-pulse' : ''   // pulse on HIGH
        }).addTo(map).bindPopup(
          '<b>' + a.name + '</b><br>Risk: ' + a.risk + '%<br>Level: ' + a.level +
          '<br>Rainfall: ' + (a.rainfall_mm || '-') + 'mm' +
          '<br><small>' + (a.data_source || '') + '</small>'
        );
        markers.push(marker);

        const card = document.createElement('div');
        card.className = 'alert-card ' + a.level;
        card.innerHTML =
          '<div class="city">' + a.name + '</div>' +
          '<div class="risk-line"><span>Risk: <b>' + a.risk + '%</b></span>' +
          '<span class="badge ' + a.level + '">' + a.level + '</span></div>';
        card.onclick = () => { map.setView([a.lat, a.lon], 9); marker.openPopup(); };
        box.appendChild(card);
      });
      document.getElementById('total').textContent = alerts.length;
      document.getElementById('high').textContent = high;
    })
    .catch(err => {
      loader.style.display = 'none';
      document.getElementById('alerts').innerHTML =
        '<div class="alert-card">❌ API se connect nahi hua. Server chalao:<br><code>python -m uvicorn app:app --reload</code></div>';
    });
}

// ===== CITIZEN REPORT =====
let pendingLat = null, pendingLon = null;

function startReport() {
  pendingLat = null; pendingLon = null;
  document.getElementById('locDisplay').innerHTML = '<i class="fa-solid fa-location-dot"></i> Pehle map pe location click karo...';
  document.getElementById('reportModal').style.display = 'flex';
  document.getElementById('repName').value = '';
  document.getElementById('repDesc').value = '';
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

function submitReport() {
  if (!pendingLat) { alert('Pehle map pe location click karo!'); return; }
  const data = {
    lat: pendingLat, lon: pendingLon,
    description: document.getElementById('repDesc').value || 'No description',
    severity: document.getElementById('repSev').value,
    reporter: document.getElementById('repName').value || 'Anonymous'
  };
  fetch('http://127.0.0.1:8000/report', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  })
  .then(r => r.json())
  .then(res => {
    closeReport();
    showToast('✅ Report saved! ML Risk: ' + res.report.ml_risk + '% (' + res.report.ml_level + ')');
    drawReports();
  })
  .catch(() => alert('❌ API se connect nahi hua — server chal raha hai?'));
}

function drawReports() {
  fetch('http://127.0.0.1:8000/reports')
    .then(r => r.json())
    .then(reports => {
      reports.forEach(rp => {
        L.marker([rp.lat, rp.lon], {
          icon: L.divIcon({className:'', html:'<div style="font-size:28px;">📍</div>'})
        }).addTo(map).bindPopup(
          '<b>📍 Citizen Report #' + rp.id + '</b><br>' + rp.description +
          '<br>Severity: <b>' + rp.severity + '</b>' +
          '<br>🤖 ML Risk yahan: ' + rp.ml_risk + '% (' + rp.ml_level + ')' +
          '<br><small>' + rp.reporter + ' · ' + rp.time + '</small>'
        );
      });
    });
}

// ===== MAP RESIZE FIX (mobile view ke liye) =====
window.addEventListener('resize', function() {
  map.invalidateSize();
});


// ===== START =====
// ===== START =====
loadAlerts(true);
drawReports();
setTimeout(() => map.invalidateSize(), 500);   

/* ═══════════════════════════════════════════
   BOUNCEMAP — app.js
   Full application logic: map, physics, geocoding,
   spin wheel, multiplayer, audio, panels
═══════════════════════════════════════════ */

'use strict';

// ── Country Data ──────────────────────────────────────────────────────────
const COUNTRIES = {
  bangladesh: { name:'Bangladesh', flag:'🇧🇩', bounds:[[20.74,88.01],[26.63,92.67]], center:[23.685,90.3563], zoom:7 },
  india:       { name:'India',     flag:'🇮🇳', bounds:[[8.4,68.7],[37.1,97.4]],     center:[20.5937,78.9629], zoom:5 },
  pakistan:    { name:'Pakistan',  flag:'🇵🇰', bounds:[[23.6,60.9],[37.1,77.8]],    center:[30.3753,69.3451], zoom:6 },
  usa:         { name:'United States', flag:'🇺🇸', bounds:[[24.4,-124.8],[49.4,-66.9]], center:[37.09,-95.71], zoom:4 },
  uk:          { name:'United Kingdom', flag:'🇬🇧', bounds:[[49.9,-6.4],[58.7,1.8]], center:[55.378,-3.436],  zoom:6 },
  france:      { name:'France',    flag:'🇫🇷', bounds:[[42.3,-4.8],[51.1,8.2]],     center:[46.227,2.213],   zoom:6 },
  germany:     { name:'Germany',   flag:'🇩🇪', bounds:[[47.3,5.9],[55.1,15.0]],     center:[51.165,10.451],  zoom:6 },
  japan:       { name:'Japan',     flag:'🇯🇵', bounds:[[24.2,122.9],[45.5,145.8]],  center:[36.204,138.252], zoom:5 },
  brazil:      { name:'Brazil',    flag:'🇧🇷', bounds:[[-33.8,-73.9],[5.3,-34.8]], center:[-14.235,-51.925], zoom:4 },
  australia:   { name:'Australia', flag:'🇦🇺', bounds:[[-43.6,113.3],[-10.7,153.6]], center:[-25.274,133.775], zoom:4 },
  canada:      { name:'Canada',    flag:'🇨🇦', bounds:[[41.7,-141.0],[83.1,-52.6]], center:[56.13,-106.34],  zoom:4 },
  china:       { name:'China',     flag:'🇨🇳', bounds:[[18.2,73.5],[53.6,134.8]],  center:[35.861,104.195], zoom:4 },
  indonesia:   { name:'Indonesia', flag:'🇮🇩', bounds:[[-11.0,95.0],[6.1,141.0]],  center:[-0.789,113.921], zoom:5 },
  nigeria:     { name:'Nigeria',   flag:'🇳🇬', bounds:[[4.3,2.7],[13.9,14.7]],     center:[9.082,8.675],    zoom:6 },
  kenya:       { name:'Kenya',     flag:'🇰🇪', bounds:[[-4.7,33.9],[5.0,41.9]],    center:[-0.023,37.906],  zoom:6 }
};

const TOKEN_COLORS = ['#e63946','#2f7be8','#22c55e','#f5a623','#a855f7','#06b6d4','#f97316','#ec4899'];

// ── State ─────────────────────────────────────────────────────────────────
let state = {
  currentCountry: 'bangladesh',
  activeLayer: 'streets',
  multiMode: false,
  zoneMode: false,
  soundOn: true,
  animating: false,
  bounceCount: 0,
  sessionStart: Date.now(),
  history: JSON.parse(localStorage.getItem('bm_history') || '[]'),
  favorites: JSON.parse(localStorage.getItem('bm_favorites') || '[]'),
  lastLanded: null,
  spinResult: null,
  markers: [],
  zoneLayer: null
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const canvas = $('token-canvas');
const ctx = canvas.getContext('2d');

// ── Landing ↔ App routing ──────────────────────────────────────────────────
function showApp() {
  $('landing-screen').style.display = 'none';
  $('app-screen').classList.remove('hidden');
  initMap();
  startSessionTimer();
}
function showLanding() {
  $('app-screen').classList.add('hidden');
  $('landing-screen').style.display = '';
}

['nav-launch-btn','hero-launch-btn','final-launch-btn'].forEach(id => {
  $(id).addEventListener('click', showApp);
});
$('back-to-landing').addEventListener('click', showLanding);
$('hero-demo-btn').addEventListener('click', () => {
  showApp();
  setTimeout(() => launchBounce(), 800);
});

// ── Map setup ────────────────────────────────────────────────────────────
let map, layers;

function initMap() {
  if (map) return;

  layers = {
    streets:   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom:19 }),
    terrain:   L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom:17 })
  };

  map = L.map('map', { zoomControl:true, attributionControl:false });
  layers.streets.addTo(map);
  const c = COUNTRIES[state.currentCountry];
  map.setView(c.center, c.zoom);

  map.on('click', e => {
    if (state.animating) return;
    const { lat, lng } = e.latlng;
    const b = COUNTRIES[state.currentCountry].bounds;
    if (lat >= b[0][0] && lat <= b[1][0] && lng >= b[0][1] && lng <= b[1][1]) {
      doLand([lat, lng]);
    }
  });

  renderHistory();
  renderFavorites();
}

// ── Layer toggle ───────────────────────────────────────────────────────────
document.querySelectorAll('.vbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!map) return;
    map.removeLayer(layers[state.activeLayer]);
    state.activeLayer = btn.dataset.layer;
    layers[state.activeLayer].addTo(map);
    document.querySelectorAll('.vbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Country select ────────────────────────────────────────────────────────
$('country-select').addEventListener('change', e => {
  state.currentCountry = e.target.value;
  if (!map) return;
  clearAllMarkers();
  $('info-card').classList.add('hidden');
  state.lastLanded = null;
  if (state.zoneLayer) { map.removeLayer(state.zoneLayer); state.zoneLayer = null; }
  const c = COUNTRIES[state.currentCountry];
  map.flyTo(c.center, c.zoom, { duration:1.2 });
  if (state.zoneMode) drawZones();
});

// ── Canvas resize ─────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Sound ─────────────────────────────────────────────────────────────────
function playBounce() {
  if (!state.soundOn) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [[0,.18,220],[.12,.14,260],[.22,.1,300],[.30,.07,340],[.36,.05,380]].forEach(([t, dec, freq]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(dec, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + dec);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + dec + .01);
    });
  } catch {}
}

function playLand() {
  if (!state.soundOn) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(440, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ac.currentTime + .15);
    g.gain.setValueAtTime(.3, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .6);
    o.start(); o.stop(ac.currentTime + .6);
    setTimeout(() => {
      const o2 = ac.createOscillator(), g2 = ac.createGain();
      o2.connect(g2); g2.connect(ac.destination);
      o2.type = 'triangle'; o2.frequency.value = 1320;
      g2.gain.setValueAtTime(.12, ac.currentTime);
      g2.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .3);
      o2.start(); o2.stop(ac.currentTime + .3);
    }, 130);
  } catch {}
}

$('sound-toggle').addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  $('sound-toggle').textContent = state.soundOn ? '🔊' : '🔇';
});

// ── Token Animation ───────────────────────────────────────────────────────
function drawTokenAt(x, y, scale, rotation, color = '#e63946') {
  const R = 22;
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(scale, scale);

  // Shadow
  ctx.shadowBlur = 20;
  ctx.shadowColor = color + '88';

  // Body gradient
  const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, R);
  grad.addColorStop(0, lightenColor(color, 40));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darkenColor(color, 40));
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();

  // White border
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 2.5; ctx.stroke();
  ctx.shadowBlur = 0;

  // Shine
  ctx.beginPath();
  ctx.arc(-5, -6, R * .42, Math.PI * 1.1, Math.PI * 1.75);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 3; ctx.stroke();

  // Emoji
  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎯', 0, 1);
  ctx.restore();
}

function lightenColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.min(255, ((n >> s) & 0xff) + amt).toString(16).padStart(2,'0')).join('');
}
function darkenColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.max(0, ((n >> s) & 0xff) - amt).toString(16).padStart(2,'0')).join('');
}

function animateToken(targetLatLng, color, onLand) {
  const targetPx = map.latLngToContainerPoint(L.latLng(targetLatLng[0], targetLatLng[1]));
  const W = canvas.width, H = canvas.height;
  const startX = W / 2 + (Math.random() - .5) * 80;
  const startY = -40;
  const endX = targetPx.x, endY = targetPx.y;
  const TOTAL = 2400;

  // Build bounce arc segments
  const numBounces = 5;
  const segRatios = [.30,.17,.14,.12,.10,.17];
  const sumR = segRatios.reduce((a,b)=>a+b,0);
  const segs = [];
  let cum = 0;
  let px = startX, py = startY;

  for (let i = 0; i <= numBounces; i++) {
    const dur = (segRatios[i] / sumR) * TOTAL;
    const progress = (i + 1) / (numBounces + 1);
    let nx = i === numBounces ? endX : startX + (endX - startX) * progress;
    let ny = i === numBounces ? endY : H * (.3 + .5 * progress) - 60 * (1 - progress);
    segs.push({ t0: cum, dur, x0: px, y0: py, x1: nx, y1: ny, _snd: false, _lnd: false });
    cum += dur; px = nx; py = ny;
  }

  function ease(t) { return t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; }
  function easeInQ(t) { return t * t; }
  function easeOutB(t) {
    if(t<1/2.75) return 7.5625*t*t;
    if(t<2/2.75){t-=1.5/2.75; return 7.5625*t*t+.75}
    if(t<2.5/2.75){t-=2.25/2.75; return 7.5625*t*t+.9375}
    t-=2.625/2.75; return 7.5625*t*t+.984375;
  }

  let start = null;
  function frame(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;
    ctx.clearRect(0, 0, W, H);

    let cx = startX, cy = startY, sc = 1, rot = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (elapsed >= s.t0 && elapsed < s.t0 + s.dur) {
        const t = (elapsed - s.t0) / s.dur;
        cx = s.x0 + (s.x1 - s.x0) * ease(t);
        if (i === 0) cy = s.y0 + (s.y1 - s.y0) * easeInQ(t);
        else if (i === segs.length - 1) cy = s.y0 + (s.y1 - s.y0) * easeOutB(t);
        else {
          const peak = Math.min(s.y0, s.y1) - 70 * (1 - i / segs.length);
          cy = peak + (s.y0 - peak) * Math.pow(2 * t - 1, 2);
        }
        sc = 1 + Math.abs(s.y1 - s.y0) / s.dur * 0.0001 * Math.sin(t * Math.PI);
        rot = (elapsed / 500 % 1) * Math.PI * 2;
        if (t > .9 && i < segs.length - 1 && !s._snd) { playBounce(); s._snd = true; }
        break;
      } else if (i === segs.length - 1 && elapsed >= s.t0 + s.dur) {
        cx = s.x1; cy = s.y1; sc = 1; rot = 0;
        if (!s._lnd) { playLand(); s._lnd = true; }
      }
    }

    drawTokenAt(cx, cy, sc, rot, color);
    if (elapsed < TOTAL) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); onLand(); }
  }
  requestAnimationFrame(frame);
}

// ── Markers ───────────────────────────────────────────────────────────────
function createMarker(latlng, color = '#e63946') {
  const icon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:28px;height:40px">
      <div style="position:absolute;top:-8px;left:-8px;width:44px;height:44px;border-radius:50%;border:2px solid ${color};opacity:.45;animation:pulseGlow 2.5s ease-out infinite"></div>
      <div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,${lightenColor(color,30)},${color});border:3px solid #fff;box-shadow:0 4px 14px ${color}66"></div>
      <div style="width:10px;height:4px;border-radius:50%;background:rgba(0,0,0,.2);margin:4px auto 0;filter:blur(2px)"></div>
    </div>`,
    iconSize: [28, 40],
    iconAnchor: [14, 40]
  });
  return L.marker(latlng, { icon });
}

function clearAllMarkers() {
  state.markers.forEach(m => map.removeLayer(m));
  state.markers = [];
}

// ── Geocoding ─────────────────────────────────────────────────────────────
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`);
    const d = await r.json();
    const a = d.address || {};
    const name = a.city || a.town || a.village || a.hamlet || a.county || a.state_district || a.state || 'Unknown Area';
    const district = a.county || a.state_district || a.district || a.state || '';
    const country = a.country || '';
    return { name, district, country };
  } catch {
    return { name: 'Remote Location', district: '', country: '' };
  }
}

// ── Main land function ─────────────────────────────────────────────────────
async function doLand(latlng, color = '#e63946', addHistory = true) {
  const btn = $('bounce-btn');
  btn.disabled = true;
  state.animating = true;
  clearAllMarkers();
  $('info-card').classList.add('hidden');

  animateToken(latlng, color, async () => {
    const marker = createMarker(latlng, color).addTo(map);
    state.markers.push(marker);

    const geo = await reverseGeocode(latlng[0], latlng[1]);
    state.lastLanded = { latlng, geo };

    const cInfo = COUNTRIES[state.currentCountry];
    $('place-name').textContent = geo.name;
    $('place-district').textContent = [geo.district, geo.country].filter(Boolean).join(', ') || '—';
    $('place-coords').textContent = `${latlng[0].toFixed(6)}, ${latlng[1].toFixed(6)}`;
    $('info-flag').textContent = cInfo.flag;
    $('save-fav-btn').textContent = '★ Save';
    $('save-fav-btn').classList.remove('saved');

    const ic = $('info-card');
    ic.classList.remove('hidden');
    ic.classList.remove('fade-in');
    void ic.offsetWidth;
    ic.classList.add('fade-in');

    if (addHistory) {
      state.bounceCount++;
      $('bounce-count').textContent = state.bounceCount;
      const item = { name: geo.name, district: geo.district, country: geo.country, lat: latlng[0], lng: latlng[1], ts: Date.now() };
      state.history.unshift(item);
      if (state.history.length > 50) state.history.pop();
      localStorage.setItem('bm_history', JSON.stringify(state.history));
      renderHistory();
    }

    map.flyTo(latlng, 13, { duration: 1.5 });
    state.animating = false;
    btn.disabled = false;
  });
}

// ── Random point in bounds ─────────────────────────────────────────────────
function randomInBounds(bounds) {
  const lat = bounds[0][0] + Math.random() * (bounds[1][0] - bounds[0][0]);
  const lng = bounds[0][1] + Math.random() * (bounds[1][1] - bounds[0][1]);
  return [lat, lng];
}

// ── Bounce button ─────────────────────────────────────────────────────────
$('bounce-btn').addEventListener('click', launchBounce);

function launchBounce() {
  if (state.animating || !map) return;
  if (state.multiMode) {
    launchMulti();
  } else {
    const pt = randomInBounds(COUNTRIES[state.currentCountry].bounds);
    doLand(pt, '#e63946');
  }
}

// ── Multiplayer ───────────────────────────────────────────────────────────
$('multi-toggle').addEventListener('click', () => {
  state.multiMode = !state.multiMode;
  const btn = $('multi-toggle');
  btn.textContent = state.multiMode ? 'ON' : 'OFF';
  btn.classList.toggle('on', state.multiMode);
  $('multi-options').classList.toggle('hidden', !state.multiMode);
  if (state.multiMode) updateTokenPreview();
});

$('multi-slider').addEventListener('input', () => {
  $('multi-val').textContent = $('multi-slider').value;
  updateTokenPreview();
});

function updateTokenPreview() {
  const n = parseInt($('multi-slider').value);
  $('token-preview').innerHTML = TOKEN_COLORS.slice(0, n).map(c =>
    `<div class="tp-dot" style="background:${c}"></div>`
  ).join('');
}
updateTokenPreview();

function launchMulti() {
  if (!map) return;
  const btn = $('bounce-btn');
  btn.disabled = true;
  state.animating = true;
  clearAllMarkers();
  const n = parseInt($('multi-slider').value);
  const pts = Array.from({ length: n }, () => randomInBounds(COUNTRIES[state.currentCountry].bounds));
  let done = 0;

  pts.forEach((pt, i) => {
    setTimeout(() => {
      const color = TOKEN_COLORS[i % TOKEN_COLORS.length];
      animateToken(pt, color, async () => {
        const marker = createMarker(pt, color).addTo(map);
        state.markers.push(marker);
        done++;
        if (done === n) {
          const bounds = L.latLngBounds(pts);
          map.flyToBounds(bounds, { padding:[60,60], duration:1.5 });
          state.bounceCount += n;
          $('bounce-count').textContent = state.bounceCount;
          state.animating = false;
          btn.disabled = false;
        }
      });
    }, i * 350);
  });
}

// ── Probability Zones ──────────────────────────────────────────────────────
$('zone-toggle').addEventListener('click', () => {
  state.zoneMode = !state.zoneMode;
  const btn = $('zone-toggle');
  btn.textContent = state.zoneMode ? 'ON' : 'OFF';
  btn.classList.toggle('on', state.zoneMode);
  $('zone-options').classList.toggle('hidden', !state.zoneMode);
  if (!map) return;
  if (state.zoneMode) drawZones();
  else if (state.zoneLayer) { map.removeLayer(state.zoneLayer); state.zoneLayer = null; }
});

function drawZones() {
  if (!map) return;
  if (state.zoneLayer) map.removeLayer(state.zoneLayer);
  const b = COUNTRIES[state.currentCountry].bounds;
  const latR = b[1][0] - b[0][0], lngR = b[1][1] - b[0][1];
  const zoneData = [
    { color: '#e63946', opacity: .18, lat: b[0][0] + latR*.3, lng: b[0][1] + lngR*.3, rLat: latR*.35, rLng: lngR*.35 },
    { color: '#f5a623', opacity: .14, lat: b[0][0] + latR*.6, lng: b[0][1] + lngR*.65, rLat: latR*.28, rLng: lngR*.28 },
    { color: '#22c55e', opacity: .11, lat: b[0][0] + latR*.15, lng: b[0][1] + lngR*.75, rLat: latR*.22, rLng: lngR*.22 }
  ];
  const layers_z = zoneData.map(z => {
    const pts = [];
    for (let a = 0; a <= 360; a += 8) {
      const rad = a * Math.PI / 180;
      pts.push([z.lat + z.rLat * Math.sin(rad), z.lng + z.rLng * Math.cos(rad)]);
    }
    return L.polygon(pts, { color: z.color, fillColor: z.color, fillOpacity: z.opacity, weight: 1.5, opacity: .35 });
  });
  state.zoneLayer = L.layerGroup(layers_z).addTo(map);
}

// ── History & Favorites rendering ─────────────────────────────────────────
function renderHistory() {
  const list = $('history-list');
  if (!state.history.length) {
    list.innerHTML = '<div class="empty-state">No bounces yet — hit the button!</div>';
    return;
  }
  list.innerHTML = state.history.slice(0, 30).map((h, i) => `
    <div class="list-item" onclick="flyTo(${h.lat},${h.lng})">
      <span class="li-name">${h.name}</span>
      <span class="li-meta">${h.lat.toFixed(2)},${h.lng.toFixed(2)}</span>
      <button class="li-del" onclick="event.stopPropagation();removeHistory(${i})">✕</button>
    </div>
  `).join('');
}

function renderFavorites() {
  const list = $('fav-list');
  if (!state.favorites.length) {
    list.innerHTML = '<div class="empty-state">Save locations to build your atlas</div>';
    return;
  }
  list.innerHTML = state.favorites.map((f, i) => `
    <div class="list-item" onclick="flyTo(${f.lat},${f.lng})">
      <span class="li-star">★</span>
      <span class="li-name">${f.name}</span>
      <button class="li-del" onclick="event.stopPropagation();removeFavorite(${i})">✕</button>
    </div>
  `).join('');
}

window.flyTo = (lat, lng) => { if (map) map.flyTo([lat, lng], 12, { duration: 1.2 }); };
window.removeHistory = i => { state.history.splice(i, 1); localStorage.setItem('bm_history', JSON.stringify(state.history)); renderHistory(); };
window.removeFavorite = i => { state.favorites.splice(i, 1); localStorage.setItem('bm_favorites', JSON.stringify(state.favorites)); renderFavorites(); };

$('clear-history-btn').addEventListener('click', () => { state.history = []; localStorage.removeItem('bm_history'); renderHistory(); });
$('clear-favs-btn').addEventListener('click', () => { state.favorites = []; localStorage.removeItem('bm_favorites'); renderFavorites(); });

// ── Save favorite ─────────────────────────────────────────────────────────
$('save-fav-btn').addEventListener('click', () => {
  if (!state.lastLanded) return;
  const { latlng, geo } = state.lastLanded;
  if (state.favorites.find(f => Math.abs(f.lat - latlng[0]) < .001 && Math.abs(f.lng - latlng[1]) < .001)) return;
  state.favorites.push({ name: geo.name, district: geo.district, country: geo.country, lat: latlng[0], lng: latlng[1] });
  localStorage.setItem('bm_favorites', JSON.stringify(state.favorites));
  renderFavorites();
  const btn = $('save-fav-btn');
  btn.textContent = '✓ Saved!';
  btn.classList.add('saved');
  showToast('Location saved to favorites!');
});

// ── Share & Copy ──────────────────────────────────────────────────────────
$('share-btn').addEventListener('click', () => {
  if (!state.lastLanded) return;
  const { latlng, geo } = state.lastLanded;
  const url = `https://www.openstreetmap.org/?mlat=${latlng[0]}&mlon=${latlng[1]}#map=14/${latlng[0]}/${latlng[1]}`;
  navigator.clipboard.writeText(`BounceMap landed on: ${geo.name}${geo.district ? ', '+geo.district : ''} (${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)})\n${url}`).then(() => showToast('Location info copied!'));
});

$('copy-coords-btn').addEventListener('click', () => {
  if (!state.lastLanded) return;
  const { latlng } = state.lastLanded;
  navigator.clipboard.writeText(`${latlng[0].toFixed(6)}, ${latlng[1].toFixed(6)}`).then(() => showToast('Coordinates copied!'));
});

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ── Help overlay ──────────────────────────────────────────────────────────
$('help-btn').addEventListener('click', () => $('help-overlay').classList.remove('hidden'));
$('help-close').addEventListener('click', () => $('help-overlay').classList.add('hidden'));
$('help-backdrop').addEventListener('click', () => $('help-overlay').classList.add('hidden'));

// ── Spin Wheel ────────────────────────────────────────────────────────────
const SPIN_SEGS = [
  { label:'🌾 Farmlands', color:'#22c55e' },
  { label:'🏙 City',      color:'#2f7be8' },
  { label:'🌊 Riverside', color:'#06b6d4' },
  { label:'🏔 Mountains', color:'#6366f1' },
  { label:'🌿 Village',   color:'#84cc16' },
  { label:'🌴 Forest',    color:'#15803d' },
  { label:'⛰ Uplands',   color:'#f97316' },
  { label:'🏖 Coast',     color:'#f5a623' }
];
let spinAngle = 0, spinning = false;

function drawSpinWheel(angle) {
  const sc = $('spin-canvas'), sctx = sc.getContext('2d');
  const cx = 150, cy = 150, r = 138;
  sctx.clearRect(0, 0, 300, 300);
  const arc = Math.PI * 2 / SPIN_SEGS.length;
  SPIN_SEGS.forEach((seg, i) => {
    sctx.beginPath();
    sctx.moveTo(cx, cy);
    sctx.arc(cx, cy, r, angle + arc * i, angle + arc * (i + 1));
    sctx.closePath();
    sctx.fillStyle = seg.color;
    sctx.fill();
    sctx.strokeStyle = 'rgba(255,255,255,.25)';
    sctx.lineWidth = 1.5;
    sctx.stroke();

    sctx.save();
    sctx.translate(cx, cy);
    sctx.rotate(angle + arc * i + arc / 2);
    sctx.textAlign = 'right';
    sctx.fillStyle = 'rgba(255,255,255,.95)';
    sctx.font = 'bold 13px "DM Sans", sans-serif';
    sctx.fillText(seg.label, r - 12, 5);
    sctx.restore();
  });

  // Outer ring
  sctx.beginPath(); sctx.arc(cx, cy, r, 0, Math.PI * 2);
  sctx.strokeStyle = 'rgba(255,255,255,.2)'; sctx.lineWidth = 3; sctx.stroke();
  sctx.beginPath(); sctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  sctx.strokeStyle = 'rgba(0,0,0,.15)'; sctx.lineWidth = 2; sctx.stroke();
}

drawSpinWheel(0);

$('spin-trigger').addEventListener('click', () => {
  $('spin-overlay').classList.remove('hidden');
  $('spin-result-display').classList.add('hidden');
  $('spin-and-bounce-btn').classList.add('hidden');
  $('spin-btn').disabled = false;
});
$('spin-close').addEventListener('click', () => $('spin-overlay').classList.add('hidden'));
$('spin-backdrop').addEventListener('click', () => $('spin-overlay').classList.add('hidden'));

$('spin-btn').addEventListener('click', () => {
  if (spinning) return;
  spinning = true;
  $('spin-btn').disabled = true;
  $('spin-result-display').classList.add('hidden');
  $('spin-and-bounce-btn').classList.add('hidden');

  const extra = 4 + Math.random() * 5;
  const target = spinAngle + extra * Math.PI * 2 + Math.random() * Math.PI * 2;
  const dur = 3200, t0 = performance.now();
  const from = spinAngle;

  function frame(ts) {
    const t = Math.min((ts - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    spinAngle = from + (target - from) * ease;
    drawSpinWheel(spinAngle);
    if (t < 1) { requestAnimationFrame(frame); return; }

    const n = SPIN_SEGS.length, arc = Math.PI * 2 / n;
    const norm = ((-spinAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.floor(norm / arc) % n;
    state.spinResult = SPIN_SEGS[idx].label;
    $('spin-result-badge').textContent = state.spinResult;
    $('spin-result-display').classList.remove('hidden');
    $('spin-and-bounce-btn').classList.remove('hidden');
    spinning = false;
    $('spin-btn').disabled = false;
    playLand();
  }
  requestAnimationFrame(frame);
});

$('spin-and-bounce-btn').addEventListener('click', () => {
  $('spin-overlay').classList.add('hidden');
  launchBounce();
});

// ── Session Timer ─────────────────────────────────────────────────────────
function startSessionTimer() {
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    $('session-timer').textContent = `${m}:${s}`;
  }, 1000);
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ($('app-screen').classList.contains('hidden')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); launchBounce(); }
  if (e.key === 'Escape') {
    $('help-overlay').classList.add('hidden');
    $('spin-overlay').classList.add('hidden');
  }
  if (e.key === 'm' || e.key === 'M') $('multi-toggle').click();
  if (e.key === 's' || e.key === 'S') $('sound-toggle').click();
  if (e.key === '?') $('help-btn').click();
});

// ── Initial render ────────────────────────────────────────────────────────
renderHistory();
renderFavorites();
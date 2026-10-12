/* global island, icon, weatherInfo, Terminal, FitAddon, WebglAddon */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { if (!isFinite(s) || s < 0) return '0:00'; s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtBytes = (b) => { const u = ['o', 'Ko', 'Mo', 'Go', 'To']; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; } return `${b.toFixed(b < 10 && i ? 1 : 0)} ${u[i]}`; };
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + ' k' : String(n);
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const islandEl = $('#island');
let mode = 'collapsed';
const DEMO = !!new URLSearchParams(location.search).get('demo');
let tab = localStorage.getItem('tab') || 'home';

// ================= etats replie / apercu / deploye =================
let pointerInside = false, leaveTimer = null, peekTimer = null, captured = false;
function setCapture(on) { if (on !== captured) { captured = on; island.captureMouse(on); } }
function setMode(m) {
  if (m === mode) return;
  if (DEMO && m !== 'expanded') return;
  mode = m;
  islandEl.className = m;
  if (m === 'expanded') { showTab(tab); refreshForTab(); }
  if (m === 'collapsed') { island.collapsed(); if (!pointerInside) setCapture(false); }
  tick();
}
function insideIsland(x, y) {
  const r = islandEl.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function typingSomewhere() {
  const a = document.activeElement;
  return document.hasFocus() && a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && mode === 'expanded';
}
document.addEventListener('mousemove', (e) => {
  const inside = insideIsland(e.clientX, e.clientY);
  setCapture(inside);
  if (inside && !pointerInside) {
    pointerInside = true; clearTimeout(leaveTimer);
    if (mode === 'collapsed') peekTimer = setTimeout(() => setMode('peek'), 90);
  } else if (!inside && pointerInside) {
    pointerInside = false; clearTimeout(peekTimer);
    leaveTimer = setTimeout(() => {
      if (pointerInside) return;
      if (mode === 'peek') setMode('collapsed');
      else if (mode === 'expanded' && !typingSomewhere()) setMode('collapsed');
    }, mode === 'expanded' ? 650 : 250);
  }
});
document.addEventListener('mouseleave', () => document.dispatchEvent(new MouseEvent('mousemove', { clientX: -1, clientY: -1 })));
window.addEventListener('blur', () => { if (!DEMO && mode === 'expanded' && !pointerInside) setMode('collapsed'); });
$('#pill').addEventListener('click', (e) => { if (!e.target.closest('button')) setMode('expanded'); });
$('#pill').addEventListener('wheel', (e) => { if (e.deltaY > 0) setMode('expanded'); }, { passive: true });
$('#tabs').addEventListener('wheel', (e) => { if (e.deltaY < 0) setMode('peek'); }, { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'expanded') setMode('collapsed'); });
// Rangee au-dessus de l'ecran quand une fenetre maximisee est devant
island.onTuck((on) => {
  document.body.classList.toggle('tucked', on);
  if (on) { setCapture(false); pointerInside = false; }
});
island.onReveal(() => {
  setMode('peek');
  setTimeout(() => { if (!pointerInside && mode === 'peek') setMode('collapsed'); }, 1500);
});
island.onToggle(() => {
  if (mode === 'expanded') setMode('collapsed');
  else { setMode('expanded'); island.focusWindow(); }
});

// ================= onglets =================
$$('#tabs button').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.tab); refreshForTab(); }));
function showTab(t) {
  tab = t; localStorage.setItem('tab', t);
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === t));
  if (t === 'term') openTerminal();
  if (t === 'claude') setTimeout(() => $('#chat-text').focus(), 50);
  if (t === 'apps') setTimeout(() => $('#app-search').focus(), 50);
}
function refreshForTab() {
  if (tab === 'home') { pollVolume(); pollStats(); }
  if (tab === 'today') { renderToday(); loadCalendar(); loadWeather(); }
  if (tab === 'stats') pollStats();
  if (tab === 'clip') renderClips();
  if (tab === 'apps') loadApps();
  if (tab === 'claude') loadUsage();
}

// ================= horloge + boucle =================
function tick() {
  const now = new Date();
  $('#pill-clock').textContent = hhmm(now);
  if (mode === 'expanded' && tab === 'today') $('#t-time').textContent = `${hhmm(now)}:${pad(now.getSeconds())}`;
  renderMediaTime();
}
setInterval(tick, 1000);

// ================= media =================
let media = { present: false }, mediaKey = null, thumb = null, posBase = { raw: null, pos: 0, t: 0 };
async function pollMedia() {
  try {
    const m = await island.helper('media', thumb ? mediaKey : null);
    if (m.present) {
      if (m.key !== mediaKey || !thumb) { mediaKey = m.key; thumb = m.thumb || null; }
      if (m.position !== posBase.raw) posBase = { raw: m.position, pos: m.position, t: Date.now() };
    } else { mediaKey = null; thumb = null; }
    media = m;
    renderMedia();
  } catch { }
}
function mediaPlaying() { return media.present && media.status === 'Playing'; }
function appLabel(id) {
  if (!id) return '';
  const known = { 'youtube-music': 'YouTube Music', spotify: 'Spotify', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', zunemusic: 'Lecteur multimédia', vlc: 'VLC', discord: 'Discord' };
  const low = id.toLowerCase();
  for (const k in known) if (low.includes(k)) return known[k];
  return id.split(/[!\\.]/).filter(Boolean).pop();
}
function renderMedia() {
  const playing = mediaPlaying();
  $('#eq').classList.toggle('on', playing);
  const pp = $('#pill-play');
  pp.classList.toggle('show', media.present);
  pp.innerHTML = icon(playing ? 'pause' : 'play', 14);
  if (media.present) {
    $('#pill-title').textContent = media.title || 'Lecture';
    $('#pill-sub').textContent = [media.artist, appLabel(media.app)].filter(Boolean).join(' · ');
  } else {
    $('#pill-title').textContent = new Date().toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
    $('#pill-sub').textContent = 'Survole ou fais défiler pour ouvrir';
  }
  const art = $('#pill-art');
  if (thumb) { art.src = thumb; art.classList.add('has'); } else { art.removeAttribute('src'); art.classList.remove('has'); }

  $('#m-title').textContent = media.present ? (media.title || 'Sans titre') : 'Rien en lecture';
  $('#m-artist').textContent = media.present ? (media.artist || '') : 'Lance de la musique ou une vidéo';
  $('#m-app').textContent = media.present ? appLabel(media.app) : '';
  $('#m-toggle').innerHTML = icon(playing ? 'pause' : 'play', 20);
  const mart = $('#m-art');
  if (thumb) { mart.src = thumb; mart.style.visibility = 'visible'; $('.media-card').style.setProperty('--art-bg', `url("${thumb}")`); }
  else { mart.removeAttribute('src'); mart.style.visibility = 'hidden'; $('.media-card').style.removeProperty('--art-bg'); }
  renderMediaTime();
}
function renderMediaTime() {
  if (!media.present || !media.duration) { $('#m-bar').style.width = '0'; $('#m-pos').textContent = ''; $('#m-dur').textContent = ''; return; }
  let pos = posBase.pos + (mediaPlaying() ? (Date.now() - posBase.t) / 1000 : 0);
  pos = Math.min(pos, media.duration);
  $('#m-bar').style.width = (100 * pos / media.duration) + '%';
  $('#m-pos').textContent = fmtTime(pos); $('#m-dur').textContent = fmtTime(media.duration);
}
$$('[data-media]').forEach(b => {
  if (b.dataset.media !== 'toggle') b.innerHTML = icon(b.dataset.media, 20);
  b.addEventListener('click', async () => { await island.helper('media-cmd', b.dataset.media).catch(() => { }); setTimeout(pollMedia, 250); });
});
$('#pill-play').addEventListener('click', async () => { await island.helper('media-cmd', 'toggle').catch(() => { }); setTimeout(pollMedia, 250); });
(function mediaLoop() { pollMedia().finally(() => setTimeout(mediaLoop, mode === 'collapsed' ? 2500 : 1000)); })();

// ================= volume =================
const vol = $('#vol');
let volDragging = false, volSendTimer = null;
function paintVol(v, muted) {
  vol.style.setProperty('--p', v + '%');
  $('#vol-val').textContent = muted ? 'muet' : v + '%';
  $('#mute').innerHTML = icon(muted || v == 0 ? 'mute' : 'vol', 18);
}
async function pollVolume() {
  if (volDragging) return;
  try { const v = await island.helper('volume'); vol.value = v.level; vol.dataset.muted = v.muted; paintVol(v.level, v.muted); } catch { }
}
vol.addEventListener('input', () => {
  volDragging = true; paintVol(+vol.value, false);
  clearTimeout(volSendTimer);
  volSendTimer = setTimeout(async () => {
    await island.helper('volume-set', +vol.value).catch(() => { });
    if (vol.dataset.muted === 'true') { await island.helper('mute', false).catch(() => { }); vol.dataset.muted = 'false'; }
    volDragging = false;
  }, 60);
});
$('#mute').addEventListener('click', async () => {
  const m = vol.dataset.muted !== 'true';
  await island.helper('mute', m).catch(() => { }); pollVolume();
});
setInterval(() => { if (mode === 'expanded' && tab === 'home') pollVolume(); }, 3000);

// ================= actions rapides =================
const QUICK = [
  ['snip', 'Capture', 'ms-screenclip:'], ['task', 'Tâches', 'taskmgr'], ['folder', 'Fichiers', 'explorer'], ['gear', 'Paramètres', 'ms-settings:'],
  ['calc', 'Calcul', 'calc'], ['term', 'Terminal', 'terminal'], ['wifi', 'Wi-Fi', 'ms-availablenetworks:'], ['bell', 'Notifs', 'ms-actioncenter:'],
];
$('#quick').innerHTML = QUICK.map(([i, l, u]) => `<button data-uri="${u}">${icon(i, 20)}<span>${l}</span></button>`).join('');
$$('#quick button').forEach(b => b.addEventListener('click', () => { island.openUri(b.dataset.uri); setMode('collapsed'); }));

// ================= stats =================
const hist = { cpu: [], gpu: [], net: [] };
const push = (a, v) => { a.push(v); if (a.length > 60) a.shift(); };
let lastStats = null;
async function pollStats() {
  try { lastStats = await island.stats(); } catch { return; }
  const s = lastStats;
  push(hist.cpu, s.cpu.load); push(hist.gpu, s.gpu ? s.gpu.util : 0); push(hist.net, s.net ? s.net.down : 0);
  renderMiniStats(); if (tab === 'stats') renderStats();
}
setInterval(() => { if (mode === 'expanded' && (tab === 'stats' || tab === 'home')) pollStats(); }, 2000);
function spark(arr, color, max) {
  if (arr.length < 2) return '';
  const m = max || Math.max(1, ...arr);
  const w = 100, h = 40, n = 60;
  const pts = arr.map((v, i) => [w * (i + n - arr.length) / (n - 1), h - (h - 2) * Math.min(1, v / m)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
  const id = 'g' + color.replace(/[^a-z0-9]/gi, '');
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L100 40 L${pts[0][0].toFixed(2)} 40 Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
}
const tempColor = (t) => t == null ? 'var(--muted)' : t >= 85 ? 'var(--bad)' : t >= 72 ? 'var(--warn)' : 'var(--good)';
function renderMiniStats() {
  const s = lastStats; if (!s) return;
  const ramPct = Math.round(100 * (1 - s.ram.free / s.ram.total));
  const items = [['CPU', s.cpu.load, '%'], ['GPU', s.gpu ? s.gpu.util : null, '%'], ['RAM', ramPct, '%']];
  $('#mini-stats').innerHTML = items.map(([l, v, u]) => `<div class="mini-stat"><div class="eyebrow">${l}</div><b>${v ?? '—'}</b><small>${v != null ? u : ''}</small><div class="bar"><i style="width:${v || 0}%"></i></div></div>`).join('');
}
function renderStats() {
  const s = lastStats; if (!s) { $('#stats-grid').innerHTML = '<div class="empty">Chargement…</div>'; return; }
  const ramUsed = s.ram.total - s.ram.free;
  const g = s.gpu;
  const up = s.uptime, upTxt = `${Math.floor(up / 86400) ? Math.floor(up / 86400) + ' j ' : ''}${Math.floor(up % 86400 / 3600)} h ${Math.floor(up % 3600 / 60)} min`;
  $('#stats-grid').innerHTML = `
    <div class="card stat">${spark(hist.cpu, '#8fb6ff', 100)}
      <div class="eyebrow">Processeur</div><div class="big">${s.cpu.load}<small>%</small></div>
      <div class="sub">${esc(s.cpu.model.replace(/\s+w\/.*$/i, ''))}</div>
      <div class="rows"><div>Température <b style="color:${tempColor(s.cpu.temp)}">${s.cpu.temp != null ? Math.round(s.cpu.temp) + ' °C' : 'LHM inactif'}</b></div></div>
    </div>
    <div class="card stat">${spark(hist.gpu, '#7fdca4', 100)}
      <div class="eyebrow">Carte graphique</div><div class="big">${g ? g.util : '—'}<small>%</small></div>
      <div class="sub">${g ? esc(g.name.replace(/NVIDIA GeForce /, '')) : 'nvidia-smi indisponible'}</div>
      ${g ? `<div class="rows"><div>Température <b style="color:${tempColor(g.temp)}">${g.temp} °C</b></div><div>Puissance <b>${g.power != null ? g.power.toFixed(0) + ' W' : '—'}</b></div></div>` : ''}
    </div>
    <div class="card stat">
      <div class="eyebrow">Mémoire</div><div class="big">${(ramUsed / 1073741824).toFixed(1)}<small>/ ${(s.ram.total / 1073741824).toFixed(0)} Go</small></div>
      <div class="bar" style="margin-top:12px"><i style="width:${100 * ramUsed / s.ram.total}%"></i></div>
      ${g ? `<div class="rows"><div>VRAM <b>${(g.memUsed / 1024).toFixed(1)} / ${(g.memTotal / 1024).toFixed(0)} Go</b></div><div class="bar"><i style="width:${100 * g.memUsed / g.memTotal}%;background:var(--good)"></i></div></div>` : ''}
    </div>
    <div class="card stat">${spark(hist.net, '#e7c46e')}
      <div class="eyebrow">Réseau</div><div class="big">${s.net ? fmtBytes(s.net.down).replace(' ', '<small>') + '/s</small>' : '—'}</div>
      <div class="sub">↓ réception</div>
      <div class="rows"><div>↑ Envoi <b>${s.net ? fmtBytes(s.net.up) + '/s' : '—'}</b></div></div>
    </div>
    <div class="card stat">
      <div class="eyebrow">Disques</div>
      ${s.disks.map(d => { const used = d.total - d.free; return `<div class="disk"><div class="lbl"><b>${d.name}</b><span>${fmtBytes(d.free)} libres sur ${fmtBytes(d.total)}</span></div><div class="bar"><i style="width:${100 * used / d.total}%;background:${used / d.total > .9 ? 'var(--bad)' : 'var(--soul)'}"></i></div></div>`; }).join('')}
    </div>
    <div class="card stat">
      <div class="eyebrow">Système</div><div class="big" style="font-size:24px">${upTxt}</div>
      <div class="sub">depuis le démarrage</div>
      <div class="rows"><div>Threads <b>${s.cpu.cores}</b></div><div>Mode GPU <b>${g ? 'NVIDIA actif' : '—'}</b></div></div>
    </div>`;
}

// ================= aujourd'hui =================
function renderToday() {
  const now = new Date();
  $('#t-day').textContent = now.toLocaleDateString('fr-CA', { weekday: 'long' });
  $('#t-date').textContent = now.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });
  $('#t-time').textContent = `${hhmm(now)}:${pad(now.getSeconds())}`;
  renderTodos();
}
async function loadWeather() {
  const w = await island.weather().catch(() => null);
  const el = $('#weather');
  if (!w || !w.current) { el.innerHTML = `<div class="setup">Météo indisponible (pas de réseau ?). Tu peux mettre une ville de secours dans <code>config.json</code> → <code>weather.fallback</code>.</div>`; return; }
  const c = w.current, now = weatherInfo(c.weather_code, c.is_day);
  const days = w.daily.time.slice(1, 4).map((d, i) => {
    const k = i + 1, wi = weatherInfo(w.daily.weather_code[k]);
    return `<div class="w-day">${new Date(d + 'T12:00').toLocaleDateString('fr-CA', { weekday: 'short' })}<span class="e">${wi.e}</span><b>${Math.round(w.daily.temperature_2m_max[k])}°</b> ${Math.round(w.daily.temperature_2m_min[k])}°</div>`;
  }).join('');
  el.innerHTML = `
    <div class="eyebrow" title="${w.source === 'ip' ? 'Position estimée par ton adresse IP' : 'Ville de la config'}">${w.source === 'ip' ? '📍 ' : ''}${esc(w.city || 'Météo')}</div>
    <div class="w-now"><span class="e">${now.e}</span><div><b>${Math.round(c.temperature_2m)}°</b><div class="muted" style="font-size:11.5px">${now.label} · ressenti ${Math.round(c.apparent_temperature)}°</div></div></div>
    <div class="muted" style="font-size:11.5px">Max ${Math.round(w.daily.temperature_2m_max[0])}° · min ${Math.round(w.daily.temperature_2m_min[0])}° · pluie ${w.daily.precipitation_probability_max[0] ?? 0} %</div>
    <div class="w-days">${days}</div>`;
}
async function loadCalendar(force) {
  const el = $('#agenda-list');
  if (!el.innerHTML) el.innerHTML = '<div class="empty">Chargement…</div>';
  const cal = await island.calendar(force).catch(e => ({ configured: true, events: [], errors: [e.message] }));
  if (!cal.configured) {
    el.innerHTML = `<div class="setup">Pour voir ton Google Agenda ici :<br>1. Google Agenda → Paramètres → ton agenda → <b>Adresse secrète au format iCal</b><br>2. Colle-la dans <code>config.json</code> → <code>calendars</code><br>3. Icône de l'island dans la barre des tâches → <b>Recharger</b></div>`;
    return;
  }
  const now = new Date(); const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
  const byDay = new Map();
  for (const ev of cal.events) {
    const s = new Date(ev.start), e = new Date(ev.end);
    for (let d = new Date(Math.max(s, today0)); d < e || +d === +s; d.setDate(d.getDate() + 1)) {
      const k = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (k - today0 >= 7 * 864e5) break;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(ev);
      if (!ev.allDay) break;
      if (+d === +s && e - s <= 864e5) break;
    }
  }
  if (!byDay.size) { el.innerHTML = `<div class="empty">Rien de prévu cette semaine 🎉${cal.errors?.length ? '<br><small>' + esc(cal.errors[0]) + '</small>' : ''}</div>`; return; }
  el.innerHTML = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([k, evs]) => {
    const d = new Date(k), diff = Math.round((k - today0) / 864e5);
    const label = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' });
    return `<div class="day-head ${diff === 0 ? 'today' : ''}">${label}</div>` + evs.map(ev => {
      const s = new Date(ev.start), e = new Date(ev.end);
      const cls = !ev.allDay && e < now ? 'past' : (!ev.allDay && s <= now && e > now ? 'now' : '');
      return `<div class="ev ${cls}"><div class="t">${ev.allDay ? 'jour' : hhmm(s)}</div><div class="dot" ${ev.color ? `style="background:${esc(ev.color)}"` : ''}></div><div><div class="n">${esc(ev.title)}</div>${ev.location ? `<div class="l">${esc(ev.location)}</div>` : ''}</div></div>`;
    }).join('');
  }).join('');
}
$('#cal-refresh').innerHTML = icon('refresh', 14);
$('#cal-refresh').addEventListener('click', () => loadCalendar(true));

let todos = [];
island.todos().then(t => { todos = t || []; });
function renderTodos() {
  const done = todos.filter(t => t.done).length;
  $('#todo-count').textContent = `${done}/${todos.length}`;
  $('#todo-list').innerHTML = todos.length ? todos.map((t, i) => `
    <div class="todo-item ${t.done ? 'done' : ''}" data-i="${i}">
      <button class="box">${t.done ? icon('check', 12) : ''}</button><span class="txt">${esc(t.text)}</span>
      <button class="del icon-btn small">${icon('x', 12)}</button></div>`).join('') : '<div class="empty">Rien à faire. Profite.</div>';
}
$('#todo-list').addEventListener('click', (e) => {
  const item = e.target.closest('.todo-item'); if (!item) return;
  const i = +item.dataset.i;
  if (e.target.closest('.del')) todos.splice(i, 1); else todos[i].done = !todos[i].done;
  island.todosSave(todos); renderTodos();
});
$('#todo-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) { todos.push({ text: e.target.value.trim(), done: false }); e.target.value = ''; island.todosSave(todos); renderTodos(); }
});

// ================= presse-papiers =================
let clips = [];
island.clipList().then(c => clips = c);
island.onClip(c => { clips = c; if (mode === 'expanded' && tab === 'clip') renderClips(); });
function ago(t) { const s = (Date.now() - t) / 1000; return s < 60 ? "à l'instant" : s < 3600 ? `il y a ${Math.floor(s / 60)} min` : `il y a ${Math.floor(s / 3600)} h`; }
function renderClips() {
  const q = $('#clip-search').value.toLowerCase();
  const list = clips.filter(c => !q || c.text.toLowerCase().includes(q));
  $('#clip-list').innerHTML = list.length ? list.map(c => `
    <div class="clip" data-at="${c.at}"><div class="body">${esc(c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text)}</div>
    <div class="meta">${ago(c.at)}</div><button class="del icon-btn small" title="Retirer">${icon('x', 12)}</button></div>`).join('')
    : `<div class="empty">${clips.length ? 'Aucun résultat' : 'Copie du texte (Ctrl+C) : il apparaîtra ici.'}</div>`;
}
$('#clip-search').addEventListener('input', renderClips);
$('#clip-list').addEventListener('click', async (e) => {
  const el = e.target.closest('.clip'); if (!el) return;
  const at = +el.dataset.at;
  if (e.target.closest('.del')) { clips = await island.clipRemove(at); renderClips(); return; }
  const c = clips.find(c => c.at === at); if (!c) return;
  await island.clipCopy(c.text);
  el.classList.add('copied'); el.querySelector('.meta').textContent = 'Copié ✓';
  setTimeout(() => setMode('collapsed'), 500);
});
$('#clip-clear').addEventListener('click', async () => { clips = await island.clipClear(); renderClips(); });

// ================= apps =================
let apps = null, favs = [];
const iconObserver = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const el = en.target; iconObserver.unobserve(el);
    island.appIcon(el.dataset.path).then(u => { if (u) { const img = document.createElement('img'); img.src = u; el.replaceWith(img); } });
  }
});
async function loadApps() {
  if (!apps) { const r = await island.appsList(); apps = r.apps; favs = r.favorites; }
  renderApps();
}
function appTile(a, isFav) {
  return `<button class="app" data-path="${esc(a.path)}" title="${esc(a.name)}"><div class="ph" data-path="${esc(a.path)}"></div><span>${esc(a.name)}</span>
    <i class="fav icon-btn small ${isFav ? 'on' : ''}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${icon('star', 13)}</i></button>`;
}
function renderApps() {
  const q = $('#app-search').value.trim().toLowerCase();
  const favApps = favs.map(p => apps.find(a => a.path === p)).filter(Boolean);
  $('#app-favs').innerHTML = q ? '' : favApps.map(a => appTile(a, true)).join('');
  const list = apps.filter(a => !q || a.name.toLowerCase().includes(q)).slice(0, 120);
  $('#app-list').innerHTML = list.map(a => appTile(a, favs.includes(a.path))).join('') || '<div class="empty">Aucune appli trouvée</div>';
  $$('.app .ph').forEach(el => iconObserver.observe(el));
}
$('#app-search').addEventListener('input', renderApps);
$('#app-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = $('#app-list .app'); if (first) { island.appLaunch(first.dataset.path); e.target.value = ''; setMode('collapsed'); } }
});
document.addEventListener('click', async (e) => {
  const tile = e.target.closest('.app'); if (!tile) return;
  const p = tile.dataset.path;
  if (e.target.closest('.fav')) { favs = await island.appFav(p, !favs.includes(p)); renderApps(); return; }
  island.appLaunch(p); $('#app-search').value = ''; setMode('collapsed');
});

// ================= terminal =================
let term = null, fit = null;
const MOCHA = {
  background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e', selectionBackground: '#585b7088',
  black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
  brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
};
function openTerminal() {
  if (term) { setTimeout(() => { fit.fit(); term.focus(); }, 60); return; }
  term = new Terminal({ fontFamily: '"JetBrainsMono Nerd Font", "Cascadia Mono", monospace', fontSize: 13, lineHeight: 1.15, cursorStyle: 'bar', cursorBlink: true, theme: MOCHA, allowProposedApi: true, scrollback: 5000 });
  fit = new FitAddon.FitAddon(); term.loadAddon(fit);
  term.open($('#term'));
  try { const gl = new WebglAddon.WebglAddon(); gl.onContextLoss(() => gl.dispose()); term.loadAddon(gl); } catch { /* repli sur le rendu DOM */ }
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && e.key === 'c' && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); return false; }
    if (e.ctrlKey && e.key === 'v') { navigator.clipboard.readText().then(t => island.ptyWrite(t)); return false; }
    if (e.key === 'Escape') return true;
    return true;
  });
  term.onData(d => island.ptyWrite(d));
  island.onPtyData(d => term.write(d));
  island.onPtyExit(() => { term.write('\r\n\x1b[90m[session terminée — rouvre l\'onglet pour relancer]\x1b[0m\r\n'); ptyRunning = false; });
  new ResizeObserver(() => { if (tab === 'term' && mode === 'expanded') { try { fit.fit(); island.ptyResize(term.cols, term.rows); } catch { } } }).observe($('#term'));
  setTimeout(startPty, 80);
}
let ptyRunning = false;
async function startPty() {
  fit.fit();
  if (!ptyRunning) { ptyRunning = true; await island.ptyStart(term.cols, term.rows); }
  term.focus();
}
$('[data-tab="term"]').addEventListener('click', () => { if (term && !ptyRunning) startPty(); });

// ================= Claude =================
let chatCont = false, chatBusy = false, aiEl = null, aiText = '', renderQueued = false;
function md(src) {
  const blocks = src.split(/```/);
  return blocks.map((b, i) => {
    if (i % 2) { const nl = b.indexOf('\n'); return `<pre><code>${esc(nl >= 0 ? b.slice(nl + 1) : b)}</code></pre>`; }
    return b.split(/\n{2,}/).map(p => {
      const lines = p.split('\n');
      const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<i>$2</i>');
      if (lines.every(l => /^\s*([-*]|\d+\.)\s/.test(l) || !l.trim())) {
        const ordered = /^\s*\d+\./.test(lines[0]);
        return `<${ordered ? 'ol' : 'ul'}>${lines.filter(l => l.trim()).map(l => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
      }
      if (/^#{1,4}\s/.test(lines[0])) return `<p><b>${inline(lines[0].replace(/^#+\s/, ''))}</b>${lines.length > 1 ? '<br>' + lines.slice(1).map(inline).join('<br>') : ''}</p>`;
      return p.trim() ? `<p>${lines.map(inline).join('<br>')}</p>` : '';
    }).join('');
  }).join('');
}
function addMsg(cls, html) {
  const log = $('#chat-log'); $('.chat-empty', log)?.remove();
  const el = document.createElement('div'); el.className = 'msg ' + cls; el.innerHTML = html; log.appendChild(el);
  log.scrollTop = log.scrollHeight; return el;
}
function paintAi() {
  renderQueued = false; if (!aiEl) return;
  aiEl.innerHTML = md(aiText); aiEl.classList.toggle('typing', chatBusy);
  const log = $('#chat-log'); log.scrollTop = log.scrollHeight;
}
async function sendChat() {
  const ta = $('#chat-text'); const text = ta.value.trim();
  if (!text || chatBusy) return;
  ta.value = ''; addMsg('user', esc(text));
  aiText = ''; aiEl = addMsg('ai typing', '');
  chatBusy = true; $('#chat-send').textContent = 'Arrêter';
  const ok = await island.claudeAsk(text, chatCont);
  if (!ok) { chatBusy = false; $('#chat-send').textContent = 'Envoyer'; }
}
island.onClaude(({ type, data }) => {
  if (type === 'delta') { aiText += data; if (!renderQueued) { renderQueued = true; requestAnimationFrame(paintAi); } }
  else if (type === 'result') {
    if (data.text && !aiText) aiText = data.text;
    if (data.error) addMsg('err', esc(data.text || 'Erreur'));
    chatCont = true;
  } else if (type === 'error') addMsg('err', esc(data));
  else if (type === 'done') { chatBusy = false; $('#chat-send').textContent = 'Envoyer'; paintAi(); if (!aiText && aiEl) aiEl.remove(); loadUsage(); }
});
$('#chat-send').addEventListener('click', () => chatBusy ? island.claudeStop() : sendChat());
$('#chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
$('#chat-new').addEventListener('click', () => {
  if (chatBusy) return;
  chatCont = false; $('#chat-log').innerHTML = '<div class="chat-empty">Nouvelle conversation.</div>'; $('#chat-text').focus();
});

async function loadUsage() {
  const u = await island.claudeUsage().catch(() => null);
  const el = $('#usage');
  if (!u) { el.innerHTML = '<div class="empty">Journaux introuvables</div>'; return; }
  const max = Math.max(1, ...u.days.map(d => d.out));
  const resetAt = u.windowStart ? new Date(u.windowStart + 5 * 3600e3) : null;
  const models = Object.entries(u.models).sort((a, b) => b[1].out - a[1].out).slice(0, 3)
    .map(([m, v]) => `<div class="u-row"><span>${esc(m.replace(/^claude-/, ''))}</span><b>${fmtTok(v.out)}</b></div>`).join('');
  el.innerHTML = `
    <div><div class="eyebrow">Claude Code · aujourd'hui</div>
      <div class="u-big" style="margin-top:6px">${fmtTok(u.today.out)}<small>jetons générés</small></div></div>
    <div style="display:grid;gap:5px">
      <div class="u-row"><span>Requêtes</span><b>${u.today.n}</b></div>
      <div class="u-row"><span>Sessions</span><b>${u.sessionsToday}</b></div>
      <div class="u-row"><span>Contexte lu (cache)</span><b>${fmtTok(u.today.cr)}</b></div>
      <div class="u-row"><span>Fenêtre 5 h</span><b>${fmtTok(u.last5h.out)}</b></div>
      ${resetAt ? `<div class="u-row"><span>Fin de fenêtre ≈</span><b>${hhmm(resetAt)}</b></div>` : ''}
    </div>
    ${models ? `<div style="display:grid;gap:5px"><div class="eyebrow">Modèles</div>${models}</div>` : ''}
    <div class="u-bars">${u.days.map((d, i) => `<div class="${i === 6 ? 'today' : ''}" title="${fmtTok(d.out)} jetons"><i style="height:${Math.max(2, 100 * d.out / max)}%"></i><span>${new Date(d.day).toLocaleDateString('fr-CA', { weekday: 'narrow' })}</span></div>`).join('')}</div>`;
}
setInterval(() => { if (mode === 'expanded' && tab === 'claude') loadUsage(); }, 30000);

// ================= alimentation =================
const POWER = [['lock', 'Verrouiller', false], ['sleep', 'Veille', false], ['signout', 'Déconnexion', true], ['restart', 'Redémarrer', true], ['shutdown', 'Éteindre', true]];
const POWER_ICON = { lock: 'lock', sleep: 'moon', signout: 'logout', restart: 'restart', shutdown: 'power' };
$('#power-grid').innerHTML = POWER.map(([a, l, hold]) => `<button class="pw ${hold ? 'danger' : ''}" data-a="${a}" data-hold="${hold}"><span class="fill"></span>${icon(POWER_ICON[a], 26)}<span>${l}</span></button>`).join('');
$$('.pw').forEach(b => {
  let t = null;
  const fire = () => { setMode('collapsed'); island.power(b.dataset.a); };
  if (b.dataset.hold === 'false') { b.addEventListener('click', fire); return; }
  const cancel = () => { clearTimeout(t); b.classList.remove('holding'); };
  b.addEventListener('pointerdown', () => { b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); fire(); }, 1000); });
  b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel);
});

// ================= init =================
$('#mute').innerHTML = icon('vol', 18);
showTab(tab);
tick();

// Mode demo (ISLAND_DEMO=1 parcourt les onglets, ISLAND_DEMO=<onglet> en ouvre un) : pour les captures de test
if (DEMO) {
  const order = ['home', 'today', 'stats', 'clip', 'apps', 'term', 'claude', 'power'];
  const only = new URLSearchParams(location.search).get('demo');
  setMode('expanded');
  showTab(order.includes(only) ? only : order[0]); refreshForTab();
  if (!order.includes(only)) {
    let i = 0;
    setInterval(() => { i = (i + 1) % order.length; showTab(order[i]); refreshForTab(); }, 5000);
  }
}

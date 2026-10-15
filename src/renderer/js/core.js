/* Coeur de l'interface : etats de l'encoche, souris, activites, navigation, theme, depot de fichiers, minuteur. */
const notchEl = $('#notch');
const params = new URLSearchParams(location.search);
I.demo = params.get('demo');
I.mode = 'collapsed';
I.tab = localStorage.getItem('tab') || 'home';
I.media = { present: false };
I.tucked = false;

// ---------- vues (onglets) ----------
// ordre des onglets choisi dans les reglages (les onglets absents de la liste gardent leur place par defaut)
// et taille de l'encoche repliee
I.applyLayout = (config) => {
  const want = config.tabOrder || [], base = I.baseOrder || (I.baseOrder = [...I.order]);
  const rank = (id) => { const i = want.indexOf(id); return i < 0 ? want.length + base.indexOf(id) : i; };
  I.order.sort((a, b) => rank(a) - rank(b));
  document.body.dataset.size = (config.notch || {}).size || 'normal';
};
I.view = (id, def) => { I.views[id] = { id, nav: true, ...def }; if (def.nav !== false) I.order.push(id); };
function showTab(id) {
  if (!I.views[id]) id = 'home';
  const prev = I.views[I.tab];
  if (prev && prev.el && I.tab !== id) prev.hide && prev.hide();
  I.tab = id; localStorage.setItem('tab', id);
  if (id !== 'settings') localStorage.setItem('lastTab', id);
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  $('#btn-settings').classList.toggle('selected', id === 'settings');
  $$('.view').forEach((v) => v.classList.toggle('on', v.dataset.view === id));
  const v = I.views[id];
  if (I.mode === 'expanded' && v.show) v.show();
}
I.showTab = showTab;

// ---------- etats : replie / apercu / activite / deploye ----------
function setMode(m, force) {
  if ((I.demo || I.welcoming) && m !== 'expanded') return;
  // pendant un glisser de fichier, rien (survol, activite, minuterie) ne doit quitter le mode depot
  if (I.dragging && !force && m !== 'drop' && m !== 'expanded') return;
  if (m === I.mode) return;
  const was = I.mode;
  I.mode = m;
  notchEl.dataset.mode = m;
  if (m === 'expanded') { showTab(I.tab); }
  else if (was === 'expanded') { const v = I.views[I.tab]; v && v.hide && v.hide(); }
  if (m === 'collapsed') { follet.collapsed(); }
  renderCompact();
  reportRect();
}
I.setMode = setMode;

// Le processus principal suit la souris et nous dit quand elle entre/sort de l'encoche
let pointerIn = false, leaveTimer = null, peekTimer = null;
follet.onPointer((inside) => {
  pointerIn = inside;
  clearTimeout(leaveTimer); clearTimeout(peekTimer);
  if (!inside) {
    leaveTimer = setTimeout(() => {
      if (pointerIn || I.menuOpen) return;
      if (I.mode === 'peek') setMode('collapsed');
      else if (I.mode === 'expanded' && !typing()) setMode('collapsed');
    }, I.mode === 'expanded' ? 600 : 220);
  }
});
// La souris s'attarde dans l'encoche (le main filtre les simples passages)
follet.onHover(() => { if (pointerIn && (I.mode === 'collapsed' || I.mode === 'activity')) setMode('peek'); });
function typing() {
  const a = document.activeElement;
  return document.hasFocus() && a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'range' && a.type !== 'checkbox'));
}
window.addEventListener('blur', () => { if (I.mode === 'expanded' && !pointerIn && !I.menuOpen) setMode('collapsed'); });
// menu du clic droit ouvert : la souris peut sortir de l'encoche pour le parcourir sans la refermer
follet.onMenu((open) => {
  I.menuOpen = open;
  if (!open) setTimeout(() => { if (!pointerIn && !I.menuOpen && (I.mode === 'peek' || (I.mode === 'expanded' && !typing()))) setMode('collapsed'); }, 400);
});
$('#compact').addEventListener('click', (e) => { if (!e.target.closest('button')) { setMode('expanded'); } });
// Gestes sur l'encoche repliee : glisser a deux doigts (ou Maj+molette) change de chanson, clic du milieu
// = lecture/pause, molette = ouvrir (vers le bas) ou volume selon le reglage
let swipeX = 0, swipeT = 0, swipeLock = 0, vol = null;
follet.onVolume((v) => { if (v) vol = v; });
follet.volume().then((v) => { if (v) vol = v; }).catch(() => { });
$('#compact').addEventListener('wheel', (e) => {
  const now = Date.now();
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    if (!I.media.present || now < swipeLock) return;
    if (now - swipeT > 300) swipeX = 0;
    swipeT = now; swipeX += e.deltaX;
    if (Math.abs(swipeX) > 80) { follet.mediaCmd(swipeX > 0 ? 'next' : 'prev'); swipeX = 0; swipeLock = now + 700; I.mascot.bump(); }
    return;
  }
  if (I.wheel === 'volume' && vol) {
    const level = Math.max(0, Math.min(100, Math.round(vol.level / 2) * 2 + (e.deltaY < 0 ? 2 : -2)));
    vol = { ...vol, level, muted: false };
    follet.setVolume(level);
    I.activity({ kind: 'volume', level, muted: false });
    return;
  }
  if (e.deltaY > 0) setMode('expanded');
}, { passive: true });
$('#compact').addEventListener('auxclick', (e) => { if (e.button === 1 && I.media.present) { e.preventDefault(); follet.mediaCmd('toggle'); } });
$('#compact').addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // pas de defilement automatique
$('.topbar').addEventListener('wheel', (e) => { if (e.deltaY < 0) setMode('peek'); }, { passive: true });
// Clavier (encoche ouverte) : Echap ferme, 1-9 choisit un onglet, fleches gauche/droite passent au voisin
const visibleTabs = () => $$('#nav button').map((b) => b.dataset.tab);
function stepTab(d) { const t = visibleTabs(), i = t.indexOf(I.tab); showTab(t[(i + d + t.length) % t.length] || t[0]); }
document.addEventListener('keydown', (e) => {
  if (I.mode !== 'expanded') return;
  if (e.key === 'Escape') { setMode('collapsed'); return; }
  const a = document.activeElement;
  if (typing() || (a && a.closest && a.closest('.xterm')) || e.ctrlKey || e.altKey || e.metaKey) return;
  if (/^[1-9]$/.test(e.key)) { const t = visibleTabs()[+e.key - 1]; if (t) { e.preventDefault(); showTab(t); } }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stepTab(e.key === 'ArrowRight' ? 1 : -1); }
});
let navWheel = 0;
$('#nav').addEventListener('wheel', (e) => { e.stopPropagation(); if (Date.now() - navWheel < 220) return; navWheel = Date.now(); stepTab(e.deltaY > 0 ? 1 : -1); }, { passive: true });
follet.onToggle(() => { if (I.mode === 'expanded') setMode('collapsed'); else { setMode('expanded'); follet.focusWindow(); } });
follet.onOpenTab((t) => {           // 'settings:about' ouvre aussi une section des reglages
  const [tab, sec] = String(t).split(':');
  setMode('expanded'); showTab(tab);
  if (sec && I.views[tab] && I.views[tab].open) setTimeout(() => I.views[tab].open(sec), 50);
});
follet.onTuck((on) => { if (I.demo) return; I.tucked = on; document.body.classList.toggle('tucked', on); reportRect(); });
follet.onReveal(() => { setMode('peek'); setTimeout(() => { if (!pointerIn && I.mode === 'peek') setMode('collapsed'); }, 1600); });
$('#btn-settings').addEventListener('click', () => showTab(I.tab === 'settings' ? (localStorage.getItem('lastTab') || 'home') : 'settings'));

// Rectangle de l'encoche -> processus principal (pour la capture de la souris)
let rectQueued = false;
function reportRect() {
  if (rectQueued) return; rectQueued = true;
  requestAnimationFrame(() => {
    rectQueued = false;
    if (I.tucked && I.mode === 'collapsed') return follet.setRect(null);
    const r = notchEl.getBoundingClientRect();
    follet.setRect({ x: Math.round(r.left), y: 0, w: Math.round(r.width), h: Math.round(r.bottom) });
  });
}
new ResizeObserver(reportRect).observe(notchEl);
notchEl.addEventListener('transitionend', reportRect);

// ---------- theme dynamique ----------
follet.onTheme((vars) => {
  const root = document.documentElement;
  root.classList.add('theming');
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  clearTimeout(I.themeTimer); I.themeTimer = setTimeout(() => root.classList.remove('theming'), 700);
  I.emit('theme', vars);
});

// ---------- contenu compact (replie + apercu) ----------
function renderCompact() {
  const m = I.media, playing = m.present && m.status === 'Playing';
  notchEl.classList.toggle('playing', playing);
  notchEl.classList.toggle('has-art', !!(m.present && m.thumb));
  const art = $('.c-art');
  if (m.present && m.thumb) { if (art.src !== m.thumb) art.src = m.thumb; }
  $('.c-ctrl').classList.toggle('show', !!m.present);
  $('.c-ctrl [data-media=toggle] .ms').textContent = playing ? 'pause' : 'play_arrow';
  if (m.present) {
    $('.c-title').textContent = m.title || 'Lecture';
    $('.c-sub').textContent = [m.artist, m.appName].filter(Boolean).join(' · ');
  } else {
    const now = new Date();
    $('.c-title').textContent = `${hhmm(now)} · ${dayName(now, { weekday: 'long', day: 'numeric', month: 'long' })}`;
    $('.c-sub').textContent = I.peekLine || 'Fais défiler ou clique pour ouvrir';
  }
}
I.renderCompact = renderCompact;

// ---------- la mascotte et son humeur ----------
// Priorites : alerte (temporaire) > reflexion de l'IA > musique > sommeil (inactif) > repos
I.mascot = Follet.create($('.c-mascot'), { size: 24, active: () => I.mode !== 'expanded' });
I.moodState = { alert: false, think: false, idle: 0 };
function updateMood() {
  const s = I.moodState, playing = I.media.present && I.media.status === 'Playing';
  const m = s.alert ? 'alert' : s.think ? 'think' : playing ? 'music' : s.idle > 300 ? 'sleep' : s.happy ? 'happy' : 'idle';
  I.mood = m;
  I.emit('mood', m);
  I.mascot.setMood(m);
}
I.updateMood = updateMood;

// ---------- tenue de Follet : fetes, saison, meteo, heure ----------
I.updateOutfit = () => {
  if (I.outfits === false) return Follet.setOutfit({});
  const d = new Date(), mo = d.getMonth() + 1, day = d.getDate(), h = d.getHours(), w = I.weatherNow || {};
  const code = w.code ?? -1, rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95, snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  let hat = null;
  if ((mo === 12 && day === 31) || (mo === 1 && day === 1)) hat = 'party';
  else if (mo === 12 && day <= 26) hat = 'santa';
  else if (mo === 10) hat = 'witch';
  else if (snow || (w.temp != null && w.temp <= 2)) hat = 'tuque';
  Follet.setOutfit({ hat, umbrella: rain, shades: !rain && !snow && w.temp >= 27 && w.isDay && code <= 2, shiver: w.temp != null && w.temp <= -5, night: h < 5 });
};
setInterval(I.updateOutfit, 10 * 60e3);
I.flashMood = (key, ms = 2500) => { I.moodState[key] = true; updateMood(); clearTimeout(I.moodState[key + 'T']); I.moodState[key + 'T'] = setTimeout(() => { I.moodState[key] = false; updateMood(); }, ms); };
setInterval(async () => { I.moodState.idle = await follet.idleTime().catch(() => 0); updateMood(); }, 20000);
$$('#compact [data-media]').forEach((b) => b.addEventListener('click', () => follet.mediaCmd(b.dataset.media)));
follet.onMedia((m) => {
  I.media = m;   // le processus principal envoie toujours la pochette courante
  I.mediaAt = Date.now();
  loadLyrics();
  renderCompact();
  updateMood();
  I.emit('media', I.media);
});
follet.media().then((m) => { if (m) { I.media = m; I.mediaAt = Date.now(); renderCompact(); loadLyrics(); } });

// ---------- paroles synchronisees (LRCLIB) ----------
// position estimee entre deux sondages du lecteur
I.mediaPos = () => { const m = I.media; return !m.present ? 0 : m.position + (m.status === 'Playing' ? (Date.now() - (I.mediaAt || Date.now())) / 1000 : 0); };
I.lyrics = null;
let lyricsKey = null, lyricShown = null;
async function loadLyrics() {
  const m = I.media, key = m.present ? `${m.artist}|${m.title}` : null;
  if (key === lyricsKey) return;
  lyricsKey = key; I.lyrics = null; showLyric();
  if (!key) return;
  const r = await follet.lyrics({ artist: m.artist, title: m.title, duration: m.duration }).catch(() => null);
  if (key === lyricsKey && r && r.lines && r.lines.length) { I.lyrics = r.lines; showLyric(); }
}
function currentLyric() {
  const L = I.lyrics; if (!L) return null;
  const t = I.mediaPos() + 0.25;
  let lo = 0, hi = L.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid].t <= t) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at < 0 ? '' : L[at].text || '♪';
}
function showLyric() {
  const line = currentLyric();
  notchEl.classList.toggle('has-lyric', line !== null && line !== '');
  if (line === lyricShown) return;
  lyricShown = line;
  $('.c-lyric').textContent = line || '';
  const h = $('.np-lyric'); if (h) h.textContent = line || '';
}
// rafraichi 4 fois par seconde, seulement quand une ligne est visible
setInterval(() => { if (I.lyrics && I.media.status === 'Playing' && (I.mode === 'peek' || (I.mode === 'expanded' && I.tab === 'home'))) showLyric(); }, 250);

// ---------- activites en direct ----------
let actTimer = null, actKind = null;
function showActivity(html, kind, dur = 2600) {
  if (I.mode === 'peek' || I.mode === 'expanded') return false;
  $('#activity').innerHTML = html;
  actKind = kind;
  setMode('activity');
  clearTimeout(actTimer);
  actTimer = setTimeout(() => { actKind = null; if (I.mode === 'activity') setMode('collapsed'); }, dur);
  return true;
}
I.showActivity = showActivity;
// Mode concentration : ces activites ne font plus s'elargir l'encoche (sauf batterie faible)
const FOCUS_MUTED = ['notif', 'media', 'audioDevice', 'battery', 'download', 'rain', 'heat', 'bt', 'mic', 'update'];
I.focusUntil = 0;
I.focusOn = () => I.focusUntil === -1 || I.focusUntil > Date.now();
I.focusLabel = (u) => (u === -1 ? (I.lang === 'en' ? 'Until you turn it off' : "Jusqu'à ce que tu l'arrêtes")
  : (I.lang === 'en' ? 'Until ' : "Jusqu'à ") + new Date(u).toLocaleTimeString(I.locale, { hour: '2-digit', minute: '2-digit' }));
const applyFocus = (u, announce) => {
  I.focusUntil = u || 0;
  notchEl.classList.toggle('focus', I.focusOn());
  I.emit('focus', I.focusUntil);
  if (!announce) return;
  if (I.focusOn()) showActivity(`<div class="a-ico">${ms('do_not_disturb_on', 'fill s20')}</div><div class="a-txt"><div class="title-s">Mode concentration</div><div class="body-s variant" data-noi18n>${esc(I.focusLabel(I.focusUntil))}</div></div>`, 'focus', 2500);
  else showActivity(`<div class="a-ico">${ms('do_not_disturb_off', 's20')}</div><div class="a-txt"><div class="title-s">Mode concentration arrêté</div></div>`, 'focus', 2000);
};
follet.focus().then((u) => applyFocus(u, false)).catch(() => { });
follet.onFocus((u) => applyFocus(u, true));
// les durees proposees (tuile de l'accueil) ; s'il est actif, on l'arrete
I.toggleFocus = (anchor) => {
  if (I.focusOn()) return follet.focusSet(0);
  openMenu(anchor, [{ icon: 'schedule', label: '1 heure', value: 60 }, { icon: 'bedtime', label: "Jusqu'à demain matin", value: 'morning' }, { icon: 'all_inclusive', label: "Jusqu'à ce que je l'arrête", value: 'always' }], (it) => follet.focusSet(it.value));
};
// clic droit sur l'encoche : menu natif des outils
$('#compact').addEventListener('contextmenu', (e) => { e.preventDefault(); follet.notchMenu(); });
$('.topbar').addEventListener('contextmenu', (e) => { e.preventDefault(); follet.notchMenu(); });

I.activity = (a) => {
  if (I.focusOn() && FOCUS_MUTED.includes(a.kind) && !a.low) return;
  I.mascot.bump();
  if (a.kind === 'battery' && a.low) I.flashMood('alert', 3500);
  else if (a.kind === 'audioDevice' || (a.kind === 'battery' && a.plugged)) I.flashMood('happy', 2500);
  if (a.kind === 'volume') {
    const icon = a.muted || a.level === 0 ? 'volume_off' : a.level < 40 ? 'volume_down' : 'volume_up';
    if (actKind === 'volume' && I.mode === 'activity') {           // mise a jour sans relancer l'animation
      $('#activity .a-meter i').style.width = (a.muted ? 0 : a.level) + '%';
      $('#activity .a-val').textContent = a.muted ? 'Muet' : a.level + ' %';
      $('#activity .a-ico .ms').textContent = icon;
      clearTimeout(actTimer); actTimer = setTimeout(() => { actKind = null; if (I.mode === 'activity') setMode('collapsed'); }, 1800);
      return;
    }
    showActivity(`<div class="a-ico">${ms(icon, 'fill s20')}</div><div class="a-meter"><i style="width:${a.muted ? 0 : a.level}%"></i></div><div class="a-val">${a.muted ? 'Muet' : a.level + ' %'}</div>`, 'volume', 1800);
  } else if (a.kind === 'media') {
    showActivity(`${a.thumb ? `<img class="a-ico" src="${a.thumb}">` : `<div class="a-ico">${ms('music_note', 'fill s20')}</div>`}
      <div class="a-txt"><div class="title-s ellipsis">${esc(a.title)}</div><div class="body-s variant ellipsis">${esc(a.artist || '')}</div></div>${ms('graphic_eq', 's20')}`, 'media', 3200);
  } else if (a.kind === 'audioDevice') {
    const n = (a.name || '').toLowerCase();
    const icon = /head|casque|buds|airpods|écouteur|ecouteur|jbl|sony|bose/.test(n) ? 'headphones' : /hdmi|display|écran|monitor/.test(n) ? 'tv' : 'speaker';
    showActivity(`<div class="a-ico">${ms(icon, 'fill s20')}</div><div class="a-txt"><div class="title-s ellipsis">${esc(a.name || 'Sortie audio')}</div><div class="body-s variant">Sortie audio active</div></div>`, 'audio', 3200);
  } else if (a.kind === 'battery') {
    const html = a.low
      ? `<div class="a-ico warn">${ms('battery_alert', 'fill s20')}</div><div class="a-txt"><div class="title-s">Batterie faible</div><div class="body-s variant">Branche le chargeur</div></div><div class="a-val">${a.percent} %</div>`
      : `<div class="a-ico">${ms(a.plugged ? 'battery_charging_full' : 'battery_full', 'fill s20')}</div><div class="a-txt"><div class="title-s">${a.plugged ? 'En charge' : 'Sur batterie'}</div></div><div class="a-val">${a.percent} %</div>`;
    showActivity(html, 'battery', 3200);
  } else if (a.kind === 'notif') {
    const ico = a.logo ? `<img class="a-ico" src="${a.logo}">` : `<div class="a-ico">${ms('notifications', 'fill s20')}</div>`;
    const shown = showActivity(`${ico}<div class="a-txt"><div class="title-s ellipsis">${esc(a.title || a.app || 'Notification')}</div>
      <div class="body-s variant ellipsis">${esc([a.title ? a.app : null, a.body].filter(Boolean).join(' · '))}</div></div>`, 'notif', 5500);
    if (!shown) snack(`${a.app ? a.app + ' : ' : ''}${a.title || a.body || 'Notification'}`);
  } else if (a.kind === 'download') {
    if (a.done) I.flashMood('happy', 2500);
    const ext = (a.name.match(/\.([a-z0-9]{1,5})$/i) || [])[1] || '';
    const icon = /^(png|jpe?g|gif|webp|svg|bmp|heic)$/i.test(ext) ? 'image' : /^(mp4|mkv|mov|webm|avi)$/i.test(ext) ? 'movie' : /^(mp3|wav|flac|ogg|m4a)$/i.test(ext) ? 'music_note'
      : /^(zip|rar|7z|tar|gz)$/i.test(ext) ? 'folder_zip' : /^(exe|msi|msix)$/i.test(ext) ? 'install_desktop' : /^pdf$/i.test(ext) ? 'picture_as_pdf' : 'draft';
    showActivity(`<div class="a-ico">${ms(a.done ? icon : 'download', 'fill s20')}</div><div class="a-txt"><div class="title-s ellipsis" data-noi18n>${esc(a.name)}</div><div class="body-s variant">${a.done ? (I.lang === 'en' ? 'Downloaded · on the Shelf' : "Téléchargé · dans l'Étagère") : (I.lang === 'en' ? 'Downloading…' : 'Téléchargement…')}</div></div>${a.done ? `<div class="a-val">${fmtBytes(a.size)}</div>` : ''}`, 'download', a.done ? 4500 : 2500);
  } else if (a.kind === 'rain') {
    showActivity(`<div class="a-ico">${ms(a.snow ? 'weather_snowy' : 'umbrella', 'fill s20')}</div><div class="a-txt"><div class="title-s" data-noi18n>${esc(a.text)}</div><div class="body-s variant ellipsis" data-noi18n>${esc(I.weatherNow?.city || '')}</div></div>`, 'rain', 6000);
  } else if (a.kind === 'event') {
    I.flashMood('alert', 2500);
    const when = a.mins ? (I.lang === 'en' ? `In ${a.mins} min` : `Dans ${a.mins} min`) : (I.lang === 'en' ? 'Starting now' : 'Commence maintenant');
    showActivity(`<div class="a-ico" ${a.color ? `style="background:${esc(a.color)};color:#fff"` : ''}>${ms('event', 'fill s20')}</div><div class="a-txt"><div class="title-s ellipsis" data-noi18n>${esc(a.title)}</div><div class="body-s variant ellipsis"><span data-noi18n>${when}</span>${a.location ? ` · <span data-noi18n>${esc(a.location)}</span>` : ''}</div></div>`, 'event', 8000);
  } else if (a.kind === 'shot') {
    I.flashMood('happy', 2000);
    if (I.views.shelf) I.views.shelf.refresh();
    showActivity(`<img class="a-ico shot" src="${a.thumb}"><div class="a-txt"><div class="title-s">Capture dans l'Étagère</div><div class="body-s variant">Copiée : Ctrl+V pour la coller</div></div>${ms('screenshot_monitor', 's20')}`, 'shot', 3500);
  } else if (a.kind === 'ocr') {
    if (a.text) I.flashMood('happy', 2000);
    const n = a.text ? a.text.split('\n').length : 0;
    const sub = a.error ? 'Lecture impossible' : !a.text ? 'Aucun texte trouvé' : (I.lang === 'en' ? `Copied · ${n} line${n > 1 ? 's' : ''}` : `Copié · ${n} ligne${n > 1 ? 's' : ''}`);
    showActivity(`<div class="a-ico${a.text ? '' : ' warn'}">${ms('document_scanner', 'fill s20')}</div><div class="a-txt"><div class="title-s ellipsis"${a.text ? ' data-noi18n' : ''}>${a.text ? esc(a.text.replace(/\s+/g, ' ')) : "Texte de l'écran"}</div><div class="body-s variant"${a.text ? ' data-noi18n' : ''}>${a.text ? esc(sub) : sub}</div></div>${ms(a.text ? 'content_copy' : 'search_off', 's20')}`, 'ocr', 3500);
  } else if (a.kind === 'color') {
    I.flashMood('happy', 1500);
    showActivity(`<div class="a-ico" style="background:${esc(a.hex)}"></div><div class="a-txt"><div class="title-s" data-noi18n>${esc(a.hex.toUpperCase())}</div><div class="body-s variant">Couleur copiée</div></div>${ms('colorize', 's20')}`, 'color', 3000);
  } else if (a.kind === 'bt') {
    const bat = a.battery != null ? `<div class="a-val">${a.battery} %</div>` : '';
    const sub = a.low ? 'Batterie faible' : a.on ? 'Connecté' : 'Déconnecté';
    if (a.low) I.flashMood('alert', 3500); else if (a.on) I.flashMood('happy', 2500);
    showActivity(`<div class="a-ico${a.low ? ' warn' : ''}">${ms(a.low ? 'battery_alert' : I.btIcon(a), 'fill s20')}</div><div class="a-txt"><div class="title-s ellipsis" data-noi18n>${esc(a.name)}</div><div class="body-s variant">${sub}</div></div>${a.on === false ? ms('bluetooth_disabled', 's20') : bat}`, 'bt', 3500);
  } else if (a.kind === 'mic') {
    showActivity(`<div class="a-ico mic">${ms('mic', 'fill s20')}</div><div class="a-txt"><div class="title-s">Micro utilisé</div><div class="body-s variant ellipsis" data-noi18n>${esc(a.apps.join(', '))}</div></div>`, 'mic', 3500);
  } else if (a.kind === 'heat') {
    I.flashMood('alert', 4000);
    const what = a.part === 'gpu' ? 'Carte graphique très chaude' : 'Processeur très chaud';
    showActivity(`<div class="a-ico warn">${ms('device_thermostat', 'fill s20')}</div><div class="a-txt"><div class="title-s">${what}</div><div class="body-s variant ellipsis"${a.app ? ' data-noi18n' : ''}>${a.app ? esc((I.lang === 'en' ? 'Busiest app: ' : 'Appli la plus gourmande : ') + a.app) : 'Laisse ton PC respirer un peu'}</div></div><div class="a-val">${a.temp} °C</div>`, 'heat', 5000);
  } else if (a.kind === 'update') {
    I.flashMood('happy', 2500);
    showActivity(`<div class="a-ico">${ms('system_update_alt', 'fill s20')}</div><div class="a-txt"><div class="title-s">Mise à jour ${esc(a.version)}</div><div class="body-s variant">Réglages → À propos pour l'installer</div></div>`, 'update', 5000);
  }
};
follet.onActivity(I.activity);
$('.c-art').addEventListener('click', (e) => { e.stopPropagation(); follet.mediaFocus(); });

// tuiles de l'accueil : raccourcis integres, ou une appli / un fichier / un dossier / un site choisis
I.TILES = {
  'radio:WiFi': ['wifi', 'Wi-Fi'], 'radio:Bluetooth': ['bluetooth', 'Bluetooth'], 'ms-screenclip:': ['screenshot_region', 'Capture'],
  'follet:shot': ['screenshot_monitor', 'Écran → Étagère'], 'follet:ocr': ['document_scanner', "Texte de l'écran"], 'follet:color': ['colorize', 'Pipette'], 'follet:focus': ['do_not_disturb_on', 'Concentration'], 'taskmgr': ['monitor_heart', 'Tâches'], 'explorer': ['folder', 'Fichiers'],
  'ms-settings:': ['settings', 'Paramètres'], 'calc': ['calculate', 'Calcul'], 'terminal': ['terminal', 'Terminal'], 'notepad': ['edit_note', 'Bloc-notes'],
  'lock': ['lock', 'Verrouiller'], 'ms-settings-bluetooth:': ['bluetooth_searching', 'Appareils'],
};
I.DEFAULT_TILES = ['radio:WiFi', 'radio:Bluetooth', 'ms-screenclip:', 'taskmgr', 'explorer', 'ms-settings:', 'calc', 'terminal'].map((k) => ({ k }));
I.tileInfo = (t) => {
  if (t.k) { const [icon, label] = I.TILES[t.k] || ['apps', t.k]; return { icon, label }; }
  if (t.type === 'url') return { icon: 'public', label: t.label || t.url };
  const dir = !/\.[a-z0-9]{2,4}$/i.test(t.path || '');
  return { icon: dir ? 'folder' : 'draft', img: !dir, label: t.label || t.path };
};

// icone d'un appareil Bluetooth d'apres sa categorie Windows ou son nom
I.btIcon = (d) => {
  const s = `${d.category || ''} ${d.name || ''}`.toLowerCase();
  return /game|controller|manette|xbox|dualsense|stadia/.test(s) ? 'sports_esports' : /headset|headphone|casque|buds|airpods|jbl|soundcore/.test(s) ? 'headphones'
    : /speaker|audio/.test(s) ? 'speaker' : /mouse|souris/.test(s) ? 'mouse' : /keyboard|clavier/.test(s) ? 'keyboard' : /phone|pixel|iphone|galaxy/.test(s) ? 'smartphone'
    : /watch|charge|fitbit|band/.test(s) ? 'watch' : 'bluetooth';
};

// telechargement en cours : pastille avec la taille recue (la taille totale n'est pas connue)
follet.onDownloads((list) => {
  notchEl.classList.toggle('has-dl', list.length > 0);
  if (!list.length) return;
  const bytes = list.reduce((s, d) => s + d.bytes, 0), speed = list.reduce((s, d) => s + d.speed, 0);
  $('.c-dl-val').textContent = (list.length > 1 ? list.length + ' · ' : '') + fmtBytes(bytes);
  $('.c-dl').title = list.map((d) => d.name || '…').join(', ') + (speed ? ` · ${fmtBytes(speed)}/s` : '');
});

// point orange tant qu'une appli enregistre le micro
function renderMic(list) {
  notchEl.classList.toggle('has-mic', !!(list && list.length));
  $('.c-mic').title = list && list.length ? I.t('Micro utilisé') + ' : ' + list.map((u) => u.label).join(', ') : '';
}
follet.onMic(renderMic);
follet.mic().then(renderMic).catch(() => { });

// ---------- depot de fichiers sur l'encoche ----------
// Pas de compteur dragenter/dragleave (il se desynchronise des que le contenu change sous la souris) :
// le glisser est "actif" tant que des dragover arrivent, et l'encoche passe dans un mode dedie
// qui ne change plus de taille pendant le geste.
const dropEl = $('#dropzone');
let dragging = false, dragWatch = null, modeBeforeDrop = null;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
function dragBegin() {
  dragging = I.dragging = true;
  clearTimeout(peekTimer); clearTimeout(leaveTimer);
  document.body.classList.add('dropping');
  modeBeforeDrop = I.mode;
  if (I.mode !== 'expanded') setMode('drop');
  I.mascot.setMood('happy');
}
function dragEnd() {
  if (!dragging) return;
  dragging = I.dragging = false; clearTimeout(dragWatch);
  document.body.classList.remove('dropping');
  $$('.dz', dropEl).forEach((z) => z.classList.remove('hot'));
  if (I.mode === 'drop') setMode(pointerIn ? 'peek' : 'collapsed', true);
  updateMood();
}
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!hasFiles(e) || I.dragOut) return;
  if (!dragging) dragBegin();
  e.dataTransfer.dropEffect = 'copy';
  const z = e.target.closest && e.target.closest('.dz');
  $$('.dz', dropEl).forEach((d) => d.classList.toggle('hot', d === z || (!z && d.dataset.dz === 'shelf')));
  clearTimeout(dragWatch); dragWatch = setTimeout(dragEnd, 700);   // Chromium relance dragover au moins toutes les ~350 ms
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) dragEnd(); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (!dragging || I.dragOut) return dragEnd();
  const zone = (e.target.closest && e.target.closest('.dz')?.dataset.dz) || 'shelf';
  const paths = [...e.dataTransfer.files].map((f) => follet.pathForFile(f)).filter(Boolean);
  const wasExpanded = modeBeforeDrop === 'expanded' || I.mode === 'expanded';
  dragEnd();
  if (!paths.length) return;
  if (zone === 'ai') {
    setMode('expanded'); showTab('ai'); follet.focusWindow();
    I.views.ai.attachFiles(paths);
    return;
  }
  await follet.shelfAdd(paths);
  I.views.shelf.refresh && I.views.shelf.refresh();
  I.mascot.bump(); I.flashMood('happy', 1800);
  const n = paths.length, label = `${n} élément${n > 1 ? 's' : ''} sur l'étagère`;
  if (wasExpanded) { showTab('shelf'); snack(label); }
  else { setMode('collapsed', true); showActivity(`<div class="a-ico">${ms('inventory_2', 'fill s20')}</div><div class="a-txt"><div class="title-s">${label}</div><div class="body-s variant ellipsis">${esc(paths.map((p) => p.split(/[\\/]/).pop()).join(', '))}</div></div>`, 'shelf', 2600); }
});

// ---------- minuteurs et chrono (affiches dans l'encoche) ----------
const stored = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
// plusieurs minuteurs { id, end, total } ou { id, left, total, paused }, Pomodoro : + pomo { phase, n }
I.timers = stored('timers', null) || (stored('timer', null) ? [{ id: 1, ...stored('timer', null) }] : []);
I.stopwatch = stored('stopwatch', { acc: 0, start: null, laps: [] });
I.saveTimer = () => { localStorage.setItem('timers', JSON.stringify(I.timers)); localStorage.removeItem('timer'); localStorage.setItem('stopwatch', JSON.stringify(I.stopwatch)); };
I.pomoLabel = (p) => p.phase === 'work' ? (I.lang === 'en' ? `Session ${p.n}` : `Séance ${p.n}`) : (p.n % 4 === 0 ? (I.lang === 'en' ? 'Long break' : 'Longue pause') : (I.lang === 'en' ? 'Short break' : 'Courte pause'));
I.timerLeft = (t) => !t ? 0 : t.paused ? t.left : Math.max(0, (t.end - Date.now()) / 1000);
I.swElapsed = () => { const s = I.stopwatch; return s.acc + (s.start ? (Date.now() - s.start) / 1000 : 0); };
I.fmtSw = (sec) => `${fmtDur(Math.floor(sec))}.${Math.floor((sec * 10) % 10)}`;
I.addTimer = (sec, extra = {}) => { const t = { id: Math.max(Date.now(), ...I.timers.map((x) => x.id + 1)), end: Date.now() + sec * 1000, total: sec, ...extra }; I.timers.push(t); I.saveTimer(); tickTimer(); return t; };
// celui qui finit en premier (les minuteurs en pause passent apres)
I.nextTimer = () => [...I.timers].sort((a, b) => (a.paused ? 1 : 0) - (b.paused ? 1 : 0) || I.timerLeft(a) - I.timerLeft(b))[0] || null;
function timerDone(t) {
  if (t.pomo) {
    // Pomodoro : 25 min de travail, 5 min de pause (15 toutes les 4 seances), enchaines automatiquement
    const work = t.pomo.phase === 'work';
    const next = work ? { phase: 'break', n: t.pomo.n } : { phase: 'work', n: t.pomo.n + 1 };
    const sec = work ? (t.pomo.n % 4 === 0 ? 15 : 5) * 60 : 25 * 60;
    Object.assign(t, { end: Date.now() + sec * 1000, total: sec, pomo: next });
    I.flashMood(work ? 'happy' : 'alert', 3000);
    const title = work ? "C'est la pause" : 'Au travail', sub = I.pomoLabel(next) + ' · ' + fmtDur(sec);
    showActivity(`<div class="a-ico">${ms(work ? 'self_improvement' : 'target', 'fill s20')}</div><div class="a-txt"><div class="title-s">${title}</div><div class="body-s variant">${sub}</div></div>`, 'timer', 6000);
    follet.notify(I.t(title), sub);
    return;
  }
  I.timers = I.timers.filter((x) => x !== t);
  I.flashMood('alert', 3000);
  showActivity(`<div class="a-ico">${ms('timer', 'fill s20')}</div><div class="a-txt"><div class="title-s">Minuteur terminé</div><div class="body-s variant">${fmtDur(t.total)}</div></div>`, 'timer', 6000);
  follet.notify(I.t('Minuteur terminé'), I.lang === 'en' ? `${fmtDur(t.total)} elapsed` : `${fmtDur(t.total)} écoulé${t.total >= 120 ? 'es' : ''}`);
}
function tickTimer() {
  let changed = false;
  for (const t of [...I.timers]) if (!t.paused && I.timerLeft(t) <= 0) { timerDone(t); changed = true; }
  if (changed) I.saveTimer();
  const t = I.nextTimer(), sw = !t && !!I.stopwatch.start;
  notchEl.classList.toggle('has-timer', !!t || sw);
  notchEl.classList.toggle('pomo-break', !!(t && t.pomo && t.pomo.phase === 'break'));
  if (t) {
    $('.c-timer .ms').textContent = t.paused ? 'pause' : t.pomo ? 'target' : 'timer';
    $('.c-timer-val').textContent = (I.timers.length > 1 ? I.timers.length + ' · ' : '') + fmtDur(Math.ceil(I.timerLeft(t)));
  } else if (sw) {
    $('.c-timer .ms').textContent = 'avg_pace';
    $('.c-timer-val').textContent = fmtDur(Math.floor(I.swElapsed()));
  }
  I.emit('timer');
}
I.tickTimer = tickTimer;

// ---------- info-bulles Material (remplacent celles de Windows) ----------
const tip = document.createElement('div'); tip.id = 'tip'; notchEl.appendChild(tip);
let tipTimer = null;
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[title], [data-tip]');
  if (!el || !notchEl.contains(el)) return;
  if (el.hasAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
  if (!el.dataset.tip) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    if (!el.isConnected) return;
    tip.textContent = el.dataset.tip;
    const a = el.getBoundingClientRect(), h = notchEl.getBoundingClientRect();
    const x = Math.max(8, Math.min(h.width - tip.offsetWidth - 8, a.left - h.left + a.width / 2 - tip.offsetWidth / 2));
    const below = a.bottom - h.top + 6;
    tip.style.left = x + 'px';
    tip.style.top = (below + tip.offsetHeight > h.height - 4 ? a.top - h.top - tip.offsetHeight - 6 : below) + 'px';
    tip.classList.add('show');
  }, 550);
});
document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]')) { clearTimeout(tipTimer); tip.classList.remove('show'); } });
document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); tip.classList.remove('show'); });

// ---------- horloge ----------
function tick() {
  const now = new Date();
  $('.c-clock').textContent = hhmm(now);
  $('#tb-clock').textContent = hhmm(now);
  $('#tb-date').textContent = dayName(now, I.lang === 'en' ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });
  tickTimer();
  if (I.mode === 'peek' && !I.media.present) renderCompact();
  I.emit('tick', now);
}
setInterval(tick, 1000);

/* Coeur de l'interface : etats de l'island, souris, activites, navigation, theme, depot de fichiers, minuteur. */
const islandEl = $('#island');
const params = new URLSearchParams(location.search);
I.demo = params.get('demo');
I.mode = 'collapsed';
I.tab = localStorage.getItem('tab') || 'home';
I.media = { present: false };
I.tucked = false;

// ---------- vues (onglets) ----------
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
function setMode(m) {
  if (I.demo && m !== 'expanded') return;
  if (m === I.mode) return;
  const was = I.mode;
  I.mode = m;
  islandEl.dataset.mode = m;
  if (m === 'expanded') { showTab(I.tab); }
  else if (was === 'expanded') { const v = I.views[I.tab]; v && v.hide && v.hide(); }
  if (m === 'collapsed') { island.collapsed(); }
  renderCompact();
  reportRect();
}
I.setMode = setMode;

// Le processus principal suit la souris et nous dit quand elle entre/sort de l'island
let pointerIn = false, leaveTimer = null, peekTimer = null;
island.onPointer((inside) => {
  pointerIn = inside;
  clearTimeout(leaveTimer); clearTimeout(peekTimer);
  if (inside) {
    if (I.mode === 'collapsed' || I.mode === 'activity') peekTimer = setTimeout(() => setMode('peek'), 90);
  } else {
    leaveTimer = setTimeout(() => {
      if (pointerIn) return;
      if (I.mode === 'peek') setMode('collapsed');
      else if (I.mode === 'expanded' && !typing()) setMode('collapsed');
    }, I.mode === 'expanded' ? 600 : 220);
  }
});
function typing() {
  const a = document.activeElement;
  return document.hasFocus() && a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'range' && a.type !== 'checkbox'));
}
window.addEventListener('blur', () => { if (I.mode === 'expanded' && !pointerIn) setMode('collapsed'); });
$('#compact').addEventListener('click', (e) => { if (!e.target.closest('button')) { setMode('expanded'); } });
$('#compact').addEventListener('wheel', (e) => { if (e.deltaY > 0) setMode('expanded'); }, { passive: true });
$('.topbar').addEventListener('wheel', (e) => { if (e.deltaY < 0) setMode('peek'); }, { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && I.mode === 'expanded') setMode('collapsed'); });
island.onToggle(() => { if (I.mode === 'expanded') setMode('collapsed'); else { setMode('expanded'); island.focusWindow(); } });
island.onOpenTab((t) => { setMode('expanded'); showTab(t); });
island.onTuck((on) => { if (I.demo) return; I.tucked = on; document.body.classList.toggle('tucked', on); reportRect(); });
island.onReveal(() => { setMode('peek'); setTimeout(() => { if (!pointerIn && I.mode === 'peek') setMode('collapsed'); }, 1600); });
$('#btn-settings').addEventListener('click', () => showTab(I.tab === 'settings' ? (localStorage.getItem('lastTab') || 'home') : 'settings'));

// Rectangle de l'island -> processus principal (pour la capture de la souris)
let rectQueued = false;
function reportRect() {
  if (rectQueued) return; rectQueued = true;
  requestAnimationFrame(() => {
    rectQueued = false;
    if (I.tucked && I.mode !== 'activity' && I.mode !== 'peek' && I.mode !== 'expanded') return island.setRect(null);
    const r = islandEl.getBoundingClientRect();
    island.setRect({ x: Math.round(r.left), y: 0, w: Math.round(r.width), h: Math.round(r.bottom) });
  });
}
new ResizeObserver(reportRect).observe(islandEl);
islandEl.addEventListener('transitionend', reportRect);

// ---------- theme dynamique ----------
island.onTheme((vars) => {
  const root = document.documentElement;
  root.classList.add('theming');
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  clearTimeout(I.themeTimer); I.themeTimer = setTimeout(() => root.classList.remove('theming'), 700);
  I.emit('theme', vars);
});

// ---------- contenu compact (replie + apercu) ----------
function renderCompact() {
  const m = I.media, playing = m.present && m.status === 'Playing';
  islandEl.classList.toggle('playing', playing);
  islandEl.classList.toggle('has-art', !!(m.present && m.thumb));
  const art = $('.c-art');
  if (m.present && m.thumb) { if (art.src !== m.thumb) art.src = m.thumb; }
  $('.c-ctrl').classList.toggle('show', !!m.present);
  $('.c-ctrl [data-media=toggle] .ms').textContent = playing ? 'pause' : 'play_arrow';
  if (m.present) {
    $('.c-title').textContent = m.title || 'Lecture';
    $('.c-sub').textContent = [m.artist, m.appName].filter(Boolean).join(' · ');
    $('.c-lead .ms').textContent = 'music_note';
  } else {
    const now = new Date();
    $('.c-title').textContent = `${hhmm(now)} · ${dayName(now, { weekday: 'long', day: 'numeric', month: 'long' })}`;
    $('.c-sub').textContent = I.peekLine || 'Fais défiler ou clique pour ouvrir';
    $('.c-lead .ms').textContent = I.peekIcon || 'wb_twilight';
  }
}
I.renderCompact = renderCompact;
$$('#compact [data-media]').forEach((b) => b.addEventListener('click', () => island.mediaCmd(b.dataset.media)));
island.onMedia((m) => {
  const keep = I.media.thumb && m.present && !m.thumb && m.key === I.media.key ? I.media.thumb : null;
  I.media = { ...m, thumb: m.thumb || keep };
  renderCompact();
  I.emit('media', I.media);
});
island.media().then((m) => { if (m) { I.media = m; renderCompact(); } });

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
I.activity = (a) => {
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
  }
};
island.onActivity(I.activity);

// ---------- depot de fichiers sur l'island -> etagere ----------
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
islandEl.addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || I.dragOut) return;
  e.preventDefault(); dragDepth++;
  document.body.classList.add('dropping');
  if (I.mode !== 'expanded') { setMode('expanded'); }
  showTab('shelf');
});
islandEl.addEventListener('dragover', (e) => { if (hasFiles(e) && !I.dragOut) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
islandEl.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
islandEl.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dropping');
  if (I.dragOut) return;
  const paths = [...e.dataTransfer.files].map((f) => island.pathForFile(f)).filter(Boolean);
  if (paths.length) { await island.shelfAdd(paths); I.views.shelf.refresh && I.views.shelf.refresh(); snack(`${paths.length} élément${paths.length > 1 ? 's' : ''} ajouté${paths.length > 1 ? 's' : ''} à l'étagère`); }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// ---------- minuteur (affiche dans l'encoche) ----------
I.timer = JSON.parse(localStorage.getItem('timer') || 'null');   // { end, total } ou { left, total, paused: true }
I.saveTimer = () => localStorage.setItem('timer', JSON.stringify(I.timer));
I.timerLeft = () => !I.timer ? 0 : I.timer.paused ? I.timer.left : Math.max(0, (I.timer.end - Date.now()) / 1000);
function tickTimer() {
  const t = I.timer;
  islandEl.classList.toggle('has-timer', !!t);
  if (!t) return;
  const left = I.timerLeft();
  $('.c-timer-val').textContent = fmtDur(Math.ceil(left));
  if (!t.paused && left <= 0) {
    I.timer = null; I.saveTimer();
    islandEl.classList.remove('has-timer');
    showActivity(`<div class="a-ico">${ms('timer', 'fill s20')}</div><div class="a-txt"><div class="title-s">Minuteur terminé</div><div class="body-s variant">${fmtDur(t.total)}</div></div>`, 'timer', 6000);
    island.notify('Minuteur terminé', `${fmtDur(t.total)} écoulé${t.total >= 120 ? 'es' : ''}`);
  }
  I.emit('timer');
}

// ---------- horloge ----------
function tick() {
  const now = new Date();
  $('.c-clock').textContent = hhmm(now);
  $('#tb-clock').textContent = hhmm(now);
  $('#tb-date').textContent = dayName(now, { weekday: 'long', day: 'numeric', month: 'long' });
  tickTimer();
  if (I.mode === 'peek' && !I.media.present) renderCompact();
  I.emit('tick', now);
}
setInterval(tick, 1000);

/* Coeur de l'interface : etats de l'encoche, souris, activites, navigation, theme, depot de fichiers, minuteur. */
const notchEl = $('#notch');
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
      if (pointerIn) return;
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
window.addEventListener('blur', () => { if (I.mode === 'expanded' && !pointerIn) setMode('collapsed'); });
$('#compact').addEventListener('click', (e) => { if (!e.target.closest('button')) { setMode('expanded'); } });
$('#compact').addEventListener('wheel', (e) => { if (e.deltaY > 0) setMode('expanded'); }, { passive: true });
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
I.flashMood = (key, ms = 2500) => { I.moodState[key] = true; updateMood(); clearTimeout(I.moodState[key + 'T']); I.moodState[key + 'T'] = setTimeout(() => { I.moodState[key] = false; updateMood(); }, ms); };
setInterval(async () => { I.moodState.idle = await follet.idleTime().catch(() => 0); updateMood(); }, 20000);
$$('#compact [data-media]').forEach((b) => b.addEventListener('click', () => follet.mediaCmd(b.dataset.media)));
follet.onMedia((m) => {
  I.media = m;   // le processus principal envoie toujours la pochette courante
  renderCompact();
  updateMood();
  I.emit('media', I.media);
});
follet.media().then((m) => { if (m) { I.media = m; renderCompact(); } });

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
  } else if (a.kind === 'update') {
    I.flashMood('happy', 2500);
    showActivity(`<div class="a-ico">${ms('system_update_alt', 'fill s20')}</div><div class="a-txt"><div class="title-s">Mise à jour ${esc(a.version)}</div><div class="body-s variant">Réglages → À propos pour l'installer</div></div>`, 'update', 5000);
  }
};
follet.onActivity(I.activity);

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

// ---------- minuteur (affiche dans l'encoche) ----------
I.timer = JSON.parse(localStorage.getItem('timer') || 'null');   // { end, total } ou { left, total, paused: true }
I.saveTimer = () => localStorage.setItem('timer', JSON.stringify(I.timer));
I.timerLeft = () => !I.timer ? 0 : I.timer.paused ? I.timer.left : Math.max(0, (I.timer.end - Date.now()) / 1000);
function tickTimer() {
  const t = I.timer;
  notchEl.classList.toggle('has-timer', !!t);
  if (!t) return;
  const left = I.timerLeft();
  $('.c-timer-val').textContent = fmtDur(Math.ceil(left));
  if (!t.paused && left <= 0) {
    I.timer = null; I.saveTimer();
    notchEl.classList.remove('has-timer');
    I.flashMood('alert', 3000);
    showActivity(`<div class="a-ico">${ms('timer', 'fill s20')}</div><div class="a-txt"><div class="title-s">Minuteur terminé</div><div class="body-s variant">${fmtDur(t.total)}</div></div>`, 'timer', 6000);
    follet.notify('Minuteur terminé', `${fmtDur(t.total)} écoulé${t.total >= 120 ? 'es' : ''}`);
  }
  I.emit('timer');
}

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
  $('#tb-date').textContent = dayName(now, { weekday: 'long', day: 'numeric', month: 'long' });
  tickTimer();
  if (I.mode === 'peek' && !I.media.present) renderCompact();
  I.emit('tick', now);
}
setInterval(tick, 1000);

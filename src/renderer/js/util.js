/* Utilitaires partages. Tout l'etat de l'interface vit dans l'espace de noms I. */
window.I = { views: {}, order: [], hooks: {} };
I.on = (ev, fn) => (I.hooks[ev] ||= []).push(fn);
I.emit = (ev, ...a) => (I.hooks[ev] || []).forEach((fn) => fn(...a));

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDur = (s) => { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const fmtBytes = (b, dec) => { const u = ['o', 'Ko', 'Mo', 'Go', 'To']; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; } return `${b.toFixed(dec ?? (b < 10 && i ? 1 : 0))} ${u[i]}`; };
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + ' k' : String(n);
const fmtMbps = (v) => v == null ? '—' : v >= 100 ? v.toFixed(0) : v.toFixed(1);
const ms = (name, cls = '') => `<span class="ms ${cls}">${name}</span>`;
const dayName = (d, opts = { weekday: 'long' }) => d.toLocaleDateString('fr-CA', opts);
function ago(t) { const s = (Date.now() - t) / 1000; return s < 60 ? "à l'instant" : s < 3600 ? `il y a ${Math.floor(s / 60)} min` : s < 86400 ? `il y a ${Math.floor(s / 3600)} h` : `il y a ${Math.floor(s / 86400)} j`; }

// Icones meteo Material Symbols a partir des codes WMO d'Open-Meteo
function weatherIcon(code, day = 1) {
  if (code === 0) return day ? 'sunny' : 'clear_night';
  if (code <= 2) return day ? 'partly_cloudy_day' : 'partly_cloudy_night';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 67) return 'rainy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'weather_snowy';
  if (code >= 80 && code <= 82) return 'rainy';
  if (code >= 95) return 'thunderstorm';
  return 'thermostat';
}
function weatherLabel(code) {
  if (code === 0) return 'Dégagé'; if (code === 1) return 'Plutôt dégagé'; if (code === 2) return 'Partiellement nuageux'; if (code === 3) return 'Couvert';
  if (code === 45 || code === 48) return 'Brouillard'; if (code >= 51 && code <= 57) return 'Bruine'; if (code >= 61 && code <= 67) return 'Pluie';
  if (code >= 71 && code <= 77) return 'Neige'; if (code >= 80 && code <= 82) return 'Averses'; if (code === 85 || code === 86) return 'Averses de neige';
  if (code >= 95) return 'Orage'; return '';
}

// Jauge circulaire Material (arc de 270 degres)
function gauge(size, stroke = 10) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, arc = c * 0.75;
  return {
    html: (inner = '') => `<div class="gauge" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}"><circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${arc} ${c}"/>
      <circle class="ind" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="0 ${c}"/></svg>
      <div class="gauge-val">${inner}</div></div>`,
    set: (el, pct) => { const v = Math.max(0, Math.min(1, pct / 100)) * arc; el.querySelector('.ind').setAttribute('stroke-dasharray', `${Math.max(v, 0.01)} ${c}`); },
  };
}

// Curseur Material "expressive" ; onInput pendant le glisser, onChange au relachement
function slider(el, { value = 50, icon = '', onInput, onChange } = {}) {
  el.classList.add('slider');
  el.innerHTML = `<div class="track"><div class="active"></div><div class="inactive"></div></div><div class="handle"></div>${icon ? `<span class="ms fill ico">${icon}</span>` : ''}<input type="range" min="0" max="100" value="${value}">`;
  const input = $('input', el);
  const paint = (v) => { el.style.setProperty('--v', v + '%'); el.classList.toggle('low', v < 16); };
  paint(value);
  let dragging = false;
  input.addEventListener('input', () => { dragging = true; paint(+input.value); onInput && onInput(+input.value); });
  input.addEventListener('change', () => { dragging = false; onChange && onChange(+input.value); });
  return {
    set(v) { if (!dragging) { input.value = v; paint(v); } },
    setIcon(name) { const i = $('.ico', el); if (i) i.textContent = name; },
    get dragging() { return dragging; },
  };
}

// Curseur "pilule" : icone, nom et valeur dans la piste ; glisser n'importe ou, molette, clic sur l'icone
function pillSlider(el, { value = 50, icon = '', label = '', onInput, onChange, onIcon } = {}) {
  el.classList.add('pill');
  const layer = `<div class="ico" data-ico>${ms(icon)}</div><span class="pl">${esc(label)}</span><span class="pv"></span>`;
  el.innerHTML = `<div class="layer">${layer}</div><div class="layer top">${layer}</div>`;
  let v = value, dragging = false;
  const paint = () => {
    el.style.setProperty('--v', v + '%');
    $$('.pv', el).forEach((p) => (p.textContent = el.classList.contains('muted') ? 'Muet' : v + ' %'));
  };
  const fromX = (x) => { const r = el.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100))); };
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-ico]') && onIcon) return;
    dragging = true; el.classList.add('dragging'); el.setPointerCapture(e.pointerId);
    v = fromX(e.clientX); paint(); onInput && onInput(v);
  });
  el.addEventListener('pointermove', (e) => { if (!dragging) return; const n = fromX(e.clientX); if (n !== v) { v = n; paint(); onInput && onInput(v); } });
  const end = () => { if (!dragging) return; dragging = false; el.classList.remove('dragging'); onChange && onChange(v); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); v = Math.max(0, Math.min(100, v + (e.deltaY < 0 ? 2 : -2))); paint(); onInput && onInput(v); onChange && onChange(v); }, { passive: false });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-ico]') && onIcon) onIcon(); });
  paint();
  return {
    set(n, muted) { if (dragging) return; v = n; el.classList.toggle('muted', !!muted); paint(); },
    setIcon(name) { $$('.ico .ms', el).forEach((i) => (i.textContent = name)); },
    setLabel(t) { $$('.pl', el).forEach((i) => (i.textContent = t)); },
    get dragging() { return dragging; },
  };
}

// Menu deroulant Material ancre sous un element ; items : [{ icon, label, on, value }] ou { header }
function openMenu(anchor, items, onPick) {
  closeMenu();
  const host = $('#island'), a = anchor.getBoundingClientRect(), h = host.getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = items.map((it, i) => it.header ? `<div class="mh">${esc(it.header)}</div>` : `<button class="state ${it.on ? 'on' : ''}" data-i="${i}">${ms(it.icon || 'radio_button_unchecked')}<span class="ellipsis">${esc(it.label)}</span></button>`).join('');
  host.appendChild(m);
  const left = Math.min(a.left - h.left, h.width - m.offsetWidth - 12);
  m.style.left = Math.max(8, left) + 'px';
  m.style.top = Math.min(a.bottom - h.top + 4, h.height - m.offsetHeight - 8) + 'px';
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { closeMenu(); onPick(items[+b.dataset.i]); } });
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  function outside(e) { if (!m.contains(e.target)) closeMenu(); }
  closeMenu.current = () => { document.removeEventListener('pointerdown', outside); m.remove(); };
}
function closeMenu() { if (closeMenu.current) { closeMenu.current(); closeMenu.current = null; } }

function segmented(el, options, value, onChange) {
  el.className = 'segmented';
  const render = () => {
    el.innerHTML = options.map(([v, label]) => `<button class="${v === value ? 'on' : ''}" data-v="${esc(v)}">${ms('check')}${esc(label)}</button>`).join('');
  };
  render();
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; value = b.dataset.v; render(); onChange(value); });
}

let snackTimer = null;
function snack(text) {
  const el = $('#snackbar'); el.textContent = text; el.classList.add('show');
  clearTimeout(snackTimer); snackTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Markdown minimal pour les reponses de Claude
function md(src) {
  return src.split(/```/).map((b, i) => {
    if (i % 2) { const nl = b.indexOf('\n'); return `<pre><code>${esc(nl >= 0 ? b.slice(nl + 1) : b)}</code></pre>`; }
    const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<i>$2</i>');
    return b.split(/\n{2,}/).map((p) => {
      const lines = p.split('\n');
      if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l) || !l.trim())) {
        const ol = /^\s*\d+\./.test(lines[0]);
        return `<${ol ? 'ol' : 'ul'}>${lines.filter((l) => l.trim()).map((l) => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`;
      }
      if (/^#{1,4}\s/.test(lines[0])) return `<p><b>${inline(lines[0].replace(/^#+\s/, ''))}</b>${lines.length > 1 ? '<br>' + lines.slice(1).map(inline).join('<br>') : ''}</p>`;
      return p.trim() ? `<p>${lines.map(inline).join('<br>')}</p>` : '';
    }).join('');
  }).join('');
}

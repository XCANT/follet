/* Follet, la mascotte : une petite flamme corail dessinee image par image dans un canvas.
   Contour d'apres le dessin de reference (goutte large, pointe principale un peu a droite, une langue
   de chaque cote, flammeche a gauche), interieur creme, grands yeux brillants, bouche ":3", joues roses.
   Humeurs : idle, music (ecouteurs), think (aureole + points), happy (clin d'oeil + etincelles),
   alert (grands yeux + !), sleep (bonnet de nuit + z). Les accessoires n'apparaissent qu'a partir de 40 px. */
const Follet = (() => {
  const PALETTES = {
    corail: { core: '#ffefe4', mid: '#ffbfa9', edge: '#ff9894', rim: '#ff7f8c', glow: '255,112,110', inner: '255,242,230' },
  };
  let pal = PALETTES.corail, palName = 'corail';
  const EYE = '#3a2026', MOUTH = '#4a2a2e', BLUSH = '255,110,130';

  // ---- couleurs derivees du theme Material You (option "suivre les couleurs de l'appli") ----
  const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  function themePalette() {
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim() || '#d0bcff';
    const p = v('--md-primary'), t = v('--md-tertiary');
    return { core: mix(p, '#ffffff', 0.88), mid: mix(p, '#ffffff', 0.5), edge: mix(t, p, 0.35), rim: p, glow: hex(p).join(','), inner: hex(mix(p, '#ffffff', 0.92)).join(',') };
  }
  function setPalette(name) {
    palName = name === 'theme' ? 'theme' : 'corail';
    pal = palName === 'theme' ? themePalette() : PALETTES.corail;
  }

  // ---- formes (unites : rayon du bulbe = 1, centre du bulbe en 0,0, y vers le bas) ----
  function outline(c, t) {
    const m = Math.sin(t * 1.7) * 0.07, l = Math.sin(t * 2.3 + 1) * 0.05, r = Math.sin(t * 2.1 + 2.4) * 0.05, h = Math.sin(t * 2.6) * 0.04;
    c.beginPath();
    c.moveTo(0, 0.98);
    c.bezierCurveTo(0.6, 0.98, 1.0, 0.6, 1.0, 0.06);
    c.bezierCurveTo(1.0, -0.36, 0.86, -0.62, 0.68 + r, -0.94 + r * 0.5);
    c.bezierCurveTo(0.62, -0.8, 0.55, -0.74, 0.46, -0.74);
    c.bezierCurveTo(0.52, -1.08, 0.42, -1.42, 0.2 + m, -1.7 + h);
    c.bezierCurveTo(0.08 + m * 0.5, -1.38, -0.06, -1.1, -0.24, -0.9);
    c.bezierCurveTo(-0.3, -0.96, -0.42, -1.02, -0.56 + l, -1.1 + l * 0.4);
    c.bezierCurveTo(-0.84, -0.78, -1.0, -0.42, -1.0, 0.06);
    c.bezierCurveTo(-1.0, 0.6, -0.6, 0.98, 0, 0.98);
    c.closePath();
  }
  function inner(c, t) {
    const m = Math.sin(t * 2.2 + 0.5) * 0.05;
    c.beginPath();
    c.moveTo(0, 0.86);
    c.bezierCurveTo(0.52, 0.86, 0.8, 0.52, 0.8, 0.12);
    c.bezierCurveTo(0.8, -0.2, 0.62, -0.42, 0.46, -0.56);
    c.bezierCurveTo(0.42, -0.42, 0.34, -0.36, 0.24, -0.36);
    c.bezierCurveTo(0.22, -0.62, 0.1, -0.86, -0.06 + m, -1.02);
    c.bezierCurveTo(-0.14, -0.78, -0.3, -0.56, -0.5, -0.42);
    c.bezierCurveTo(-0.72, -0.24, -0.8, -0.04, -0.8, 0.12);
    c.bezierCurveTo(-0.8, 0.52, -0.52, 0.86, 0, 0.86);
    c.closePath();
  }
  function body(c, t, px) {
    const g = c.createRadialGradient(0, 0.35, 0.05, 0, 0.1, 2.3);
    g.addColorStop(0, pal.core); g.addColorStop(0.32, pal.mid); g.addColorStop(0.72, pal.edge); g.addColorStop(1, pal.rim);
    c.save(); c.shadowColor = `rgba(${pal.glow},.95)`; c.shadowBlur = px * 0.5;
    outline(c, t); c.fillStyle = g; c.fill(); c.restore();
    outline(c, t); c.fillStyle = g; c.fill();
    inner(c, t);
    const ig = c.createRadialGradient(0, 0.3, 0.05, 0, 0.1, 1.15);
    ig.addColorStop(0, `rgba(${pal.inner},1)`); ig.addColorStop(0.6, `rgba(${pal.inner},.75)`); ig.addColorStop(1, `rgba(${pal.inner},.15)`);
    c.fillStyle = ig; c.fill();
  }
  function wisp(c, t, px) {
    const sw = Math.sin(t * 2.4) * 0.08;
    c.save(); c.translate(-0.42, -1.4 + Math.sin(t * 2) * 0.05); c.scale(0.3, 0.3); c.globalAlpha = 0.85 + 0.15 * Math.sin(t * 3);
    c.shadowColor = `rgba(${pal.glow},.9)`; c.shadowBlur = px * 0.14;
    c.beginPath(); c.moveTo(0, 0.55);
    c.bezierCurveTo(-0.48, 0.55, -0.52, 0.0, -0.22, -0.42);
    c.bezierCurveTo(-0.02, -0.72, -0.16, -1.0, 0.04 + sw, -1.32);
    c.bezierCurveTo(0.38, -0.92, 0.52, -0.42, 0.46, 0.04);
    c.bezierCurveTo(0.42, 0.4, 0.26, 0.55, 0, 0.55); c.closePath();
    const g = c.createLinearGradient(0, -1.3, 0, 0.55); g.addColorStop(0, pal.edge); g.addColorStop(1, pal.mid);
    c.fillStyle = g; c.fill(); c.restore();
  }

  // ---- visage ----
  function eye(c, x, y, st, kind, side) {
    const r = 0.265;
    c.save(); c.translate(x + st.look[0] * 0.05, y + st.look[1] * 0.04);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = EYE;
    if (kind === 'happy') { c.lineWidth = 0.07; c.beginPath(); c.moveTo(-0.2, 0.05); c.quadraticCurveTo(0, -0.18, 0.2, 0.05); c.stroke(); }
    else if (kind === 'sleep') { c.lineWidth = 0.065; c.beginPath(); c.moveTo(-0.19, 0); c.quadraticCurveTo(0, 0.14, 0.19, 0); c.stroke(); }
    else if (kind === 'wink' && side > 0) { c.lineWidth = 0.07; c.beginPath(); c.moveTo(-0.17, -0.13); c.quadraticCurveTo(0.05, -0.02, 0.18, 0); c.quadraticCurveTo(0.05, 0.03, -0.15, 0.13); c.stroke(); }
    else {
      const open = kind === 'wide' ? 1.15 : Math.max(0.08, 1 - Math.sin(st.blink * Math.PI));
      const ry = r * 1.08 * open;
      c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.ellipse(0, 0, r + 0.045, ry + 0.045, 0, 0, Math.PI * 2); c.fill();
      const g = c.createRadialGradient(0, ry * 0.45, 0.02, 0, 0, r * 1.2); g.addColorStop(0, '#6e3b41'); g.addColorStop(1, EYE);
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2); c.fill();
      if (open > 0.45) {
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0.08, -0.08 * open, 0.095, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(-0.09, 0.1 * open, 0.045, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  }
  function mouth(c, kind, t) {
    c.save(); c.translate(0, 0.42); c.scale(1.2, 1.2);
    c.strokeStyle = MOUTH; c.fillStyle = MOUTH; c.lineWidth = 0.05; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (kind === 'cat') { c.moveTo(-0.17, -0.03); c.quadraticCurveTo(-0.085, 0.11, 0, -0.01); c.quadraticCurveTo(0.085, 0.11, 0.17, -0.03); c.stroke(); }
    else if (kind === 'open') {
      c.moveTo(-0.15, -0.04); c.quadraticCurveTo(0, -0.01, 0.15, -0.04); c.quadraticCurveTo(0.12, 0.22, 0, 0.22); c.quadraticCurveTo(-0.12, 0.22, -0.15, -0.04); c.fill();
      c.fillStyle = '#ff8a95'; c.beginPath(); c.ellipse(0, 0.15, 0.075, 0.05, 0, 0, Math.PI * 2); c.fill();
    }
    else if (kind === 'o') { const k = 1 + 0.15 * Math.sin(t * 6); c.ellipse(0, 0.03, 0.07, 0.09 * k, 0, 0, Math.PI * 2); c.fill(); }
    else if (kind === 'flat') { c.moveTo(-0.08, 0.02); c.lineTo(0.08, 0.02); c.stroke(); }
    c.restore();
  }
  function blush(c) {
    for (const x of [-0.6, 0.6]) {
      c.save(); c.translate(x, 0.42); c.scale(1, 0.55);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.22); g.addColorStop(0, `rgba(${BLUSH},.62)`); g.addColorStop(0.55, `rgba(${BLUSH},.62)`); g.addColorStop(1, `rgba(${BLUSH},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.22, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }

  // ---- accessoires ----
  function sparkle(c, x, y, s, a, px) {
    c.save(); c.globalAlpha = a; c.fillStyle = '#ffe9dc'; c.shadowColor = `rgba(${pal.glow},.9)`; c.shadowBlur = px * 0.15;
    c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill(); c.restore();
  }
  function heart(c, x, y, s, a) {
    c.save(); c.globalAlpha = a; c.fillStyle = '#ff8a95'; c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(0, 0.35); c.bezierCurveTo(-0.9, -0.25, -0.45, -0.95, 0, -0.45); c.bezierCurveTo(0.45, -0.95, 0.9, -0.25, 0, 0.35); c.fill(); c.restore();
  }
  function bang(c, x, y, s) {
    c.save(); c.fillStyle = '#ff8a95'; c.beginPath(); c.roundRect(x - s * 0.18, y - s, s * 0.36, s * 1.2, s * 0.18); c.fill();
    c.beginPath(); c.arc(x, y + s * 0.55, s * 0.2, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function halo(c, t, front, px) {
    c.save(); c.strokeStyle = 'rgba(255,240,228,.95)'; c.lineWidth = 0.05; c.shadowColor = `rgba(${pal.glow},1)`; c.shadowBlur = px * 0.18;
    const y = -1.36 + Math.sin(t * 1.8) * 0.05;
    c.beginPath(); c.ellipse(0.12, y, 0.6, 0.13, Math.sin(t) * 0.04, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); c.stroke(); c.restore();
  }
  function headphones(c, t, px) {
    c.save(); c.lineCap = 'round';
    c.strokeStyle = '#2c2f4f'; c.lineWidth = 0.13; c.beginPath(); c.arc(0, -0.05, 1.13, Math.PI + 0.32, Math.PI * 2 - 0.32); c.stroke();
    c.strokeStyle = 'rgba(140,150,255,.6)'; c.lineWidth = 0.035; c.beginPath(); c.arc(0, -0.05, 1.13, Math.PI + 0.45, Math.PI * 2 - 0.45); c.stroke();
    for (const s of [-1, 1]) {
      const g = c.createLinearGradient(s * 1.0, -0.3, s * 1.3, 0.4); g.addColorStop(0, '#6b74ff'); g.addColorStop(1, '#c58cff');
      c.fillStyle = '#23263f'; c.beginPath(); c.roundRect(s * 1.1 - 0.17, -0.3, 0.34, 0.68, 0.16); c.fill();
      c.save(); c.shadowColor = 'rgba(150,120,255,1)'; c.shadowBlur = px * 0.25 * (0.7 + 0.3 * Math.sin(t * 6));
      c.fillStyle = g; c.beginPath(); c.roundRect(s * 1.14 - 0.12, -0.24, 0.24, 0.56, 0.12); c.fill(); c.restore();
    }
    c.restore();
  }
  function nightcap(c, t) {
    c.save(); c.fillStyle = '#4b5a9e'; c.beginPath(); c.moveTo(-0.66, -0.66); c.quadraticCurveTo(0.1, -1.75, 0.95, -1.22 + Math.sin(t) * 0.05); c.quadraticCurveTo(0.4, -1.08, 0.66, -0.66); c.closePath(); c.fill();
    c.fillStyle = '#e9ecff'; c.beginPath(); c.roundRect(-0.74, -0.76, 1.48, 0.2, 0.1); c.fill(); c.beginPath(); c.arc(0.98, -1.2 + Math.sin(t) * 0.05, 0.13, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function zzz(c, now) {
    c.save(); c.fillStyle = 'rgba(220,200,195,1)';
    for (let i = 0; i < 2; i++) { const a = (now / 2600 + i * 0.5) % 1; c.globalAlpha = Math.sin(a * Math.PI); c.font = `700 ${0.3 + a * 0.3}px sans-serif`; c.fillText('z', 0.9 + a * 0.5, -1.2 - a * 0.7); }
    c.restore();
  }
  // ---- tenues : saison, fetes et meteo (Follet.setOutfit) ----
  let outfit = {};
  function witchHat(c, t) {
    const sw = Math.sin(t * 1.4) * 0.06;
    c.save(); c.rotate(0.12);
    c.fillStyle = '#3b2b63'; c.beginPath(); c.ellipse(0.08, -0.86, 0.98, 0.2, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-0.52, -0.9); c.quadraticCurveTo(-0.2, -1.5, 0.3 + sw, -2.15); c.quadraticCurveTo(0.42 + sw, -2.2, 0.5 + sw * 1.4, -2.05); c.quadraticCurveTo(0.36, -1.6, 0.62, -0.9); c.closePath(); c.fill();
    c.fillStyle = '#ff9a3c'; c.beginPath(); c.moveTo(-0.5, -0.98); c.lineTo(0.6, -0.98); c.lineTo(0.56, -1.16); c.lineTo(-0.42, -1.16); c.closePath(); c.fill();
    c.strokeStyle = '#ffd36b'; c.lineWidth = 0.05; c.strokeRect(0.0, -1.14, 0.18, 0.14);
    c.restore();
  }
  function santaHat(c, t) {
    const sw = Math.sin(t * 1.6) * 0.06;
    c.save(); c.rotate(0.1);
    c.fillStyle = '#e53950'; c.beginPath(); c.moveTo(-0.7, -0.82); c.quadraticCurveTo(-0.2, -2.0, 0.8 + sw, -1.5); c.quadraticCurveTo(0.45, -1.3, 0.72, -0.82); c.closePath(); c.fill();
    c.fillStyle = '#fff5f2'; c.beginPath(); c.roundRect(-0.8, -0.96, 1.6, 0.26, 0.13); c.fill();
    c.beginPath(); c.arc(0.84 + sw, -1.46, 0.16, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function tuque(c, t) {
    // tuque quebecoise : rayures, revers et pompon
    c.save(); c.rotate(0.06);
    c.save(); c.beginPath(); c.ellipse(0.02, -0.86, 0.82, 0.82, 0, Math.PI, Math.PI * 2); c.closePath(); c.clip();
    const cols = ['#d63c4a', '#f6efe9'];
    for (let i = 0; i < 6; i++) { c.fillStyle = cols[i % 2]; c.fillRect(-0.9, -1.72 + i * 0.16, 1.9, 0.16); }
    c.restore();
    c.fillStyle = '#b52d3b'; c.beginPath(); c.roundRect(-0.86, -0.98, 1.76, 0.3, 0.12); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 0.03;
    for (let x = -0.76; x < 0.86; x += 0.12) { c.beginPath(); c.moveTo(x, -0.95); c.lineTo(x, -0.72); c.stroke(); }
    c.fillStyle = '#f6efe9'; c.beginPath(); c.arc(0.02 + Math.sin(t * 2) * 0.03, -1.74, 0.2, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function partyHat(c, t) {
    c.save(); c.translate(0.18, 0); c.rotate(0.22);
    c.fillStyle = '#7c6cff'; c.beginPath(); c.moveTo(-0.42, -0.92); c.lineTo(0.06, -2.0); c.lineTo(0.5, -0.92); c.closePath(); c.fill();
    c.fillStyle = '#ffd36b'; for (const [x, y] of [[-0.12, -1.1], [0.22, -1.32], [0.0, -1.58], [0.18, -1.05]]) { c.beginPath(); c.arc(x, y, 0.06, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ff8a95'; c.beginPath(); c.arc(0.06, -2.02, 0.12 + Math.sin(t * 4) * 0.02, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function umbrella(c, t, now) {
    // tenu sur le cote : le manche longe la flamme a droite, la toile couvre la pointe
    c.save(); c.translate(0, 0.3 + Math.sin(t * 1.5) * 0.03);
    c.strokeStyle = '#6a5a62'; c.lineWidth = 0.07; c.lineCap = 'round';
    c.beginPath(); c.moveTo(1.18, -1.98); c.lineTo(1.18, 0.0); c.quadraticCurveTo(1.18, 0.22, 0.98, 0.2); c.stroke();
    const g = c.createLinearGradient(-0.4, -2.5, 2.0, -1.9); g.addColorStop(0, '#5ec8c0'); g.addColorStop(1, '#3a8fd6');
    c.fillStyle = g; c.beginPath(); c.moveTo(-0.55, -1.92);
    c.quadraticCurveTo(0.6, -2.85, 1.95, -1.92);
    for (let i = 0; i < 4; i++) { const x0 = 1.95 - i * 0.625; c.quadraticCurveTo(x0 - 0.31, -2.06, x0 - 0.625, -1.92); }
    c.closePath(); c.fill();
    c.fillStyle = '#6a5a62'; c.beginPath(); c.arc(0.7, -2.4, 0.06, 0, Math.PI * 2); c.fill();
    c.restore();
    // gouttes autour
    c.save(); c.strokeStyle = 'rgba(130,190,255,.8)'; c.lineWidth = 0.045; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = ((now / 900) + i * 0.31) % 1, x = [-1.35, -1.6, -1.2, 2.1, 2.3, -0.9][i], y = -2.2 + a * 2.6;
      c.globalAlpha = Math.sin(a * Math.PI) * 0.9; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 0.05, y + 0.22); c.stroke();
    }
    c.restore();
  }
  function shades(c, st) {
    c.save(); c.translate(st.look[0] * 0.05, st.look[1] * 0.04 + 0.08);
    c.fillStyle = '#1c1a26'; c.strokeStyle = '#1c1a26'; c.lineWidth = 0.06;
    for (const x of [-0.42, 0.42]) { c.beginPath(); c.roundRect(x - 0.3, -0.2, 0.6, 0.38, 0.14); c.fill(); }
    c.beginPath(); c.moveTo(-0.13, -0.08); c.quadraticCurveTo(0, -0.14, 0.13, -0.08); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.35)'; for (const x of [-0.5, 0.34]) { c.beginPath(); c.roundRect(x, -0.14, 0.1, 0.07, 0.03); c.fill(); }
    c.restore();
  }

  function dots(c, t) {
    for (let i = 0; i < 3; i++) { const b = Math.max(0, Math.sin(t * 5 - i * 0.9)); c.fillStyle = `rgba(255,236,226,${0.45 + 0.55 * b})`; c.beginPath(); c.arc(1.2 + i * 0.3, -1.25 - b * 0.12, 0.085, 0, Math.PI * 2); c.fill(); }
  }

  // ---- humeurs ----
  const LOOK = {
    idle: { eyes: 'open', mouth: 'cat', wisp: true },
    music: { eyes: 'happy', mouth: 'cat', headphones: true, motion: 'bop', wisp: true },
    think: { eyes: 'open', mouth: 'o', halo: true, dots: true, motion: 'sway' },
    happy: { eyes: 'wink', mouth: 'open', sparkles: true, hearts: true, motion: 'hop' },
    alert: { eyes: 'wide', mouth: 'o', bang: true, motion: 'shake' },
    sleep: { eyes: 'sleep', mouth: 'flat', cap: true, zzz: true, motion: 'sleep' },
  };

  function draw(st, c, now, dt) {
    // la taille suit celle de l'hote (l'encoche grandit en apercu)
    const hs = st.host.clientWidth;
    if (hs && Math.abs(hs - st.size) > 0.5) {
      st.size = hs; st.box = Math.round(hs * 1.8);
      Object.assign(st.cv.style, { width: st.box + 'px', height: st.box + 'px', margin: `-${st.box / 2}px 0 0 -${st.box / 2}px` });
    }
    const o = (st.giggle > now ? LOOK.happy : LOOK[st.mood]) || LOOK.idle, rich = st.size >= 40;
    // ressort (squash & stretch), clignements, regard
    st.t += dt * (st.mood === 'sleep' ? 0.5 : st.mood === 'think' ? 1.6 : 1);
    st.sqv += (-170 * st.sq - 11 * st.sqv) * dt; st.sq += st.sqv * dt;
    if (now > st.blinkAt) { st.blink = 1; st.blinkAt = now + 1800 + Math.random() * 4200; if (Math.random() < 0.2) st.blinkAt = now + 260; }
    st.blink = Math.max(0, st.blink - dt * 7);
    st.look[0] += ((st.mood === 'think' ? 0.6 : st.lookT[0]) - st.look[0]) * Math.min(1, dt * 8);
    st.look[1] += ((st.mood === 'think' ? -1 : st.lookT[1]) - st.look[1]) * Math.min(1, dt * 8);
    const t = st.t;
    let dy = Math.sin(t * 2.1) * 0.05, rot = 0;
    if (o.motion === 'bop') { const ph = ((now / 1000) % 0.5) / 0.5; if (ph < st.beat) st.sqv -= 1.0; st.beat = ph; dy = -Math.sin(ph * Math.PI) * 0.14; rot = Math.sin((now / 1000) * Math.PI * 2) * 0.06; }
    else if (o.motion === 'hop') { const ph = ((now / 1000) % 1.1) / 1.1; if (ph < st.beat) st.sqv -= 1.3; st.beat = ph; dy = -Math.max(0, Math.sin(ph * Math.PI * 1.6)) * 0.22; }
    else if (o.motion === 'sway') rot = Math.sin(t * 1.6) * 0.05;
    else if (o.motion === 'sleep') dy = Math.sin(t * 1.2) * 0.04 + 0.05;
    else if (o.motion === 'shake') rot = Math.sin(now / 45) * 0.05 * Math.max(0, 1 - ((now / 1000) % 2) * 1.2);
    // grelotte (grand froid) : petits frissons par moments
    if (outfit.shiver && st.mood === 'idle') { const ph = (now / 1000) % 4; if (ph < 0.8) rot += Math.sin(now / 28) * 0.035; }
    const sq = Math.max(-0.25, Math.min(0.25, st.sq));

    const { cv } = st, dpr = Math.min(3, devicePixelRatio || 1), W = st.box, unit = st.size / 2.9;
    if (cv.width !== Math.round(W * dpr)) cv.width = cv.height = Math.round(W * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, W);
    // le personnage (de -1.7 a 0.98 en hauteur) est centre dans la boite de l'hote
    c.translate(W / 2, W / 2 + 0.36 * unit); c.scale(unit, unit);
    const px = unit * dpr;
    c.save();
    c.translate(0, dy + 1); c.rotate(rot); c.scale(1 - sq * 0.7, 1 + sq); c.translate(0, -1);
    if (rich && o.halo) halo(c, t, false, px);
    body(c, t, px);
    if (rich && o.halo) halo(c, t, true, px);
    if (rich && o.cap) nightcap(c, t);
    else if (outfit.hat && st.size >= 20) ({ witch: witchHat, santa: santaHat, tuque, party: partyHat })[outfit.hat]?.(c, t);
    blush(c);
    eye(c, -0.42, 0.1, st, o.eyes, -1); eye(c, 0.42, 0.1, st, o.eyes, 1);
    if (outfit.shades && rich && o.eyes !== 'sleep') shades(c, st);
    // la nuit, un baillement de temps en temps
    const yawn = outfit.night && st.mood === 'idle' && (now / 1000) % 14 < 1.6;
    mouth(c, yawn ? 'o' : o.mouth, t);
    if (rich && o.headphones) headphones(c, t, px);
    c.restore();
    if (rich && o.wisp && !outfit.umbrella) wisp(c, t, px);
    if (rich && outfit.umbrella && st.mood !== 'sleep') umbrella(c, t, now);
    if (rich && o.sparkles) { sparkle(c, -1.45, -0.4, 0.17, 0.6 + 0.4 * Math.sin(t * 3), px); sparkle(c, 1.2, -1.45, 0.13, 0.6 + 0.4 * Math.sin(t * 3 + 2), px); sparkle(c, -0.7, -2.0, 0.09, 0.5 + 0.5 * Math.sin(t * 4 + 1), px); }
    if (rich && o.hearts) { const b = Math.sin(t * 3) * 0.06; heart(c, 1.4, -1.0 + b, 0.28, 0.95); heart(c, 1.58, -0.5 - b, 0.17, 0.8); }
    if (rich && o.bang) bang(c, -1.2, -1.5, 0.28);
    if (rich && o.zzz) zzz(c, now);
    if (rich && o.dots) dots(c, t);
  }

  const all = new Set();
  let raf = 0;
  function create(host, { size = 64, mood = 'idle', track = true, active = null } = {}) {
    // le canvas deborde de l'hote (accessoires, lueur) sans changer sa mise en page
    const box = Math.round(size * 1.8);
    host.innerHTML = '';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const cv = document.createElement('canvas');
    cv.className = 'follet';
    cv.style.cssText = `position:absolute;left:50%;top:50%;width:${box}px;height:${box}px;margin:${-box / 2}px 0 0 ${-box / 2}px;pointer-events:none`;
    host.appendChild(cv);
    const st = { host, cv, ctx: cv.getContext('2d'), size, box, track, active, mood: 'idle', t: Math.random() * 10, sq: 0, sqv: 0, beat: 0, blink: 0, blinkAt: performance.now() + 1500 + Math.random() * 3000, look: [0, 0], lookT: [0, 0], last: 0 };
    const api = {
      el: cv, get mood() { return st.mood; }, track,
      setMood(m) { if (!LOOK[m] || m === st.mood) return; st.mood = m; if (m !== 'sleep') st.sqv -= m === 'alert' ? 2.6 : 1.6; },
      lookAt(x, y) {
        const r = host.getBoundingClientRect(); if (!r.width) return;
        const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 180);
        st.lookT = [(dx / d) * k, (dy / d) * k];
      },
      bump(f = 1) { st.sqv -= 2.4 * f; },
      frame() { draw(st, st.ctx, performance.now(), 1 / 60); },
    };
    st.api = api;
    st.mood = LOOK[mood] ? mood : 'idle';
    // un clic la fait rire
    host.addEventListener('click', () => { st.giggle = performance.now() + 1600; st.sqv -= 2.6; });
    draw(st, st.ctx, performance.now(), 1 / 60);
    all.add(st);
    if (!raf) raf = requestAnimationFrame(loop);
    return api;
  }
  function visible(st) {
    if (!st.host.isConnected) { all.delete(st); return false; }
    if (st.active && !st.active()) return false;
    return st.host.getClientRects().length > 0;
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    for (const st of all) {
      if (!visible(st)) { st.last = 0; continue; }
      if (st.last && st.size < 40 && now - st.last < 32) continue;   // les petites : ~30 images/s
      const dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 1 / 60;
      st.last = now;
      draw(st, st.ctx, now, dt);
    }
    if (!all.size) { cancelAnimationFrame(raf); raf = 0; }
  }
  document.addEventListener('mousemove', (e) => { for (const st of all) if (st.track && st.host.isConnected) st.api.lookAt(e.clientX, e.clientY); });

  // Image fixe (icone de la zone de notification, avatar de discussion) : corps et visage seulement
  async function png(size = 64) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), unit = size / 3.3;
    x.translate(size / 2, size / 2 + 0.37 * unit); x.scale(unit, unit);
    const st = { look: [0, 0], blink: 0 };
    body(x, 0.4, unit * 0.6); blush(x);
    eye(x, -0.42, 0.1, st, 'open', -1); eye(x, 0.42, 0.1, st, 'open', 1);
    mouth(x, 'cat', 0);
    return c.toDataURL('image/png');
  }

  // suivre le theme : on recalcule les couleurs quand il change
  if (window.I && I.on) I.on('theme', () => { if (palName === 'theme') setPalette('theme'); });

  // { hat: 'witch'|'santa'|'tuque'|'party'|null, umbrella, shades, shiver, night }
  function setOutfit(o) { outfit = o || {}; }
  return { create, png, setPalette, setOutfit, get palette() { return palName; }, get outfit() { return outfit; } };
})();

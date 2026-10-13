/* Follet, la mascotte : un feu follet dessine image par image (SVG + requestAnimationFrame).
   La flamme est une forme procedurale (cercle etire vers une pointe qui ondule), en trois couches :
   halo flou, corps en degrade, coeur lumineux. Braises qui montent, ressort de "squash & stretch",
   clignements aleatoires, yeux qui suivent la souris. Les humeurs se fondent les unes dans les autres.
   Humeurs : idle, music, sleep, think, happy, alert. */
const Follet = (() => {
  const INK = '#1d1b20';
  const MOODS = {
    //        hauteur  halo  vacille vitesse braises/s
    idle:  { h: 1.00, glow: .85, flick: 1.0, speed: 1.0, embers: 1.2 },
    music: { h: 1.05, glow: 1.1, flick: 1.3, speed: 1.5, embers: 4 },
    sleep: { h: .80, glow: .45, flick: .45, speed: .45, embers: 0 },
    think: { h: 1.08, glow: 1.15, flick: 1.7, speed: 1.9, embers: 3 },
    happy: { h: 1.06, glow: 1.1, flick: 1.2, speed: 1.3, embers: 3.5 },
    alert: { h: 1.16, glow: 1.35, flick: 2.3, speed: 2.6, embers: 5 },
  };
  // bruit doux : somme de sinus decales (assez organique pour une flamme, sans dependance)
  const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 2.9 + s * 1.3) * 0.3 + Math.sin(t * 4.3 + s * 2.1) * 0.2;
  const lerp = (a, b, k) => a + (b - a) * k;

  // Contour de flamme : demi-cercle en bas, cotes concaves qui convergent vers une pointe qui ondule.
  // p = 0 au milieu du corps, 1 a la pointe ; la ligne mediane se courbe de plus en plus vers le haut.
  function flame(cx, cy, R, H, sway, t, flick, seed) {
    const n = 12, right = [], left = [];
    const mid = (p) => cx + R * (sway * p * p * 1.1 + 0.16 * flick * p * p * noise(t * 1.6 + p * 2, seed));
    for (let i = 0; i <= n; i++) {
      const p = 1 - Math.pow(1 - i / n, 1.35), y = cy - p * H;
      const w = R * Math.pow(1 - p, 1.25) * (1 + 0.55 * p) * (1 + 0.025 * flick * noise(t * 2.3 + i, seed + 7));
      right.push([mid(p) + w, y]); left.push([mid(p) - w, y]);
    }
    const pts = [...right.slice(0, -1), right[n]];
    for (let i = n - 1; i >= 0; i--) pts.push(left[i]);
    for (let i = 1; i < 10; i++) { const a = Math.PI * (i / 10); pts.push([cx - Math.cos(a) * R, cy + Math.sin(a) * R * 0.98]); }
    const N = pts.length;
    let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      // tension reduite autour de la pointe pour la garder fine
      const k = i === n - 1 || i === n ? 12 : 6;
      d += `C${(p1[0] + (p2[0] - p0[0]) / k).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / k).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / k).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / k).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d + 'Z';
  }
  const star = 'M0 -3.2 L.8 -.8 3.2 0 .8 .8 0 3.2 -.8 .8 -3.2 0 -.8 -.8Z';
  const eye = (cls) => `<g class="eye ${cls}"><g class="e-open"><ellipse rx="3.2" ry="4.3" fill="${INK}"/><circle class="e-shine" cx="1.1" cy="-1.7" r="1.15" fill="#fff"/></g>
    <path class="e-arc" d="M-3.3 1.2 Q0 -3.6 3.3 1.2" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path class="e-line" d="M-3.2 0 Q0 2.4 3.2 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/></g>`;
  function svg(id) {
    return `<svg class="follet" viewBox="0 0 64 64" aria-hidden="true" overflow="visible">
      <defs>
        <radialGradient id="fg${id}" cx="50%" cy="60%" r="50%"><stop offset="0" style="stop-color:var(--md-primary);stop-opacity:.6"/><stop offset="1" style="stop-color:var(--md-primary);stop-opacity:0"/></radialGradient>
        <linearGradient id="fb${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--md-tertiary)"/><stop offset=".5" style="stop-color:var(--md-primary)"/><stop offset="1" style="stop-color:color-mix(in srgb, var(--md-primary) 80%, #fff)"/></linearGradient>
        <radialGradient id="fc${id}" cx="50%" cy="70%" r="60%"><stop offset="0" style="stop-color:#fff;stop-opacity:.85"/><stop offset=".55" style="stop-color:color-mix(in srgb, var(--md-primary) 45%, #fff);stop-opacity:.5"/><stop offset="1" style="stop-color:var(--md-primary);stop-opacity:0"/></radialGradient>
        <filter id="fx${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
      </defs>
      <ellipse class="f-halo" cx="32" cy="42" rx="27" ry="24" fill="url(#fg${id})"/>
      <g class="f-embers">${'<circle r="1" style="fill:var(--md-tertiary)"/>'.repeat(8)}</g>
      <g class="f-sparks">${`<path d="${star}" style="fill:var(--md-tertiary)"/>`.repeat(3)}</g>
      <g class="f-z" style="fill:var(--md-on-surface-variant);font:700 9px sans-serif"><text>z</text><text>z</text></g>
      <g class="f-body">
        <path class="f-aura" style="fill:var(--md-primary)" opacity=".38" filter="url(#fx${id})"/>
        <path class="f-main" fill="url(#fb${id})"/>
        <path class="f-core" fill="url(#fc${id})"/>
        <ellipse class="f-shine" cx="24.5" cy="31" rx="2.6" ry="4.2" fill="#fff" opacity=".28" transform="rotate(-24 24.5 31)"/>
        <g class="f-face">
          <ellipse class="f-cheek" cx="21.5" cy="46.5" rx="3" ry="1.7" style="fill:var(--md-tertiary)" opacity=".5"/>
          <ellipse class="f-cheek" cx="42.5" cy="46.5" rx="3" ry="1.7" style="fill:var(--md-tertiary)" opacity=".5"/>
          ${eye('l')}${eye('r')}
          <path class="f-mouth" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
    </svg>`;
  }

  const MOUTH = {
    idle: 'M29.6 48.2 Q32 50.2 34.4 48.2',
    music: 'M29 47.6 Q32 52.4 35 47.6 Z',
    happy: 'M28.8 47.4 Q32 53 35.2 47.4 Z',
    sleep: 'M30.4 49 Q32 49.8 33.6 49',
    think: 'M31 49.2 Q32.6 48.4 34 49.4',
    alert: 'M30.4 49.6 Q32 46.6 33.6 49.6 Q32 51.4 30.4 49.6 Z',
  };

  let uid = 0;
  const all = new Set();

  function create(host, { size = 64, mood = 'idle', track = true, active = null } = {}) {
    const id = ++uid;
    host.innerHTML = svg(id);
    const el = host.firstElementChild;
    el.style.width = el.style.height = size + 'px';
    const q = (s) => el.querySelector(s), qa = (s) => [...el.querySelectorAll(s)];
    const parts = {
      halo: q('.f-halo'), body: q('.f-body'), aura: q('.f-aura'), main: q('.f-main'), core: q('.f-core'), face: q('.f-face'), mouth: q('.f-mouth'),
      eyes: qa('.eye'), embers: qa('.f-embers circle'), sparks: qa('.f-sparks path'), zs: qa('.f-z text'),
    };
    const st = {
      host, el, parts, size, track, active, seed: Math.random() * 100,
      mood: null, p: { ...MOODS.idle }, phase: 0, last: 0,
      sq: 0, sqv: 0, beat: 0,
      look: [0, 0], lookT: [0, 0],
      blinkAt: performance.now() + 1500 + Math.random() * 3000, blink: 0,
      ember: [], spawn: 0, sparkW: 0, zW: 0,
    };
    const api = {
      el, get mood() { return st.mood; }, track,
      setMood(m) {
        if (!MOODS[m] || m === st.mood) return;
        const prev = st.mood; st.mood = m;
        el.dataset.mood = m;
        parts.mouth.setAttribute('d', MOUTH[m]);
        parts.mouth.style.fill = /music|happy|alert/.test(m) ? INK : 'none';
        parts.eyes.forEach((e) => { e.classList.toggle('arc', m === 'music' || m === 'happy'); e.classList.toggle('closed', m === 'sleep'); });
        if (prev && m !== 'sleep') api.bump(m === 'alert' ? 1.4 : 0.8);
      },
      lookAt(x, y) {
        const r = el.getBoundingClientRect(); if (!r.width) return;
        const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * 0.62);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 180);
        st.lookT = [(dx / d) * 1.5 * k, (dy / d) * 1.2 * k];
      },
      bump(f = 1) { st.sqv -= 2.4 * f; },
      // dessine une image fixe (pour l'icone PNG)
      frame(t = 0) { render(st, 1 / 60, t, true); },
    };
    st.api = api;
    api.setMood(mood);
    render(st, 1 / 60, 0, true);
    all.add(st);
    if (!raf) raf = requestAnimationFrame(loop);
    return api;
  }

  function visible(st) {
    if (!st.el.isConnected) { all.delete(st); return false; }
    if (st.active && !st.active()) return false;
    return st.host.offsetParent !== null || st.host.getClientRects().length > 0;
  }

  function render(st, dt, now, still) {
    const P = st.p, T = MOODS[st.mood] || MOODS.idle, k = Math.min(1, dt * 3);
    for (const key in T) P[key] = lerp(P[key], T[key], k);
    st.phase += dt * P.speed;
    const t = st.phase, s = st.seed, parts = st.parts;

    // ressort (squash & stretch)
    if (!still) {
      st.sqv += (-170 * st.sq - 11 * st.sqv) * dt;
      st.sq += st.sqv * dt;
    }
    // mouvement d'ensemble selon l'humeur
    let dy = Math.sin(t * 2.1) * 1.4, rot = 0, dx = 0;
    if (st.mood === 'music' || st.mood === 'happy') {
      const period = st.mood === 'music' ? 0.5 : 0.75, ph = ((now / 1000) % period) / period;
      if (ph < st.beat && !still) st.sqv -= st.mood === 'music' ? 1.1 : 1.5;
      st.beat = ph;
      dy = -Math.sin(ph * Math.PI) * (st.mood === 'music' ? 2.6 : 3.6);
      rot = st.mood === 'music' ? Math.sin((now / 1000) * Math.PI * 2) * 4 : 0;
    } else if (st.mood === 'think') { rot = Math.sin(t * 0.9) * 6; dy = Math.sin(t * 1.2) * 1.2 - 0.6; }
    else if (st.mood === 'alert') { dx = Math.sin(now / 28) * 1.3 * Math.max(0, 1 - ((now / 1000) % 2.2)); }
    else if (st.mood === 'sleep') { dy = Math.sin(t * 1.4) * 1 + 1.5; }

    const sq = Math.max(-0.3, Math.min(0.3, st.sq));
    const sy = 1 + sq, sx = 1 - sq * 0.7;
    parts.body.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${rot.toFixed(2)} 32 50) translate(32 56) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-32 -56)`);

    // la flamme
    const sway = Math.sin(t * 1.3) * 0.35 + 0.18 * noise(t * 0.7, s + 5);
    const H = 31 * P.h;
    parts.aura.setAttribute('d', flame(32, 42, 18, H + 6, sway * 1.1, t * 1.1, P.flick * 1.4, s + 1));
    parts.main.setAttribute('d', flame(32, 42, 15, H, sway, t, P.flick, s));
    parts.core.setAttribute('d', flame(32, 47, 8.5, H * 0.5, sway * 0.7, t * 1.3, P.flick * 0.9, s + 3));
    parts.halo.setAttribute('opacity', (P.glow * (0.82 + 0.18 * Math.sin(t * 2.4))).toFixed(3));
    parts.face.setAttribute('transform', `translate(${(sway * 1.2).toFixed(2)} 0)`);

    // yeux : regard qui suit en douceur, clignements aleatoires
    st.look[0] = lerp(st.look[0], st.mood === 'think' ? 1.2 : st.lookT[0], Math.min(1, dt * 8));
    st.look[1] = lerp(st.look[1], st.mood === 'think' ? -1.4 : st.lookT[1], Math.min(1, dt * 8));
    if (!still && now > st.blinkAt) { st.blink = 1; st.blinkAt = now + 1800 + Math.random() * 4200; if (Math.random() < 0.2) st.blinkAt = now + 260; }
    st.blink = Math.max(0, st.blink - dt * 7);
    const open = st.mood === 'alert' ? 1.18 : 1;
    const by = Math.max(0.08, 1 - Math.sin(st.blink * Math.PI)) * open;
    parts.eyes.forEach((e, i) => e.setAttribute('transform', `translate(${(i ? 38 : 26) + st.look[0]} ${41 + st.look[1]}) scale(${open} ${by.toFixed(3)})`));

    // braises qui montent de la pointe
    if (!still) {
      st.spawn += dt * P.embers;
      while (st.spawn >= 1) {
        st.spawn -= 1;
        if (st.ember.length < parts.embers.length) st.ember.push({ x: 32 + sway * 10 + (Math.random() - 0.5) * 9, y: 41 - H * 0.55 + Math.random() * 6, vy: -(7 + Math.random() * 6), w: Math.random() * 6, life: 0, max: 1.2 + Math.random() * 0.9, r: 0.8 + Math.random() * 0.9 });
      }
    }
    st.ember = st.ember.filter((p) => (p.life += dt) < p.max);
    parts.embers.forEach((c, i) => {
      const p = st.ember[i];
      if (!p) { c.setAttribute('opacity', 0); return; }
      const a = p.life / p.max;
      c.setAttribute('cx', (p.x + Math.sin(p.w + p.life * 4) * 1.6).toFixed(2));
      c.setAttribute('cy', (p.y + p.vy * p.life).toFixed(2));
      c.setAttribute('r', (p.r * (1 - a * 0.7)).toFixed(2));
      c.setAttribute('opacity', (Math.sin(a * Math.PI) * 0.9).toFixed(2));
    });

    // etincelles de reflexion et "z" du sommeil, en fondu
    st.sparkW = lerp(st.sparkW, st.mood === 'think' ? 1 : 0, Math.min(1, dt * 5));
    parts.sparks.forEach((p, i) => {
      const a = t * 1.5 + (i * Math.PI * 2) / 3, sc = (0.6 + 0.4 * Math.sin(t * 4 + i * 2)) * st.sparkW;
      p.setAttribute('transform', `translate(${(32 + Math.cos(a) * 25).toFixed(2)} ${(34 + Math.sin(a) * 13).toFixed(2)}) scale(${sc.toFixed(3)})`);
    });
    st.zW = lerp(st.zW, st.mood === 'sleep' ? 1 : 0, Math.min(1, dt * 3));
    parts.zs.forEach((z, i) => {
      const a = ((now / 1000 / 2.6) + i * 0.5) % 1;
      z.setAttribute('x', (44 + a * 8).toFixed(2)); z.setAttribute('y', (18 - a * 12).toFixed(2));
      z.setAttribute('font-size', 6 + a * 5);
      z.setAttribute('opacity', (Math.sin(a * Math.PI) * st.zW).toFixed(2));
    });
  }

  let raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    for (const st of all) {
      if (!visible(st)) { st.last = 0; continue; }
      // les petites mascottes se contentent de ~30 images/s
      const minGap = st.size < 40 ? 32 : 0;
      if (st.last && now - st.last < minGap) continue;
      const dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 1 / 60;
      st.last = now;
      render(st, dt, now, false);
    }
    if (!all.size) { cancelAnimationFrame(raf); raf = 0; }
  }

  document.addEventListener('mousemove', (e) => { for (const st of all) if (st.track && st.el.isConnected) st.api.lookAt(e.clientX, e.clientY); });

  // PNG fixe aux couleurs du theme (icone de la zone de notification, avatar de discussion)
  async function png(size = 64) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-200px;top:0;width:64px;height:64px';
    document.body.appendChild(host);
    const f = create(host, { size: 64, track: false });
    f.frame(0.4);
    const cs = getComputedStyle(document.documentElement);
    const resolve = (s) => s.replace(/var\((--md-[a-z-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim());
    // l'icone n'a pas besoin des braises ni du halo flou (illisible en 16 px)
    const s = resolve(f.el.outerHTML).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ')
      .replace(/<g class="f-(embers|sparks|z)"[\s\S]*?<\/g>/g, '');
    host.remove();
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  }

  const style = document.createElement('style');
  style.textContent = `.follet { display: block; overflow: visible; }
    .follet .e-arc, .follet .e-line { display: none; }
    .follet .eye.arc .e-open, .follet .eye.closed .e-open { display: none; }
    .follet .eye.arc .e-arc, .follet .eye.closed .e-line { display: inline; }`;
  document.head.appendChild(style);

  return { create, png };
})();

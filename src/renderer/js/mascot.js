/* Follet, la mascotte : un petit feu follet en SVG, anime en CSS, aux couleurs du theme.
   Humeurs : idle, music, sleep, think, happy, alert. Les yeux suivent la souris. */
const Follet = (() => {
  const INK = '#1d1b20';
  // Trois silhouettes de flamme de meme structure : CSS interpole entre elles (propriete d)
  const SHAPES = [
    'M32 5 C35 14 47 21 47 38 C47 49 40 57 32 57 C24 57 17 49 17 38 C17 27 25 22 27 13 C29 17 31 12 32 5 Z',
    'M34 6 C36 15 47 22 47 38 C47 49 40 57 32 57 C24 57 17 49 17 38 C17 27 26 22 28 14 C30 18 33 12 34 6 Z',
    'M30 5 C33 14 47 21 47 38 C47 49 40 57 32 57 C24 57 17 49 17 38 C17 26 24 21 26 13 C28 17 29 11 30 5 Z',
  ];
  const CSS = `
  .follet { display: block; overflow: visible; }
  .follet .f-glow { transform-origin: 32px 40px; animation: f-glow 3s ease-in-out infinite; }
  .follet .f-float { animation: f-float 3.2s ease-in-out infinite; }
  .follet .f-bounce { transform-origin: 32px 57px; }
  .follet .f-body { animation: f-flick 1.7s ease-in-out infinite; }
  .follet .f-lid { transform-box: fill-box; transform-origin: center; animation: f-blink 5s infinite; }
  .follet .open { fill: ${INK}; }
  .follet .shine { fill: #fff; }
  .follet .arc, .follet .line { fill: none; stroke: ${INK}; stroke-width: 1.9; stroke-linecap: round; display: none; }
  .follet .f-cheek { fill: var(--md-tertiary); opacity: .45; }
  .follet .f-mouth { fill: none; stroke: ${INK}; stroke-width: 1.6; stroke-linecap: round; opacity: 0; transition: opacity .3s; }
  .follet .f-sparks path { fill: var(--md-tertiary); opacity: 0; transform-box: fill-box; transform-origin: center; }
  .follet .f-z { font: 700 11px sans-serif; fill: var(--md-on-surface-variant); opacity: 0; }

  .follet.m-music .f-bounce { animation: f-dance .46s ease-in-out infinite alternate; }
  .follet.m-music .f-lid, .follet.m-happy .f-lid { display: none; }
  .follet.m-music .arc, .follet.m-happy .arc { display: inline; }
  .follet.m-music .f-mouth, .follet.m-happy .f-mouth { opacity: 1; }
  .follet.m-happy .f-bounce { animation: f-hop .9s ease-in-out 2; }

  .follet.m-sleep .f-lid { display: none; }
  .follet.m-sleep .line { display: inline; }
  .follet.m-sleep .f-float { animation-duration: 6s; }
  .follet.m-sleep .f-body { animation-duration: 3.5s; }
  .follet.m-sleep .f-glow { opacity: .45; }
  .follet.m-sleep .f-z { animation: f-z 3s ease-in-out infinite; }

  .follet.m-think .f-sparks path { animation: f-twinkle 1.4s ease-in-out infinite; }
  .follet.m-think .f-sparks path:nth-child(2) { animation-delay: .45s; }
  .follet.m-think .f-sparks path:nth-child(3) { animation-delay: .9s; }
  .follet.m-think .f-bounce { animation: f-ponder 2.4s ease-in-out infinite; }
  .follet.m-think .f-body { animation-duration: .9s; }

  .follet.m-alert .f-bounce { animation: f-shake .35s ease-in-out 4; }
  .follet.m-alert .f-lid { animation: none; transform: scale(1.18); }
  .follet.m-alert .f-glow { animation-duration: .8s; }

  .follet.bump .f-bounce { animation: f-bump .45s cubic-bezier(.42,1.67,.21,.9); }

  @keyframes f-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
  @keyframes f-glow { 0%, 100% { opacity: .75; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
  @keyframes f-flick { 0%, 100% { d: path("${SHAPES[0]}"); } 33% { d: path("${SHAPES[1]}"); } 66% { d: path("${SHAPES[2]}"); } }
  @keyframes f-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
  @keyframes f-dance { from { transform: scale(1.05, .93); } to { transform: translateY(-3px) scale(.96, 1.06) rotate(-3deg); } }
  @keyframes f-hop { 0%, 100% { transform: none; } 40% { transform: translateY(-6px) scale(.95, 1.07); } 70% { transform: scale(1.06, .94); } }
  @keyframes f-ponder { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg) translateY(-1px); } }
  @keyframes f-shake { 0%, 100% { transform: none; } 25% { transform: translateX(-2px) rotate(-4deg); } 75% { transform: translateX(2px) rotate(4deg); } }
  @keyframes f-bump { 0% { transform: none; } 40% { transform: translateY(-5px) scale(.94, 1.08); } 100% { transform: none; } }
  @keyframes f-twinkle { 0%, 100% { opacity: 0; transform: scale(.4); } 50% { opacity: 1; transform: scale(1); } }
  @keyframes f-z { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(5px, -8px); } }
  `;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  let uid = 0;
  const all = new Set();
  const eye = (x) => `<g transform="translate(${x} 40)"><g class="f-lid"><g class="f-look"><ellipse class="open" rx="3.3" ry="4.4"/><circle class="shine" cx="1.1" cy="-1.6" r="1.1"/></g></g><path class="arc" d="M-3.2 1 Q0 -3.4 3.2 1"/><path class="line" d="M-3.2 .5 Q0 2.4 3.2 .5"/></g>`;
  function svg(id) {
    return `<svg class="follet" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="fg-${id}" cx="50%" cy="62%" r="50%"><stop offset="0" style="stop-color:var(--md-primary);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--md-primary);stop-opacity:0"/></radialGradient>
        <linearGradient id="fb-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--md-tertiary)"/><stop offset=".55" style="stop-color:var(--md-primary)"/><stop offset="1" style="stop-color:var(--md-primary)"/></linearGradient>
        <linearGradient id="fc-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--md-on-primary-container);stop-opacity:0"/><stop offset="1" style="stop-color:var(--md-on-primary-container);stop-opacity:.55"/></linearGradient>
      </defs>
      <circle class="f-glow" cx="32" cy="40" r="26" fill="url(#fg-${id})"/>
      <g class="f-float"><g class="f-bounce">
        <path class="f-body" fill="url(#fb-${id})" d="${SHAPES[0]}"/>
        <path class="f-core" fill="url(#fc-${id})" d="M32 26 C35 32 41 35 41 43 C41 49 37 53 32 53 C27 53 23 49 23 43 C23 36 29 33 32 26 Z"/>
        <ellipse class="f-cheek" cx="21.5" cy="45.5" rx="3" ry="1.8"/><ellipse class="f-cheek" cx="42.5" cy="45.5" rx="3" ry="1.8"/>
        ${eye(26)}${eye(38)}
        <path class="f-mouth" d="M29.5 47.5 Q32 50 34.5 47.5"/>
      </g>
      <g class="f-sparks"><path d="M52 14 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z"/><path d="M10 22 l.9 2.2 2.2 .9 -2.2 .9 -.9 2.2 -.9 -2.2 -2.2 -.9 2.2 -.9z"/><path d="M51 49 l.8 2 2 .8 -2 .8 -.8 2 -.8 -2 -2 -.8 2 -.8z"/></g>
      <text class="f-z" x="44" y="17">z</text></g>
    </svg>`;
  }

  function create(host, { size = 64, mood = 'idle', track = true } = {}) {
    const id = ++uid;
    host.innerHTML = svg(id);
    const el = host.firstElementChild;
    el.style.width = el.style.height = size + 'px';
    const looks = [...el.querySelectorAll('.f-look')];
    const api = {
      el, mood: null, track,
      setMood(m) { if (m === api.mood) return; if (api.mood) el.classList.remove('m-' + api.mood); el.classList.add('m-' + m); api.mood = m; },
      lookAt(x, y) {
        const r = el.getBoundingClientRect(); if (!r.width) return;
        const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * 0.6);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
        looks.forEach((g) => g.setAttribute('transform', `translate(${((dx / d) * 1.4 * k).toFixed(2)} ${((dy / d) * 1.2 * k).toFixed(2)})`));
      },
      bump() { el.classList.remove('bump'); void el.getBoundingClientRect(); el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 500); },
    };
    api.setMood(mood);
    all.add(api);
    return api;
  }

  document.addEventListener('mousemove', (e) => { for (const f of all) if (f.track && f.el.isConnected) f.lookAt(e.clientX, e.clientY); });

  // PNG fixe de la mascotte aux couleurs du theme (icone de la zone de notification)
  async function png(size = 64) {
    const cs = getComputedStyle(document.documentElement);
    const resolve = (s) => s.replace(/var\((--md-[a-z-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim());
    let s = svg('png').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/<g class="f-sparks">[\s\S]*?<\/text>/, '')
      .replace('<defs>', `<style>${CSS.split('@keyframes')[0]}</style><defs>`);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(resolve(s));
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  }

  return { create, png };
})();

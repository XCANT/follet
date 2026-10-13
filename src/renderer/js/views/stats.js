/* Stats : courbes CPU / GPU / RAM sur 5 min, reseau + test de vitesse, stockage, top des applis. */
I.view('stats', {
  label: 'Stats', icon: 'monitoring',
  html: `<div class="grid v-stats">
    <div class="card activity">
      <div class="metrics">
        <button class="metric state on" data-s="cpu"><i class="dot"></i><div><div class="m-lbl">Processeur</div><div class="m-val"><b>—</b><small>%</small></div><div class="m-sub"></div></div></button>
        <button class="metric state on" data-s="gpu"><i class="dot"></i><div><div class="m-lbl">Carte graphique</div><div class="m-val"><b>—</b><small>%</small></div><div class="m-sub"></div></div></button>
        <button class="metric state on" data-s="ram"><i class="dot"></i><div><div class="m-lbl">Mémoire</div><div class="m-val"><b>—</b><small>%</small></div><div class="m-sub"></div></div></button>
      </div>
      <div class="chart"><canvas></canvas><span class="ax l">il y a 5 min</span><span class="ax r">maintenant</span></div>
    </div>
    <div class="card top-apps">
      <div class="card-title"><span>Ce qui consomme</span><div class="seg-top"></div></div>
      <div class="scroll proc-list"></div>
      <div class="sys-chips"></div>
    </div>
    <div class="row2">
      <div class="card net">
        <div class="card-title"><span>Internet</span><button class="btn text sm state run-speed">${ms('speed')}Tester la vitesse</button></div>
        <div class="net-now"><span>${ms('arrow_downward', 's18')}<b class="nd">—</b></span><span>${ms('arrow_upward', 's18')}<b class="nu">—</b></span></div>
        <div class="chart small"><canvas></canvas></div>
        <div class="speed-res"></div>
      </div>
      <div class="card disks"><div class="card-title"><span>Stockage</span>${ms('hard_drive')}</div><div class="disk-list"></div></div>
    </div>
  </div>`,

  init(el) {
    this.el = el; this.hidden = new Set(); this.sort = 'mem';
    segmented($('.seg-top', el), [['mem', 'RAM'], ['cpu', 'CPU']], 'mem', (v) => { this.sort = v; this.renderProcs(); });
    $$('.metric', el).forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.s; this.hidden.has(s) ? this.hidden.delete(s) : this.hidden.add(s);
      b.classList.toggle('on', !this.hidden.has(s)); this.draw();
    }));
    $('.run-speed', el).addEventListener('click', () => this.runSpeed());
    follet.onSpeedtest((p) => this.showSpeed({ ...(this.speed || {}), [p.phase]: p.value }, true));
    follet.speedtestLast().then((r) => r && this.showSpeed(r));
    I.on('theme', () => { this.colors = null; this.draw(); });
    new ResizeObserver(() => this.draw()).observe($('.activity .chart', el));
  },

  show() {
    follet.statsActive(true);
    this.poll(); this.pollProcs();
    clearInterval(this.t1); clearInterval(this.t2);
    this.t1 = setInterval(() => this.poll(), 2000);
    this.t2 = setInterval(() => this.pollProcs(), 3000);
  },
  hide() { follet.statsActive(false); clearInterval(this.t1); clearInterval(this.t2); },

  palette() {
    if (!this.colors) {
      const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
      this.colors = { cpu: v('--md-primary'), gpu: v('--md-tertiary'), ram: v('--md-on-surface-variant'), grid: v('--md-outline-variant'), down: v('--md-primary'), up: v('--md-tertiary') };
      $$('.metric', this.el).forEach((b) => b.style.setProperty('--c', this.colors[b.dataset.s]));
    }
    return this.colors;
  },

  async poll() {
    const s = await follet.stats().catch(() => null); if (!s) return;
    this.s = s;
    const el = this.el, set = (k, val, sub) => { const m = $(`.metric[data-s=${k}]`, el); $('b', m).textContent = val; $('.m-sub', m).textContent = sub; };
    set('cpu', s.cpu.load, [s.cpu.mhz ? (s.cpu.mhz / 1000).toFixed(2) + ' GHz' : null, s.cpu.temp != null ? Math.round(s.cpu.temp) + ' °C' : null].filter(Boolean).join(' · '));
    const g = s.gpu;
    set('gpu', g ? g.util : '—', g ? `${g.temp} °C · ${g.power != null ? Math.round(g.power) + ' W · ' : ''}${(g.memUsed / 1024).toFixed(1)}/${(g.memTotal / 1024).toFixed(0)} Go` : 'Pas de GPU NVIDIA');
    const used = s.ram.total - s.ram.free;
    set('ram', Math.round((100 * used) / s.ram.total), `${(used / 1073741824).toFixed(1)} / ${(s.ram.total / 1073741824).toFixed(0)} Go`);
    $('.nd', el).textContent = s.net ? fmtBytes(s.net.down) + '/s' : '—';
    $('.nu', el).textContent = s.net ? fmtBytes(s.net.up) + '/s' : '—';
    $('.disk-list', el).innerHTML = s.disks.map((d) => {
      const u = d.total - d.free, p = (100 * u) / d.total;
      return `<div class="disk"><div class="d-top"><b>${d.name}</b><span>${fmtBytes(d.free)} libres</span><span class="variant">sur ${fmtBytes(d.total)}</span></div>
        <div class="linear thick"><i style="width:${p}%;${p > 90 ? 'background:var(--md-error)' : ''}"></i></div></div>`;
    }).join('');
    const up = s.uptime, b = I.views.home.battery;
    const chips = [
      [ 'schedule', `Allumé depuis ${Math.floor(up / 86400) ? Math.floor(up / 86400) + ' j ' : ''}${Math.floor((up % 86400) / 3600)} h ${Math.floor((up % 3600) / 60)} min` ],
      g ? ['developer_board', g.name.replace(/NVIDIA GeForce /, '')] : null,
      ['memory', `${s.cpu.threads} threads`],
      b && b.present ? [b.plugged ? 'battery_charging_full' : 'battery_full', `${b.percent} %`] : null,
      s.self ? ['local_fire_department', `Follet : ${s.self.cpu.toFixed(1)} % · ${fmtBytes(s.self.mem)}`] : null,
    ].filter(Boolean);
    $('.sys-chips', el).innerHTML = chips.map(([i, t]) => `<span class="chip sm">${ms(i)}${esc(t)}</span>`).join('');
    this.draw();
  },

  // Courbes lissees avec degrade ; l'historique vient du processus principal
  draw() {
    if (!this.s || !this.el) return;
    const c = this.palette(), h = this.s.history || [];
    this.plot($('.activity canvas', this.el), h, ['ram', 'gpu', 'cpu'].filter((k) => !this.hidden.has(k)).map((k) => ({ key: k, color: c[k] })), 100, true);
    const maxNet = Math.max(1, ...h.map((p) => Math.max(p.down, p.up)));
    this.plot($('.net canvas', this.el), h, [{ key: 'up', color: c.up }, { key: 'down', color: c.down }], maxNet * 1.15, false);
  },
  plot(cv, h, series, max, grid) {
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (grid) {
      g.strokeStyle = this.colors.grid; g.globalAlpha = .5; g.lineWidth = 1; g.setLineDash([2, 4]);
      for (const y of [.25, .5, .75]) { g.beginPath(); g.moveTo(0, Math.round(H * y) + .5); g.lineTo(W, Math.round(H * y) + .5); g.stroke(); }
      g.setLineDash([]); g.globalAlpha = 1;
    }
    const N = 150, step = W / (N - 1), pad = 3;
    for (const s of series) {
      const pts = h.map((p, i) => [W - (h.length - 1 - i) * step, p[s.key]]).filter((p) => p[1] != null)
        .map(([x, v]) => [x, pad + (H - 2 * pad) * (1 - Math.min(1, v / max))]);
      if (pts.length < 2) continue;
      const path = new Path2D(); path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; path.bezierCurveTo(mx, y0, mx, y1, x1, y1); }
      const fill = new Path2D(path); fill.lineTo(pts[pts.length - 1][0], H); fill.lineTo(pts[0][0], H); fill.closePath();
      const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, s.color + '55'); grad.addColorStop(1, s.color + '00');
      g.fillStyle = grad; g.fill(fill);
      g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(path);
      const [lx, ly] = pts[pts.length - 1];
      g.fillStyle = s.color; g.beginPath(); g.arc(lx - 1, ly, 3.5, 0, Math.PI * 2); g.fill();
    }
  },

  async pollProcs() { this.procs = await follet.procs().catch(() => null); this.renderProcs(); },
  renderProcs() {
    const p = this.procs, el = $('.proc-list', this.el);
    if (!p) { el.innerHTML = `<div class="empty">${ms('hourglass_empty')}Analyse…</div>`; return; }
    const list = this.sort === 'mem' ? p.byMem : p.byCpu;
    const max = Math.max(1, ...list.map((x) => (this.sort === 'mem' ? x.mem : x.cpu)));
    el.innerHTML = list.map((x, i) => {
      const v = this.sort === 'mem' ? x.mem : x.cpu;
      const icon = x.label === 'Follet' && I.views.ai.avatar ? I.views.ai.avatar : x.icon;
      return `<div class="proc"><span class="rank">${i + 1}</span>${icon ? `<img src="${icon}">` : `<div class="ph">${ms('apps', 's18')}</div>`}
        <div class="p-mid"><div class="p-top"><span class="nm ellipsis" title="${esc(x.name)}">${esc(x.label)}</span><span class="v">${this.sort === 'mem' ? fmtBytes(x.mem, 1) : x.cpu.toFixed(1) + ' %'}</span></div>
        <div class="linear"><i style="width:${(100 * v) / max}%"></i></div>${x.count > 1 ? `<div class="cnt">${x.count} processus</div>` : ''}</div></div>`;
    }).join('');
  },

  showSpeed(r, live) {
    this.speed = r;
    const cell = (v, u, l) => `<div><b>${v == null ? '…' : v}</b><span>${u}</span><small>${l}</small></div>`;
    $('.speed-res', this.el).innerHTML = cell(r.ping != null ? Math.round(r.ping) : null, 'ms', 'latence') + cell(r.down != null ? fmtMbps(r.down) : null, 'Mb/s', 'réception') + cell(r.up != null ? fmtMbps(r.up) : null, 'Mb/s', 'envoi')
      + (!live && r.at ? `<span class="when">Testé ${ago(r.at)}</span>` : '');
  },
  async runSpeed() {
    const b = $('.run-speed', this.el); b.disabled = true; b.innerHTML = `${ms('progress_activity')}Test en cours…`;
    this.showSpeed({}, true);
    const r = await follet.speedtest().catch(() => null);
    b.disabled = false; b.innerHTML = `${ms('speed')}Tester la vitesse`;
    if (r) this.showSpeed(r); else snack('Test de vitesse impossible');
  },
});

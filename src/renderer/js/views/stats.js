/* Stats : anneaux CPU / GPU / RAM, top des applis, disques, reseau + test de vitesse, systeme. */
I.view('stats', {
  label: 'Stats', icon: 'monitoring',
  html: `<div class="grid v-stats">
    <div class="card ring-card" data-r="cpu"><div class="ring"></div><div class="ring-name">Processeur</div><div class="ring-sub"></div></div>
    <div class="card ring-card" data-r="gpu"><div class="ring"></div><div class="ring-name">Carte graphique</div><div class="ring-sub"></div></div>
    <div class="card ring-card" data-r="ram"><div class="ring"></div><div class="ring-name">Mémoire</div><div class="ring-sub"></div></div>
    <div class="card top-apps">
      <div class="card-title"><span>Applis</span><div class="seg-top"></div></div>
      <div class="scroll proc-list" style="flex:1"></div>
    </div>
    <div class="bottom-row">
      <div class="card disks"><div class="card-title"><span>Disques</span>${ms('hard_drive')}</div><div class="disk-list"></div></div>
      <div class="card net">
        <div class="card-title"><span>Internet</span><button class="btn text sm state run-speed">${ms('speed')}Tester</button></div>
        <div class="speed"><div><b class="sp-ping">—</b><span>ms</span></div><div><b class="sp-down">—</b><span>Mb/s ↓</span></div><div><b class="sp-up">—</b><span>Mb/s ↑</span></div></div>
        <div class="net-live"></div>
      </div>
      <div class="card sys"><div class="card-title"><span>Système</span>${ms('memory')}</div><div class="sys-list"></div></div>
    </div>
  </div>`,

  init(el) {
    this.el = el;
    this.g = gauge(112, 10);
    $$('.ring', el).forEach((r) => (r.innerHTML = this.g.html('<span class="rv">—</span>')));
    this.sort = 'mem';
    segmented($('.seg-top', el), [['mem', 'RAM'], ['cpu', 'CPU']], 'mem', (v) => { this.sort = v; this.renderProcs(); });
    $('.run-speed', el).addEventListener('click', () => this.runSpeed());
    island.onSpeedtest((p) => {
      if (p.phase === 'ping') $('.sp-ping', el).textContent = p.value;
      if (p.phase === 'down') $('.sp-down', el).textContent = fmtMbps(p.value);
      if (p.phase === 'up') $('.sp-up', el).textContent = fmtMbps(p.value);
    });
    island.speedtestLast().then((r) => r && this.showSpeed(r));
  },

  show() {
    this.poll(); this.pollProcs();
    clearInterval(this.t1); clearInterval(this.t2);
    this.t1 = setInterval(() => this.poll(), 2000);
    this.t2 = setInterval(() => this.pollProcs(), 3000);
  },
  hide() { clearInterval(this.t1); clearInterval(this.t2); },

  async poll() {
    const s = await island.stats().catch(() => null); if (!s) return;
    const el = this.el, set = (k, pct, val, sub) => {
      const card = $(`[data-r=${k}]`, el);
      this.g.set($('.gauge', card), pct ?? 0);
      $('.rv', card).innerHTML = val;
      $('.ring-sub', card).innerHTML = sub;
    };
    const ghz = s.cpu.mhz ? (s.cpu.mhz / 1000).toFixed(2) + ' GHz' : null;
    set('cpu', s.cpu.load, `${s.cpu.load}<small>%</small>`, [ghz, s.cpu.temp != null ? Math.round(s.cpu.temp) + ' °C' : null].filter(Boolean).join(' · ') || esc(s.cpu.model));
    const g = s.gpu;
    set('gpu', g ? g.util : 0, g ? `${g.util}<small>%</small>` : '—', g ? `${g.temp} °C · ${g.power != null ? Math.round(g.power) + ' W' : ''}<br>${(g.memUsed / 1024).toFixed(1)} / ${(g.memTotal / 1024).toFixed(0)} Go VRAM` : 'nvidia-smi indisponible');
    const used = s.ram.total - s.ram.free, pct = Math.round((100 * used) / s.ram.total);
    set('ram', pct, `${pct}<small>%</small>`, `${(used / 1073741824).toFixed(1)} / ${(s.ram.total / 1073741824).toFixed(0)} Go`);

    $('.disk-list', el).innerHTML = s.disks.map((d) => {
      const u = d.total - d.free, p = (100 * u) / d.total;
      return `<div class="disk"><div class="kv"><span><b>${d.name}</b></span><span>${fmtBytes(d.free)} libres / ${fmtBytes(d.total)}</span></div>
        <div class="linear"><i style="width:${p}%;${p > 90 ? 'background:var(--md-error)' : ''}"></i></div></div>`;
    }).join('');
    $('.net-live', el).innerHTML = s.net ? `<span>${ms('arrow_downward', 's18')} <b>${fmtBytes(s.net.down)}/s</b></span><span>${ms('arrow_upward', 's18')} <b>${fmtBytes(s.net.up)}/s</b></span>` : '';
    const up = s.uptime;
    const b = I.views.home.battery;
    $('.sys-list', el).innerHTML = `
      <div class="kv"><span>Allumé depuis</span><b>${Math.floor(up / 86400) ? Math.floor(up / 86400) + ' j ' : ''}${Math.floor((up % 86400) / 3600)} h ${Math.floor((up % 3600) / 60)} min</b></div>
      <div class="kv"><span>Processeur</span><b class="ellipsis" style="max-width:150px" title="${esc(s.cpu.model)}">${s.cpu.threads} threads</b></div>
      ${g ? `<div class="kv"><span>GPU</span><b>${esc(g.name.replace(/NVIDIA GeForce /, ''))}</b></div>` : ''}
      ${b && b.present ? `<div class="kv"><span>Batterie</span><b>${b.percent} %${b.plugged ? ' · secteur' : ''}</b></div>` : ''}
      <div class="kv"><span>Processus</span><b>${this.procs ? this.procs.total : '—'}</b></div>`;
  },

  async pollProcs() { this.procs = await island.procs().catch(() => null); this.renderProcs(); },
  renderProcs() {
    const p = this.procs, el = $('.proc-list', this.el);
    if (!p) { el.innerHTML = `<div class="empty">${ms('hourglass_empty')}Analyse…</div>`; return; }
    const list = this.sort === 'mem' ? p.byMem : p.byCpu;
    const max = Math.max(1, ...list.map((x) => (this.sort === 'mem' ? x.mem : x.cpu)));
    el.innerHTML = list.map((x) => {
      const v = this.sort === 'mem' ? x.mem : x.cpu;
      return `<div class="proc">${x.icon ? `<img src="${x.icon}">` : `<div class="ph">${ms('apps', 's18')}</div>`}
        <div class="ellipsis"><div class="nm ellipsis" title="${esc(x.name)}">${esc(x.label)}${x.count > 1 ? ` <span class="variant">×${x.count}</span>` : ''}</div><div class="linear"><i style="width:${(100 * v) / max}%"></i></div></div>
        <div class="v">${this.sort === 'mem' ? fmtBytes(x.mem, 1) : x.cpu.toFixed(1) + ' %'}</div></div>`;
    }).join('');
  },

  showSpeed(r) {
    $('.sp-ping', this.el).textContent = r.ping;
    $('.sp-down', this.el).textContent = fmtMbps(r.down);
    $('.sp-up', this.el).textContent = fmtMbps(r.up);
    $('.run-speed', this.el).title = 'Dernier test : ' + ago(r.at);
  },
  async runSpeed() {
    const b = $('.run-speed', this.el); b.disabled = true; b.innerHTML = `${ms('progress_activity')}Test…`;
    $('.sp-ping', this.el).textContent = $('.sp-down', this.el).textContent = $('.sp-up', this.el).textContent = '…';
    const r = await island.speedtest().catch(() => null);
    b.disabled = false; b.innerHTML = `${ms('speed')}Tester`;
    if (r) this.showSpeed(r); else snack('Test de vitesse impossible');
  },
});

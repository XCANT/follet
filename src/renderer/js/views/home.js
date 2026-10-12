/* Accueil : lecture en cours, volume, luminosite, raccourcis, etat (batterie, sortie audio, meteo). */
I.view('home', {
  label: 'Accueil', icon: 'home',
  html: `<div class="grid v-home">
    <div class="card np">
      <div class="np-top">
        <div class="np-art">${ms('music_note', 's40')}</div>
        <div class="np-meta">
          <span class="chip sm np-app" style="display:none"></span>
          <div class="np-title">Rien en lecture</div>
          <div class="np-artist">Lance de la musique ou une vidéo</div>
        </div>
      </div>
      <div class="np-bottom">
        <div class="wavy" title="Cliquer pour avancer"><svg preserveAspectRatio="none"></svg></div>
        <div class="np-times"><span class="np-pos"></span><span class="np-dur"></span></div>
        <div class="np-ctrl">
          <button class="icon-btn state" data-m="prev" title="Précédent">${ms('skip_previous', 'fill')}</button>
          <button class="icon-btn state np-play paused" data-m="toggle" title="Lecture/pause">${ms('play_arrow')}</button>
          <button class="icon-btn state" data-m="next" title="Suivant">${ms('skip_next', 'fill')}</button>
        </div>
      </div>
    </div>
    <div class="col">
      <div class="card sliders">
        <div class="slider-row"><span class="lbl">Volume</span><div class="vol"></div><button class="icon-btn sm state mute" title="Couper le son">${ms('volume_up')}</button></div>
        <div class="bright-rows"></div>
      </div>
      <div class="quick"></div>
      <div class="status-row"></div>
    </div>
  </div>`,

  init(el) {
    this.el = el;
    // controles media
    $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => island.mediaCmd(b.dataset.m)));
    $('.wavy', el).addEventListener('click', (e) => {
      const m = I.media; if (!m.present || !m.duration) return;
      const r = e.currentTarget.getBoundingClientRect();
      island.mediaSeek(((e.clientX - r.left) / r.width) * m.duration);
    });
    I.on('media', () => this.renderMedia());
    I.on('tick', () => { if (I.mode === 'expanded' && I.tab === 'home') this.renderProgress(); });
    this.renderMedia();

    // volume
    this.vol = slider($('.vol', el), {
      icon: 'volume_up',
      onInput: (v) => { this.volIcon(v, false); island.setVolume(v); },
    });
    island.onVolume((v) => { this.volume = v; this.vol.set(v.muted ? 0 : v.level); this.volIcon(v.level, v.muted); });
    island.volume().then((v) => v && (this.volume = v, this.vol.set(v.muted ? 0 : v.level), this.volIcon(v.level, v.muted)));
    $('.mute', el).addEventListener('click', () => island.mute(!(this.volume && this.volume.muted)));

    // raccourcis
    const QUICK = [
      ['screenshot_region', 'Capture', 'ms-screenclip:'], ['monitor_heart', 'Tâches', 'taskmgr'], ['folder', 'Fichiers', 'explorer'], ['settings', 'Paramètres', 'ms-settings:'],
      ['calculate', 'Calcul', 'calc'], ['terminal', 'Terminal', 'terminal'], ['wifi', 'Wi-Fi', 'ms-availablenetworks:'], ['bluetooth', 'Bluetooth', 'ms-settings-bluetooth:'],
    ];
    $('.quick', el).innerHTML = QUICK.map(([i, l, u]) => `<button class="state" data-uri="${u}">${ms(i)}<span>${l}</span></button>`).join('');
    $$('.quick button', el).forEach((b) => b.addEventListener('click', () => { island.openUri(b.dataset.uri); I.setMode('collapsed'); }));

    island.onBattery((b) => { this.battery = b; this.renderStatus(); });
    island.battery().then((b) => { this.battery = b; this.renderStatus(); });
  },

  show() { this.loadBrightness(); this.renderStatus(); this.renderProgress(); },

  volIcon(level, muted) {
    const icon = muted || level === 0 ? 'volume_off' : level < 40 ? 'volume_down' : 'volume_up';
    this.vol.setIcon(icon);
    $('.mute .ms', this.el).textContent = muted ? 'volume_off' : 'volume_mute';
  },

  async loadBrightness() {
    if (this.brightLoaded && Date.now() - this.brightLoaded < 60000) return;
    this.brightLoaded = Date.now();
    const list = await island.brightness().catch(() => []);
    const rows = $('.bright-rows', this.el);
    rows.innerHTML = (list || []).map((d, i) => `<div class="slider-row"><span class="lbl ellipsis" title="${esc(d.name || '')}">${d.kind === 'wmi' ? 'Écran intégré' : esc((d.name || 'Écran').replace(/\s*\(.*\)$/, '').split(/[\s-]/).slice(0, 2).join(' '))}</span><div class="br" data-i="${i}"></div><span class="val">${d.value}%</span></div>`).join('');
    (list || []).forEach((d, i) => {
      const row = $(`.br[data-i="${i}"]`, rows);
      let t = null;
      slider(row, {
        value: d.value, icon: 'light_mode',
        onInput: (v) => { row.parentElement.querySelector('.val').textContent = v + '%'; clearTimeout(t); t = setTimeout(() => island.setBrightness(d.id, v), 120); },
      });
    });
  },

  renderStatus() {
    const chips = [];
    const b = this.battery;
    if (b && b.present) chips.push(`<span class="chip">${ms(b.plugged ? 'battery_charging_full' : b.percent < 20 ? 'battery_alert' : 'battery_full', 'fill')}${b.percent} %${b.plugged ? ' · branché' : ''}</span>`);
    if (I.weatherNow) chips.push(`<span class="chip">${ms(I.weatherNow.icon, 'fill')}${I.weatherNow.temp}° ${esc(I.weatherNow.city || '')}</span>`);
    if (I.nextEvent) chips.push(`<span class="chip">${ms('event')}${esc(I.nextEvent)}</span>`);
    $('.status-row', this.el).innerHTML = chips.join('');
  },

  renderMedia() {
    const el = this.el, m = I.media, playing = m.present && m.status === 'Playing';
    const art = $('.np-art', el);
    if (m.present && m.thumb) { art.outerHTML = `<img class="np-art" src="${m.thumb}">`; $('.np', el).style.setProperty('--art', `url("${m.thumb}")`); }
    else if (art.tagName === 'IMG') { art.outerHTML = `<div class="np-art">${ms('music_note', 's40')}</div>`; $('.np', el).style.removeProperty('--art'); }
    $('.np-title', el).textContent = m.present ? m.title || 'Sans titre' : 'Rien en lecture';
    $('.np-artist', el).textContent = m.present ? [m.artist, m.album].filter(Boolean).join(' — ') : 'Lance de la musique ou une vidéo';
    const app = $('.np-app', el);
    app.style.display = m.present && m.appName ? '' : 'none';
    app.innerHTML = `${ms('graphic_eq')}${esc(m.appName || '')}`;
    const play = $('.np-play', el);
    play.classList.toggle('paused', !playing);
    $('.ms', play).textContent = playing ? 'pause' : 'play_arrow';
    $('[data-m=prev]', el).disabled = m.present && m.canPrev === false;
    $('[data-m=next]', el).disabled = m.present && m.canNext === false;
    this.mediaAt = Date.now();
    this.renderProgress();
  },

  // Barre de progression ondulee (M3 expressive) : ondule pendant la lecture, droite en pause
  renderProgress() {
    const el = this.el, m = I.media, svg = $('.wavy svg', el);
    if (!svg) return;
    const w = svg.clientWidth || 380, h = 18, mid = h / 2;
    if (!m.present || !m.duration) { svg.innerHTML = `<line class="w-rest" x1="2" y1="${mid}" x2="${w - 2}" y2="${mid}"/>`; $('.np-pos', el).textContent = ''; $('.np-dur', el).textContent = ''; return; }
    const playing = m.status === 'Playing';
    const pos = Math.min(m.duration, m.position + (playing ? (Date.now() - (this.mediaAt || Date.now())) / 1000 : 0));
    const x = Math.max(2, Math.min(w - 2, (pos / m.duration) * w));
    const amp = playing ? 3 : 0, wl = 22, phase = playing ? (Date.now() / 1000) * 12 : 0;
    let d = `M2 ${mid}`;
    for (let px = 2; px <= x - 6; px += 2) d += ` L${px} ${(mid + amp * Math.sin(((px + phase) / wl) * 2 * Math.PI)).toFixed(2)}`;
    svg.innerHTML = `${x > 8 ? `<path class="w-act" d="${d}"/>` : ''}${x < w - 10 ? `<line class="w-rest" x1="${Math.min(w - 2, x + 8)}" y1="${mid}" x2="${w - 2}" y2="${mid}"/>` : ''}<circle class="w-dot" cx="${x}" cy="${mid}" r="5"/>`;
    $('.np-pos', el).textContent = fmtDur(pos);
    $('.np-dur', el).textContent = fmtDur(m.duration);
    if (playing && I.mode === 'expanded' && I.tab === 'home') { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.renderProgress()); }
  },
  hide() { cancelAnimationFrame(this.raf); },
});

/* Accueil : lecture en cours (visualiseur), son et sortie audio, luminosite, tuiles rapides, etat. */
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
      <div class="viz"><canvas></canvas></div>
      <div class="wavy" title="Cliquer pour avancer"><svg preserveAspectRatio="none"></svg></div>
      <div class="np-times"><span class="np-pos"></span><span class="np-dur"></span></div>
      <div class="np-ctrl">
        <button class="icon-btn side state" data-m="shuffle" title="Aléatoire" style="display:none">${ms('shuffle')}</button>
        <button class="icon-btn state" data-m="prev" title="Précédent">${ms('skip_previous', 'fill')}</button>
        <button class="icon-btn state np-play paused" data-m="toggle" title="Lecture/pause">${ms('play_arrow')}</button>
        <button class="icon-btn state" data-m="next" title="Suivant">${ms('skip_next', 'fill')}</button>
        <button class="icon-btn side state" data-m="repeat" title="Répéter" style="display:none">${ms('repeat')}</button>
      </div>
    </div>
    <div class="col">
      <div class="card sound">
        <div class="vol"></div>
        <button class="out-btn state" title="Changer de sortie audio">${ms('headphones')}<span class="nm">Sortie audio</span>${ms('expand_more')}</button>
        <div class="bright"></div>
      </div>
      <div class="tiles"></div>
      <div class="status-row"></div>
    </div>
  </div>`,

  init(el) {
    this.el = el;
    // controles media
    $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => {
      const m = I.media, a = b.dataset.m;
      if (a === 'shuffle') follet.mediaShuffle(!m.shuffle);
      else if (a === 'repeat') follet.mediaRepeat({ None: 'List', List: 'Track', Track: 'None' }[m.repeat] || 'List');
      else follet.mediaCmd(a);
    }));
    $('.wavy', el).addEventListener('click', (e) => {
      const m = I.media; if (!m.present || !m.duration) return;
      const r = e.currentTarget.getBoundingClientRect();
      follet.mediaSeek(((e.clientX - r.left) / r.width) * m.duration);
    });
    I.on('media', () => this.renderMedia());
    I.on('tick', () => { if (this.visible()) this.renderProgress(); });
    I.on('theme', () => (this.colors = null));
    this.renderMedia();

    // volume
    this.vol = pillSlider($('.vol', el), {
      icon: 'volume_up', label: 'Volume',
      onInput: (v) => { this.vol.set(v, false); this.vol.setIcon(this.volIcon(v, false)); follet.setVolume(v); },
      onIcon: () => follet.mute(!(this.volume && this.volume.muted)),
    });
    const applyVol = (v) => { if (!v) return; this.volume = v; this.vol.set(v.level, v.muted); this.vol.setIcon(this.volIcon(v.level, v.muted)); };
    follet.onVolume(applyVol);
    follet.volume().then(applyVol);

    // sortie audio
    $('.out-btn', el).addEventListener('click', async (e) => {
      const list = await follet.audioDevices().catch(() => []);
      const icon = (n) => (/head|casque|buds|airpods|écouteur|jbl|sony|bose/i.test(n) ? 'headphones' : /hdmi|nvidia|display|vx|monitor/i.test(n) ? 'tv' : /virtual|cable|steam|oculus/i.test(n) ? 'settings_input_component' : 'speaker');
      openMenu(e.currentTarget, [{ header: 'Sortie audio' }, ...list.sort((a, b) => b.isDefault - a.isDefault).map((d) => ({ icon: d.isDefault ? 'check' : icon(d.name), label: d.name.replace(/\s*\((.*)\)$/, ' · $1'), on: d.isDefault, value: d.id }))],
        async (it) => { await follet.setAudioDevice(it.value); this.loadOutput(); snack('Sortie : ' + it.label.split(' · ')[0]); });
    });
    this.loadOutput();

    // tuiles : Wi-Fi et Bluetooth sont de vrais interrupteurs, le reste ouvre un outil
    const TILES = [
      ['radio:WiFi', 'wifi', 'Wi-Fi'], ['radio:Bluetooth', 'bluetooth', 'Bluetooth'], ['ms-screenclip:', 'screenshot_region', 'Capture'], ['taskmgr', 'monitor_heart', 'Tâches'],
      ['explorer', 'folder', 'Fichiers'], ['ms-settings:', 'settings', 'Paramètres'], ['calc', 'calculate', 'Calcul'], ['terminal', 'terminal', 'Terminal'],
    ];
    $('.tiles', el).innerHTML = TILES.map(([k, i, l]) => `<button class="tile state" data-k="${k}">${ms(i)}<span>${l}</span></button>`).join('');
    $('.tiles', el).addEventListener('click', async (e) => {
      const t = e.target.closest('.tile'); if (!t) return;
      const k = t.dataset.k;
      if (k.startsWith('radio:')) {
        const kind = k.slice(6), on = !t.classList.contains('on');
        t.classList.add('busy');
        const r = await follet.setRadio(kind, on).catch(() => null);
        t.classList.remove('busy');
        if (r === 'Allowed') t.classList.toggle('on', on); else snack('Windows a refusé le changement');
        return;
      }
      follet.openUri(k); I.setMode('collapsed');
    });

    follet.onBattery((b) => { this.battery = b; this.renderStatus(); });
    follet.battery().then((b) => { this.battery = b; this.renderStatus(); });
  },

  visible() { return I.mode === 'expanded' && I.tab === 'home'; },
  show() { this.loadBrightness(); this.loadRadios(); this.loadOutput(); this.renderStatus(); this.renderProgress(); this.startViz(); },
  hide() { cancelAnimationFrame(this.raf); this.stopViz(); },

  volIcon(level, muted) { return muted || level === 0 ? 'volume_off' : level < 40 ? 'volume_down' : 'volume_up'; },

  async loadOutput() {
    const list = await follet.audioDevices().catch(() => null);
    const d = list && list.find((x) => x.isDefault);
    if (!d) return;
    const name = d.name.replace(/\s*\(.*\)$/, ''), detail = (d.name.match(/\((.*)\)$/) || [])[1] || '';
    const btn = $('.out-btn', this.el);
    $('.nm', btn).textContent = detail || name;
    $('.ms', btn).textContent = /head|casque|buds|écouteur/i.test(name) ? 'headphones' : /hdmi|nvidia|display/i.test(d.name) ? 'tv' : 'speaker';
  },
  async loadRadios() {
    const list = await follet.radios().catch(() => []);
    for (const r of list || []) { const t = $(`.tile[data-k="radio:${r.kind}"]`, this.el); if (t) t.classList.toggle('on', r.on); }
  },
  async loadBrightness() {
    if (this.brightLoaded && Date.now() - this.brightLoaded < 60000) return;
    this.brightLoaded = Date.now();
    const list = (await follet.brightness().catch(() => [])) || [];
    const box = $('.bright', this.el);
    box.innerHTML = list.map((_, i) => `<div class="br" data-i="${i}" style="margin-top:8px"></div>`).join('');
    list.forEach((d, i) => {
      let t = null;
      const name = d.kind === 'wmi' ? 'Écran intégré' : (d.name || 'Écran').replace(/\s*\(.*\)$/, '').replace(/-.*$/, '');
      pillSlider($(`.br[data-i="${i}"]`, box), {
        value: d.value, icon: 'light_mode', label: name,
        onInput: (v) => { clearTimeout(t); t = setTimeout(() => follet.setBrightness(d.id, v), 90); },
      });
    });
  },

  renderStatus() {
    const chips = [], b = this.battery;
    if (b && b.present) chips.push(`<span class="chip">${ms(b.plugged ? 'battery_charging_full' : b.percent < 20 ? 'battery_alert' : 'battery_full', 'fill')}${b.percent} %${b.plugged ? ' · branché' : ''}</span>`);
    if (I.weatherNow) chips.push(`<span class="chip">${ms(I.weatherNow.icon, 'fill')}${I.weatherNow.temp}° ${esc(I.weatherNow.city || '')}</span>`);
    if (I.nextEvent) chips.push(`<span class="chip">${ms('event')}${esc(I.nextEvent)}</span>`);
    $('.status-row', this.el).innerHTML = chips.join('');
  },

  renderMedia() {
    const el = this.el, m = I.media, playing = m.present && m.status === 'Playing';
    const art = $('.np-art', el);
    if (m.present && m.thumb) {
      if (art.tagName !== 'IMG') art.outerHTML = `<img class="np-art" src="${m.thumb}">`; else if (art.src !== m.thumb) art.src = m.thumb;
      $('.np', el).style.setProperty('--art', `url("${m.thumb}")`);
    } else if (art.tagName === 'IMG') { art.outerHTML = `<div class="np-art">${ms('music_note', 's40')}</div>`; $('.np', el).style.removeProperty('--art'); }
    $('.np', el).classList.toggle('playing-now', playing);
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
    const sh = $('[data-m=shuffle]', el), rp = $('[data-m=repeat]', el);
    sh.style.display = m.present && m.canShuffle ? '' : 'none';
    rp.style.display = m.present && m.canRepeat ? '' : 'none';
    sh.classList.toggle('on', !!m.shuffle);
    rp.classList.toggle('on', m.repeat && m.repeat !== 'None');
    $('.ms', rp).textContent = m.repeat === 'Track' ? 'repeat_one' : 'repeat';
    this.mediaAt = Date.now();
    if (this.visible()) { this.renderProgress(); playing ? this.startViz() : null; }
  },

  // Barre de progression ondulee (M3 expressive) : ondule pendant la lecture, droite en pause
  renderProgress() {
    const el = this.el, m = I.media, svg = $('.wavy svg', el);
    if (!svg) return;
    const w = svg.clientWidth || 380, h = 18, mid = h / 2;
    const playing = m.present && m.status === 'Playing';
    if (!m.present || !m.duration) { svg.innerHTML = `<line class="w-rest" x1="2" y1="${mid}" x2="${w - 2}" y2="${mid}"/>`; $('.np-pos', el).textContent = ''; $('.np-dur', el).textContent = ''; }
    else {
      const pos = Math.min(m.duration, m.position + (playing ? (Date.now() - (this.mediaAt || Date.now())) / 1000 : 0));
      const x = Math.max(2, Math.min(w - 2, (pos / m.duration) * w));
      const amp = playing ? 3 : 0, wl = 22, phase = playing ? (Date.now() / 1000) * 12 : 0;
      let d = `M2 ${mid}`;
      for (let px = 2; px <= x - 6; px += 2) d += ` L${px} ${(mid + amp * Math.sin(((px + phase) / wl) * 2 * Math.PI)).toFixed(2)}`;
      svg.innerHTML = `${x > 8 ? `<path class="w-act" d="${d}"/>` : ''}${x < w - 10 ? `<line class="w-rest" x1="${Math.min(w - 2, x + 8)}" y1="${mid}" x2="${w - 2}" y2="${mid}"/>` : ''}<circle class="w-dot" cx="${x}" cy="${mid}" r="5"/>`;
      $('.np-pos', el).textContent = fmtDur(pos);
      $('.np-dur', el).textContent = fmtDur(m.duration);
    }
    this.drawViz(playing);
    if (this.visible()) { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.renderProgress()); }
  },

  // ---------- visualiseur : son du systeme (boucle locale), analyse FFT, rien n'est enregistre ----------
  async startViz() {
    if (this.analyser || this.vizStarting || this.vizFailed) return;
    if (!(I.media.present && I.media.status === 'Playing')) return;
    this.vizStarting = true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 16, height: 16, frameRate: 1 } });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!stream.getAudioTracks().length) throw new Error('pas de piste audio');
      this.stream = stream;
      this.actx = new AudioContext();
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.78;
      this.actx.createMediaStreamSource(stream).connect(this.analyser);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) { console.warn('visualiseur indisponible : ' + e.message); this.vizFailed = true; }
    this.vizStarting = false;
  },
  stopViz() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.actx) this.actx.close();
    this.stream = this.actx = this.analyser = null;
  },
  drawViz(playing) {
    const cv = $('.viz canvas', this.el); if (!cv) return;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!this.colors) { const cs = getComputedStyle(document.documentElement); this.colors = [cs.getPropertyValue('--md-primary').trim(), cs.getPropertyValue('--md-tertiary').trim(), cs.getPropertyValue('--md-secondary-container').trim()]; }
    const N = 48, gap = 4, bw = (W - gap * (N - 1)) / N;
    const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, this.colors[0]); grad.addColorStop(1, this.colors[1]);
    this.levels ||= new Float32Array(N);
    const sr = this.actx ? this.actx.sampleRate : 48000;
    for (let i = 0; i < N; i++) {
      let target = 0;
      if (this.analyser && playing) {
        if (i === 0) this.analyser.getByteFrequencyData(this.freq);
        // bandes logarithmiques de 40 Hz a 14 kHz
        const f0 = 40 * Math.pow(14000 / 40, i / N), f1 = 40 * Math.pow(14000 / 40, (i + 1) / N);
        const b0 = Math.floor((f0 / (sr / 2)) * this.freq.length), b1 = Math.max(b0 + 1, Math.floor((f1 / (sr / 2)) * this.freq.length));
        let s = 0; for (let b = b0; b < b1; b++) s += this.freq[b];
        target = Math.pow(s / (b1 - b0) / 255, 1.6) * (0.75 + i / N * 0.6);
      } else if (playing) target = 0.12 + 0.08 * Math.sin(Date.now() / 300 + i / 3);   // pas de capture : respiration douce
      this.levels[i] += (target - this.levels[i]) * (target > this.levels[i] ? 0.55 : 0.18);
      const bh = Math.max(4, Math.min(1, this.levels[i]) * (H - 4));
      const x = i * (bw + gap), y = (H - bh) / 2;
      g.fillStyle = playing ? grad : this.colors[2];
      g.beginPath(); g.roundRect(x, y, bw, bh, bw / 2); g.fill();
    }
  },
});

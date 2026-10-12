/* Reglages : tout ce qui etait dans config.json, modifiable dans l'appli. */
I.view('settings', {
  label: 'Réglages', icon: 'settings', nav: false,
  html: `<div class="grid v-settings">
    <div class="card low set-nav"></div>
    <div class="scroll set-body"></div>
  </div>`,

  sections: [
    ['look', 'palette', 'Apparence'], ['behavior', 'tune', 'Comportement'], ['activities', 'notifications_active', 'Activités'],
    ['tabs', 'tab', 'Onglets'], ['weather', 'partly_cloudy_day', 'Météo'], ['agenda', 'calendar_month', 'Agenda'],
    ['system', 'computer', 'Système'], ['about', 'info', 'À propos'],
  ],

  init(el) {
    this.el = el; this.sec = 'look';
    $('.set-nav', el).innerHTML = this.sections.map(([id, i, l]) => `<button class="state" data-s="${id}">${ms(i)}${l}</button>`).join('');
    $('.set-nav', el).addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) this.open(b.dataset.s); });
  },
  async show() { this.data = await island.configGet(); this.open(this.sec); },
  async open(sec) {
    if (!this.data) this.data = await island.configGet();
    this.sec = sec;
    $$('.set-nav button', this.el).forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('.set-body', this.el);
    body.innerHTML = `<div class="set-sec"><h3>${this.sections.find((s) => s[0] === sec)[2]}</h3>${this['r_' + sec]()}</div>`;
    body.scrollTop = 0;
    this['b_' + sec] && this['b_' + sec](body);
  },
  async save(patch, msg) { this.data.config = await island.configSet(patch); if (msg) snack(msg); },
  row(hl, sup, ctrl) { return `<div class="set-row"><div class="txt"><div class="hl">${hl}</div>${sup ? `<div class="sup">${sup}</div>` : ''}</div>${ctrl}</div>`; },
  sw(key, on) { return `<input type="checkbox" class="switch" data-k="${key}" ${on ? 'checked' : ''}>`; },
  bindSwitches(body, fn) { $$('.switch[data-k]', body).forEach((s) => s.addEventListener('change', () => fn(s.dataset.k, s.checked))); },

  // ---------- Apparence ----------
  r_look() {
    const t = this.data.config.theme;
    return this.row('Source des couleurs', 'Material You construit tout le thème à partir d\'une seule couleur.', '<div class="seg-src"></div>')
      + `<div class="set-row custom-row" style="${t.source === 'custom' ? '' : 'display:none'}"><div class="txt"><div class="hl">Couleur</div></div><div class="swatches"></div><input type="color" class="color-pick" value="${esc(t.color)}" style="width:36px;height:32px;border:0;background:none;cursor:pointer"></div>`
      + this.row('Style', 'Intensité et variété des couleurs dérivées.', '<div class="seg-var"></div>');
  },
  b_look(body) {
    const t = this.data.config.theme;
    segmented($('.seg-src', body), [['art', 'Pochette'], ['accent', 'Accent Windows'], ['custom', 'Choisie']], t.source, (v) => {
      $('.custom-row', body).style.display = v === 'custom' ? '' : 'none';
      this.save({ theme: { source: v } });
    });
    segmented($('.seg-var', body), [['tonal', 'Doux'], ['vibrant', 'Vif'], ['expressive', 'Expressif'], ['fidelity', 'Fidèle']], t.variant, (v) => this.save({ theme: { variant: v } }));
    const sw = ['#6750a4', '#0b57d0', '#146c2e', '#b3261e', '#e8a33d', '#7d5260', '#006a6a', '#5f6368'];
    $('.swatches', body).innerHTML = sw.map((c) => `<button style="background:${c}" class="${c === t.color ? 'on' : ''}" data-c="${c}"></button>`).join('');
    $('.swatches', body).addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { this.save({ theme: { color: b.dataset.c } }); this.open('look'); } });
    $('.color-pick', body).addEventListener('change', (e) => this.save({ theme: { color: e.target.value } }));
  },

  // ---------- Comportement ----------
  r_behavior() {
    const c = this.data.config;
    const disp = this.data.displays.map((d) => `<option value="${d.primary ? 'primary' : d.id}" ${(c.display === 'primary' && d.primary) || c.display === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
    return this.row('Écran', 'Où l\'encoche s\'affiche.', `<select class="field disp">${disp}</select>`)
      + this.row('Se ranger devant une fenêtre maximisée', 'Elle ressort quand la souris touche le haut de l\'écran, au milieu.', this.sw('tuck', c.behavior.tuck))
      + this.row('Masquer pendant les jeux en plein écran', '', this.sw('hideFullscreen', c.behavior.hideFullscreen))
      + this.row('Raccourci clavier', 'Ouvre ou ferme l\'island de partout. Clique puis appuie sur la combinaison.', `<input class="field shortcut" readonly value="${esc(c.shortcut)}" style="width:200px;cursor:pointer">`)
      + this.row('Démarrer avec Windows', '', `<input type="checkbox" class="switch login" ${this.data.login ? 'checked' : ''}>`);
  },
  b_behavior(body) {
    $('.disp', body).addEventListener('change', (e) => this.save({ display: e.target.value }, 'Écran changé'));
    this.bindSwitches(body, (k, v) => this.save({ behavior: { [k]: v } }));
    $('.login', body).addEventListener('change', async (e) => { this.data.login = await island.loginSet(e.target.checked); snack(this.data.login ? 'Island démarrera avec Windows' : 'Démarrage automatique désactivé'); });
    const sc = $('.shortcut', body);
    sc.addEventListener('focus', () => { sc.value = 'Appuie sur la combinaison…'; });
    sc.addEventListener('blur', () => { sc.value = this.data.config.shortcut; });
    sc.addEventListener('keydown', (e) => {
      e.preventDefault();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const parts = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
      if (!parts.length) return;
      const key = e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const acc = [...parts, key].join('+');
      this.save({ shortcut: acc }, 'Raccourci : ' + acc); sc.blur();
    });
  },

  // ---------- Activites ----------
  r_activities() {
    const a = this.data.config.activities;
    return `<div class="body-s variant" style="margin:0 8px 12px">L'encoche s'élargit quelques secondes quand quelque chose se passe.</div>`
      + this.row(`${ms('volume_up', 's20')} Volume`, 'Quand le volume change (touches du clavier, Windows…).', this.sw('volume', a.volume))
      + this.row(`${ms('music_note', 's20')} Nouvelle chanson`, '', this.sw('media', a.media))
      + this.row(`${ms('headphones', 's20')} Sortie audio`, 'Casque ou haut-parleurs connectés.', this.sw('audioDevice', a.audioDevice))
      + this.row(`${ms('battery_charging_full', 's20')} Batterie`, 'Branché, débranché, batterie faible.', this.sw('battery', a.battery));
  },
  b_activities(body) { this.bindSwitches(body, (k, v) => this.save({ activities: { [k]: v } })); },

  // ---------- Onglets ----------
  r_tabs() {
    const t = this.data.config.tabs;
    return I.order.map((id) => this.row(`${ms(I.views[id].icon, 's20')} ${I.views[id].label}`, '', this.sw(id, t[id] !== false))).join('');
  },
  b_tabs(body) { this.bindSwitches(body, async (k, v) => { await this.save({ tabs: { [k]: v } }); I.buildNav(); }); },

  // ---------- Meteo ----------
  r_weather() {
    const w = this.data.config.weather;
    const fb = w.fallback ? `${esc(w.fallback.city)}` : 'aucune';
    return this.row('Position', 'Par adresse IP : suit le portable quand tu changes de ville (position approximative).', '<div class="seg-mode"></div>')
      + `<div class="set-row" style="flex-direction:column;align-items:stretch"><div class="txt"><div class="hl">${w.mode === 'fixed' ? 'Ville' : 'Ville de secours'} : <b class="cur-city">${w.mode === 'fixed' ? esc(w.city || '—') : fb}</b></div><div class="sup">${w.mode === 'fixed' ? 'Toujours utilisée.' : 'Utilisée si la position par IP échoue.'}</div></div>
         <input class="field geo-q" placeholder="Chercher une ville…"><div class="geo-results"></div></div>`;
  },
  b_weather(body) {
    const w = this.data.config.weather;
    segmented($('.seg-mode', body), [['ip', 'Adresse IP'], ['fixed', 'Ville fixe']], w.mode, async (v) => { await this.save({ weather: { mode: v } }); this.open('weather'); });
    let t = null;
    $('.geo-q', body).addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const res = await island.geocode(e.target.value).catch(() => []);
        $('.geo-results', body).innerHTML = res.map((r, i) => `<div class="list-item state" data-i="${i}" style="min-height:44px;cursor:pointer">${ms('location_on')}<div class="txt"><div class="hl">${esc(r.city)}</div><div class="sup">${esc(r.region)}</div></div></div>`).join('');
        this.geo = res;
      }, 300);
    });
    $('.geo-results', body).addEventListener('click', async (e) => {
      const it = e.target.closest('[data-i]'); if (!it) return;
      const r = this.geo[+it.dataset.i];
      const fixed = this.data.config.weather.mode === 'fixed';
      await this.save({ weather: fixed ? { city: r.city, lat: r.lat, lon: r.lon } : { fallback: { city: r.city, lat: r.lat, lon: r.lon } } }, 'Ville : ' + r.city);
      this.open('weather'); I.views.today.loadWeather();
    });
  },

  // ---------- Agenda ----------
  r_agenda() {
    const cals = this.data.config.calendars;
    return `<div class="set-row" style="flex-direction:column;align-items:stretch">
        <div class="txt"><div class="hl">Agendas iCal</div><div class="sup">Google Agenda → Paramètres → ton agenda → « Adresse secrète au format iCal ». Fonctionne aussi avec Outlook, iCloud, Proton… L'adresse reste dans %APPDATA%\\Island, jamais dans le code.</div></div>
        <div class="cal-list">${cals.map((c, i) => { const u = typeof c === 'string' ? c : c.url; return `<div class="cal-item">${ms('calendar_month')}<span class="u ellipsis">${esc(u.replace(/(private-)[^/]+/, '$1••••'))}</span><button class="icon-btn xs state" data-del="${i}" title="Retirer">${ms('close')}</button></div>`; }).join('') || '<div class="body-s variant" style="padding:6px 0">Aucun agenda</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:6px"><input class="field cal-url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"><button class="btn filled sm state cal-add">${ms('add')}Ajouter</button></div>
      </div>`;
  },
  b_agenda(body) {
    const add = async () => {
      const u = $('.cal-url', body).value.trim();
      if (!/^(https?|webcal):\/\//.test(u)) { snack('Adresse invalide'); return; }
      await this.save({ calendars: [...this.data.config.calendars, u] }, 'Agenda ajouté');
      this.open('agenda'); I.views.today.loadCalendar(true);
    };
    $('.cal-add', body).addEventListener('click', add);
    $('.cal-url', body).addEventListener('keydown', (e) => e.key === 'Enter' && add());
    $('.cal-list', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      await this.save({ calendars: this.data.config.calendars.filter((_, i) => i !== +b.dataset.del) }, 'Agenda retiré');
      this.open('agenda'); I.views.today.loadCalendar(true);
    });
  },

  // ---------- Systeme ----------
  r_system() {
    const c = this.data.config;
    const drives = this.data.drives.map((d) => `<label class="chip ${c.disks.includes(d) ? 'selected' : ''}" style="cursor:pointer"><input type="checkbox" data-d="${esc(d)}" ${c.disks.includes(d) ? 'checked' : ''} hidden>${ms(c.disks.includes(d) ? 'check' : 'hard_drive')}${d.slice(0, 2)}</label>`).join(' ');
    return this.row('Disques affichés', '', `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${drives}</div>`)
      + this.row('Shell du terminal', 'Par défaut : PowerShell 7.', `<select class="field shell">${[['pwsh.exe', 'PowerShell 7'], ['powershell.exe', 'Windows PowerShell'], ['cmd.exe', 'Invite de commandes'], ['wsl.exe', 'WSL']].map(([v, l]) => `<option value="${v}" ${c.shell === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)
      + this.row('Modèle Claude', 'Pour l\'onglet Claude.', `<select class="field model">${[['', 'Par défaut'], ['sonnet', 'Sonnet'], ['opus', 'Opus'], ['haiku', 'Haiku']].map(([v, l]) => `<option value="${v}" ${c.claudeModel === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
  },
  b_system(body) {
    $$('[data-d]', body).forEach((cb) => cb.addEventListener('change', async () => {
      const disks = $$('[data-d]', body).filter((x) => x.checked).map((x) => x.dataset.d);
      await this.save({ disks }); this.open('system');
    }));
    $('.shell', body).addEventListener('change', (e) => this.save({ shell: e.target.value }, 'Effet au prochain terminal'));
    $('.model', body).addEventListener('change', (e) => this.save({ claudeModel: e.target.value }));
  },

  // ---------- A propos ----------
  r_about() {
    return this.row('Island', `Version ${esc(this.data.version)} · Material You · open source`, '')
      + this.row('Données personnelles', esc(this.data.dataDir) + '<br>Config, tâches, étagère et conversations Claude restent sur ce PC.', `<button class="btn tonal sm state open-data">${ms('folder_open')}Ouvrir</button>`)
      + this.row('Services contactés', 'ipwho.is / geojs.io (position par IP), Open-Meteo (météo), speed.cloudflare.com (test de vitesse, sur demande), tes agendas iCal.', '');
  },
  b_about(body) { $('.open-data', body).addEventListener('click', () => island.openDataFolder()); },
});

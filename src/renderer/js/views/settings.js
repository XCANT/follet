/* Reglages : tout ce qui etait dans config.json, modifiable dans l'appli. */
I.view('settings', {
  label: 'Réglages', icon: 'settings', nav: false,
  html: `<div class="grid v-settings">
    <div class="card low set-nav"></div>
    <div class="scroll set-body"></div>
  </div>`,

  sections: [
    ['look', 'palette', 'Apparence'], ['behavior', 'tune', 'Comportement'], ['activities', 'notifications_active', 'Activités'],
    ['tabs', 'tab', 'Onglets'], ['tiles', 'grid_view', 'Tuiles'], ['weather', 'partly_cloudy_day', 'Météo'], ['agenda', 'calendar_month', 'Agenda'], ['ai', 'local_fire_department', 'IA'],
    ['system', 'computer', 'Système'], ['about', 'info', 'À propos'],
  ],

  init(el) {
    this.el = el; this.sec = 'look';
    $('.set-nav', el).innerHTML = this.sections.map(([id, i, l]) => `<button class="state" data-s="${id}">${ms(i)}${l}</button>`).join('');
    $('.set-nav', el).addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) this.open(b.dataset.s); });
  },
  async show() { this.data = await follet.configGet(); this.open(this.sec); },
  async open(sec) {
    if (!this.data) this.data = await follet.configGet();
    if (sec === 'ai') this.ai = await follet.aiInfo();
    this.sec = sec;
    $$('.set-nav button', this.el).forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('.set-body', this.el);
    body.innerHTML = `<div class="set-sec"><h3>${this.sections.find((s) => s[0] === sec)[2]}</h3>${this['r_' + sec]()}</div>`;
    body.scrollTop = 0;
    this['b_' + sec] && this['b_' + sec](body);
  },
  async save(patch, msg) { this.data.config = await follet.configSet(patch); if (msg) snack(msg); },
  row(hl, sup, ctrl) { return `<div class="set-row"><div class="txt"><div class="hl">${hl}</div>${sup ? `<div class="sup">${sup}</div>` : ''}</div>${ctrl}</div>`; },
  sw(key, on) { return `<input type="checkbox" class="switch" data-k="${key}" ${on ? 'checked' : ''}>`; },
  bindSwitches(body, fn) { $$('.switch[data-k]', body).forEach((s) => s.addEventListener('change', () => fn(s.dataset.k, s.checked))); },

  // ---------- Apparence ----------
  r_look() {
    const t = this.data.config.theme;
    return this.row('Langue', 'Langue de l\'interface. Automatique suit Windows.', '<div class="seg-lang"></div>')
      + this.row('Thèmes prêts', 'Un clic applique la couleur, le style et le fond.', '<div class="presets" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:440px"></div>')
      + this.row('Source des couleurs', 'Material You construit tout le thème à partir d\'une seule couleur.', '<div class="seg-src"></div>')
      + `<div class="set-row custom-row" style="${t.source === 'custom' ? '' : 'display:none'}"><div class="txt"><div class="hl">Couleur</div></div><div class="swatches"></div><input type="color" class="color-pick" value="${esc(t.color)}" style="width:36px;height:32px;border:0;background:none;cursor:pointer"></div>`
      + this.row('Style', 'Intensité et variété des couleurs dérivées.', '<div class="seg-var"></div>')
      + this.row('Fond', "Noir pur : idéal pour les écrans OLED, l'encoche se fond dans le bord de l'écran.", '<div class="seg-surf"></div>')
      + this.row("Taille de l'encoche", 'Encoche repliée.', '<div class="seg-size"></div>')
      + this.row("Position de l'encoche", "Glisse pour décaler l'encoche, par exemple pour la placer au-dessus de ta webcam.", `<div style="display:flex;gap:6px;align-items:center"><div class="pos-slider" style="width:180px"></div><button class="icon-btn sm state pos-reset" title="Recentrer">${ms('align_horizontal_center')}</button></div>`)
      + this.row('Tenues de Follet', "Chapeau de sorcière en octobre, tuque quand il fait froid, parapluie sous la pluie, bonnet de Noël…", this.sw('outfits', (this.data.config.mascot || {}).outfits !== false))
      + this.row('Couleur de Follet', 'La mascotte garde son corail, ou prend les couleurs de l\'appli.', '<div class="seg-mascot"></div>');
  },
  b_look(body) {
    const t = this.data.config.theme;
    segmented($('.seg-lang', body), [['auto', 'Automatique'], ['fr', 'Français'], ['en', 'English']], this.data.config.language || 'auto', async (v) => { await this.save({ language: v }); location.reload(); });
    segmented($('.seg-src', body), [['art', 'Pochette'], ['accent', 'Accent Windows'], ['custom', 'Choisie']], t.source, (v) => {
      $('.custom-row', body).style.display = v === 'custom' ? '' : 'none';
      this.save({ theme: { source: v } });
    });
    segmented($('.seg-var', body), [['tonal', 'Doux'], ['vibrant', 'Vif'], ['expressive', 'Expressif'], ['fidelity', 'Fidèle'], ['neutral', 'Neutre'], ['mono', 'Mono']], t.variant, (v) => this.save({ theme: { variant: v } }));
    segmented($('.seg-surf', body), [['tinted', 'Teinté'], ['black', 'Noir pur']], t.surface || 'tinted', (v) => this.save({ theme: { surface: v } }));
    const presets = [
      ['Minuit', '#5f6368', 'mono', 'black'], ['Lavande', '#6750a4', 'tonal', 'tinted'], ['Océan', '#0b57d0', 'vibrant', 'tinted'], ['Forêt', '#146c2e', 'tonal', 'tinted'],
      ['Sakura', '#d0638c', 'expressive', 'tinted'], ['Braise', '#e8673d', 'vibrant', 'black'], ['Ambre', '#e8a33d', 'fidelity', 'tinted'],
    ];
    $('.presets', body).innerHTML = presets.map(([n, c, v, s], i) => `<button class="chip state ${t.source === 'custom' && t.color === c && t.variant === v && (t.surface || 'tinted') === s ? 'selected' : ''}" data-p="${i}"><span style="width:14px;height:14px;border-radius:50%;background:${c};${s === 'black' ? 'outline:3px solid #000;' : ''}display:inline-block"></span>${n}</button>`).join('');
    $('.presets', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const [, color, variant, surface] = presets[+b.dataset.p];
      await this.save({ theme: { source: 'custom', color, variant, surface } }); this.open('look');
    });
    segmented($('.seg-mascot', body), [['corail', 'Corail'], ['theme', 'Couleurs de l\'appli']], (this.data.config.mascot || {}).color || 'corail', (v) => { Follet.setPalette(v); this.save({ mascot: { color: v } }); I.emit('mascot-palette'); });
    segmented($('.seg-size', body), [['small', 'Petite'], ['normal', 'Normale'], ['large', 'Grande']], (this.data.config.notch || {}).size || 'normal', async (v) => { await this.save({ notch: { size: v } }); I.applyLayout(this.data.config); });
    // appliquee au relachement : l'encoche bouge sous la souris, on ne la deplace pas pendant le glisser
    const pos = slider($('.pos-slider', body), { value: (this.data.config.notch || {}).pos ?? 50, onChange: (v) => this.save({ notch: { pos: Math.abs(v - 50) < 3 ? 50 : v } }) });
    $('.pos-reset', body).addEventListener('click', () => { pos.set(50); this.save({ notch: { pos: 50 } }); });
    $('[data-k=outfits]', body).addEventListener('change', (e) => { I.outfits = e.target.checked; I.updateOutfit(); this.save({ mascot: { outfits: e.target.checked } }); });
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
      + this.row('Ouverture au survol', 'Combien de temps la souris doit s\'attarder avant l\'aperçu. Un simple passage ne l\'ouvre pas.', '<div class="seg-hover"></div>')
      + this.row("Molette sur l'encoche", "Vers le bas pour ouvrir, ou pour régler le volume (le clic ouvre toujours). Glisser à deux doigts ou Maj+molette change de chanson ; clic du milieu = lecture/pause.", '<div class="seg-wheel"></div>')
      + this.row('Se ranger devant une fenêtre maximisée', 'Elle ressort quand la souris touche le haut de l\'écran, au milieu.', this.sw('tuck', c.behavior.tuck))
      + this.row('Masquer pendant les jeux en plein écran', '', this.sw('hideFullscreen', c.behavior.hideFullscreen))
      + this.row('Accélération graphique', 'Recommandée : animations fluides et moins de travail pour le processeur. Désactivée, Follet économise environ 70 Mo de mémoire. Effet au prochain démarrage de Follet.', this.sw('accel', c.behavior.accel !== false))
      + this.row('Raccourci clavier', 'Ouvre ou ferme Follet de partout. Clique puis appuie sur la combinaison.', `<input class="field shortcut" data-sc="shortcut" readonly value="${esc(c.shortcut)}" style="width:200px;cursor:pointer">`)
      + this.row('Historique du presse-papiers', "Ouvre l'onglet Copié ; Entrée colle l'élément choisi dans l'appli où tu étais.", `<input class="field shortcut" data-sc="clipShortcut" readonly value="${esc(c.clipShortcut || '')}" style="width:200px;cursor:pointer">`)
      + this.row("Capture d'écran", "Capture l'écran sous la souris, la copie et la dépose dans l'Étagère (dossier Images\\Captures d'écran).", `<input class="field shortcut" data-sc="shotShortcut" readonly value="${esc(c.shotShortcut || '')}" style="width:200px;cursor:pointer">`)
      + this.row("Copier le texte de l'écran", "Sélectionne une zone : le texte est lu par Windows, sur ce PC, puis copié.", `<input class="field shortcut" data-sc="ocrShortcut" readonly value="${esc(c.ocrShortcut || '')}" style="width:200px;cursor:pointer">`)
      + this.row('Pipette', "Clique sur n'importe quel pixel de l'écran : sa couleur (#hex) est copiée.", `<input class="field shortcut" data-sc="colorShortcut" readonly value="${esc(c.colorShortcut || '')}" style="width:200px;cursor:pointer">`)
      + this.row('Démarrer avec Windows', '', `<input type="checkbox" class="switch login" ${this.data.login ? 'checked' : ''}>`);
  },
  b_behavior(body) {
    $('.disp', body).addEventListener('change', (e) => this.save({ display: e.target.value }, 'Écran changé'));
    this.bindSwitches(body, (k, v) => this.save({ behavior: { [k]: v } }));
    segmented($('.seg-wheel', body), [['open', 'Ouvrir'], ['volume', 'Volume']], this.data.config.behavior.wheel || 'open', (v) => { I.wheel = v; this.save({ behavior: { wheel: v } }); });
    segmented($('.seg-hover', body), [['fast', 'Rapide'], ['normal', 'Normale'], ['slow', 'Lente']], this.data.config.behavior.hover || 'normal', (v) => this.save({ behavior: { hover: v } }));
    $('.login', body).addEventListener('change', async (e) => { this.data.login = await follet.loginSet(e.target.checked); snack(this.data.login ? 'Follet démarrera avec Windows' : 'Démarrage automatique désactivé'); });
    $$('.shortcut', body).forEach((sc) => {
      const k = sc.dataset.sc;
      sc.addEventListener('focus', () => { sc.value = I.t('Appuie sur la combinaison…'); });
      sc.addEventListener('blur', () => { sc.value = this.data.config[k] || ''; });
      sc.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        const parts = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
        if (!parts.length) return;
        const key = e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
        const acc = [...parts, key].join('+');
        this.save({ [k]: acc }, 'Raccourci : ' + acc); sc.blur();
      });
    });
  },

  // ---------- Activites ----------
  r_activities() {
    const a = this.data.config.activities;
    return `<div class="body-s variant" style="margin:0 8px 12px">L'encoche s'élargit quelques secondes quand quelque chose se passe.</div>`
      + this.row(`${ms('volume_up', 's20')} Volume`, 'Quand le volume change (touches du clavier, Windows…).', this.sw('volume', a.volume))
      + this.row(`${ms('music_note', 's20')} Nouvelle chanson`, '', this.sw('media', a.media))
      + this.row(`${ms('headphones', 's20')} Sortie audio`, 'Casque ou haut-parleurs connectés.', this.sw('audioDevice', a.audioDevice))
      + this.row(`${ms('battery_charging_full', 's20')} Batterie`, 'Branché, débranché, batterie faible.', this.sw('battery', a.battery))
      + this.row(`${ms('notifications', 's20')} Notifications Windows`, 'Affichées dans l\'encoche. Astuce : dans Windows, coupe les bannières d\'une appli (Paramètres → Notifications) et laisse Follet les montrer.', this.sw('notif', a.notif !== false))
      + this.row(`${ms('mic', 's20')} Micro utilisé`, 'Un point orange reste dans l\'encoche tant qu\'une appli enregistre ton micro.', this.sw('mic', a.mic !== false))
      + this.row(`${ms('download', 's20')} Téléchargements`, "Progression des téléchargements du navigateur, puis le fichier dans l'Étagère.", this.sw('downloads', a.downloads !== false))
      + this.row(`${ms('umbrella', 's20')} Pluie imminente`, "Prévient quand la pluie ou la neige arrive dans l'heure.", this.sw('rain', a.rain !== false))
      + this.row(`${ms('event', 's20')} Rappels d'agenda`, "Avant chaque événement de l'agenda, puis à son début.", '<div class="seg-rem"></div>')
      + this.row(`${ms('bluetooth', 's20')} Appareils Bluetooth`, 'Connexion, déconnexion et batterie faible (casque, manette, souris…).', this.sw('bluetooth', a.bluetooth !== false))
      + this.row(`${ms('lyrics', 's20')} Paroles synchronisées`, "Dans l'aperçu et l'accueil, quand la chanson est connue de LRCLIB (lrclib.net, base libre et gratuite).", this.sw('lyrics', a.lyrics !== false));
  },
  b_activities(body) {
    this.bindSwitches(body, (k, v) => this.save({ activities: { [k]: v } }));
    segmented($('.seg-rem', body), [['0', 'Non'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min']], String(this.data.config.activities.reminder ?? 10), (v) => this.save({ activities: { reminder: +v } }));
  },

  // ---------- Tuiles de l'accueil ----------
  r_tiles() {
    const list = this.data.config.tiles || [], last = list.length - 1, full = list.length >= 8;
    return `<div class="body-s variant" style="margin:0 8px 12px">Jusqu'à 8 tuiles sur l'accueil : raccourcis de Follet, tes applis, fichiers, dossiers ou sites.</div>`
      + list.map((t, i) => { const b = I.tileInfo(t); return this.row(`${ms(b.icon, 's20')} <span${t.k ? '' : ' data-noi18n'}>${esc(b.label)}</span>`, t.k ? '' : esc(t.path || t.url),
        `<div style="display:flex;gap:2px"><button class="icon-btn sm state" data-tmove="${i}" data-d="-1" title="Monter" ${i ? '' : 'disabled'}>${ms('arrow_upward')}</button><button class="icon-btn sm state" data-tmove="${i}" data-d="1" title="Descendre" ${i < last ? '' : 'disabled'}>${ms('arrow_downward')}</button><button class="icon-btn sm state" data-tdel="${i}" title="Retirer">${ms('delete')}</button></div>`); }).join('')
      + `<div class="t-add" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 8px 0">
          <button class="btn tonal sm state" data-add="builtin" ${full ? 'disabled' : ''}>${ms('add')}Raccourci</button>
          <button class="btn tonal sm state" data-add="file" ${full ? 'disabled' : ''}>${ms('apps')}Appli ou fichier</button>
          <button class="btn tonal sm state" data-add="folder" ${full ? 'disabled' : ''}>${ms('folder')}Dossier</button>
          <button class="btn tonal sm state" data-add="url" ${full ? 'disabled' : ''}>${ms('public')}Site web</button>
          <button class="btn text sm state" data-add="reset">Rétablir</button>
        </div>
        ${full ? `<div class="body-s variant" style="margin:10px 8px 0;display:flex;gap:6px;align-items:center">${ms('info', 's18')}8 tuiles au maximum : retire-en une avec ${ms('delete', 's18')} pour en ajouter une autre.</div>` : ''}
        <div class="t-url" style="display:none;gap:8px;margin:12px 8px 0"><input class="field t-url-in" placeholder="https://…" style="flex:1"><input class="field t-name-in" placeholder="Nom" style="width:140px"><button class="btn filled sm state t-url-ok">OK</button></div>`;
  },
  b_tiles(body) {
    const list = [...(this.data.config.tiles || [])];
    const commit = async (l) => { await this.save({ tiles: l }); I.emit('tiles'); this.open('tiles'); };
    $$('[data-tmove]', body).forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.tmove, j = i + +b.dataset.d; if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; commit(list);
    }));
    $$('[data-tdel]', body).forEach((b) => b.addEventListener('click', () => { list.splice(+b.dataset.tdel, 1); commit(list); }));
    $('.t-add', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      const a = b.dataset.add;
      if (a === 'reset') return commit(I.DEFAULT_TILES.map((t) => ({ ...t })));
      if (a === 'url') { $('.t-url', body).style.display = 'flex'; $('.t-url-in', body).focus(); return; }
      if (a === 'builtin') {
        const free = Object.entries(I.TILES).filter(([k]) => !list.some((t) => t.k === k));
        if (!free.length) return snack('Tous les raccourcis sont déjà là');
        return openMenu(b, free.map(([k, [icon, label]]) => ({ icon, label, value: k })), (it) => { list.push({ k: it.value }); commit(list); });
      }
      const t = await follet.tilePick(a === 'folder');
      if (t) { list.push(t); commit(list); }
    });
    $('.t-url-ok', body).addEventListener('click', () => {
      let url = $('.t-url-in', body).value.trim(); if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      let label = $('.t-name-in', body).value.trim();
      if (!label) try { label = new URL(url).hostname.replace(/^www\./, ''); } catch { return snack('Adresse invalide'); }
      list.push({ type: 'url', url, label }); commit(list);
    });
    $('.t-url-in', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.t-url-ok', body).click(); });
  },

  // ---------- Onglets ----------
  r_tabs() {
    const t = this.data.config.tabs;
    const last = I.order.length - 1;
    return `<div class="body-s variant" style="margin:0 8px 12px">Les flèches changent l'ordre des onglets dans la barre.</div>`
      + I.order.map((id, i) => this.row(`${ms(I.views[id].icon, 's20')} ${I.views[id].label}`, '',
        `<div style="display:flex;gap:2px;align-items:center"><button class="icon-btn sm state" data-move="${id}" data-d="-1" title="Monter" ${i ? '' : 'disabled'}>${ms('arrow_upward')}</button><button class="icon-btn sm state" data-move="${id}" data-d="1" title="Descendre" ${i < last ? '' : 'disabled'}>${ms('arrow_downward')}</button><span style="width:8px"></span>${this.sw(id, t[id] !== false)}</div>`)).join('');
  },
  b_tabs(body) {
    this.bindSwitches(body, async (k, v) => { await this.save({ tabs: { [k]: v } }); I.buildNav(); });
    $$('[data-move]', body).forEach((b) => b.addEventListener('click', async () => {
      const order = [...I.order], i = order.indexOf(b.dataset.move), j = i + +b.dataset.d;
      if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      await this.save({ tabOrder: order });
      await I.buildNav();
      this.open('tabs');
    }));
  },

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
        const res = await follet.geocode(e.target.value).catch(() => []);
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
        <div class="txt"><div class="hl">Agendas iCal</div><div class="sup">Google Agenda → Paramètres → ton agenda → « Adresse secrète au format iCal ». Fonctionne aussi avec Outlook, iCloud, Proton… L'adresse reste dans %APPDATA%\\Follet, jamais dans le code.</div></div>
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

  // ---------- IA ----------
  r_ai() {
    const i = this.ai, p = i.providers[i.provider];
    const opts = Object.entries(i.providers).map(([id, v]) => `<option value="${id}" ${id === i.provider ? 'selected' : ''}>${esc(v.label)} — ${esc(v.hint)}</option>`).join('');
    let html = this.row('Fournisseur', 'Celui qui répond quand tu parles à Follet.', `<select class="field ai-prov" style="width:300px">${opts}</select>`);
    if (i.provider === 'custom') html += this.row('Adresse du serveur', 'Ex. http://localhost:1234/v1 (LM Studio), https://api.groq.com/openai/v1…', `<input class="field ai-base" value="${esc(i.customBase)}" placeholder="https://…/v1" style="width:300px">`);
    if (p.key) html += this.row('Clé API' + (p.key === 'optional' ? ' (optionnelle)' : ''), p.hasKey ? `${ms('lock', 's18')} Enregistrée, chiffrée par Windows sur ce PC` : 'Stockée chiffrée sur ce PC, jamais dans le code ni envoyée ailleurs.',
      `<div style="display:flex;gap:6px"><input type="password" class="field ai-key" placeholder="${p.hasKey ? '••••••••' : 'Colle ta clé'}" style="width:190px">${p.hasKey ? `<button class="icon-btn sm state ai-key-del" title="Supprimer la clé">${ms('delete')}</button>` : ''}<button class="btn filled sm state ai-key-save">OK</button></div>`);
    html += this.row('Modèle', i.provider === 'claude-code' ? 'Vide = le modèle par défaut de Claude Code.' : 'Liste lue chez le fournisseur.', `<div style="display:flex;gap:6px"><select class="field ai-model" style="width:230px"><option value="">${i.model ? esc(i.model) : 'Par défaut'}</option></select><button class="icon-btn sm state ai-refresh" title="Recharger la liste">${ms('refresh')}</button></div>`);
    if (i.provider === 'anthropic') html += this.row('Effort', 'Plus d\'effort = réponses plus réfléchies mais plus lentes et plus chères.', '<div class="seg-effort"></div>');
    html += `<div class="body-s variant" style="margin:10px 8px">${ms('info', 's18')} Tes messages sont envoyés au fournisseur choisi. Avec Ollama, tout reste sur ton PC.</div>`;
    return html;
  },
  async b_ai(body) {
    const i = this.ai;
    $('.ai-prov', body).addEventListener('change', async (e) => { await this.save({ ai: { provider: e.target.value } }); this.open('ai'); });
    $('.ai-base', body)?.addEventListener('change', (e) => this.save({ ai: { customBase: e.target.value.trim() } }, 'Adresse enregistrée'));
    const saveKey = async () => { const k = $('.ai-key', body).value.trim(); if (!k) return; await follet.aiKeySet(i.provider, k); snack('Clé enregistrée'); this.open('ai'); };
    $('.ai-key-save', body)?.addEventListener('click', saveKey);
    $('.ai-key', body)?.addEventListener('keydown', (e) => e.key === 'Enter' && saveKey());
    $('.ai-key-del', body)?.addEventListener('click', async () => { await follet.aiKeySet(i.provider, ''); snack('Clé supprimée'); this.open('ai'); });
    if ($('.seg-effort', body)) segmented($('.seg-effort', body), [['low', 'Rapide'], ['medium', 'Équilibré'], ['high', 'Réfléchi']], i.effort, (v) => this.save({ ai: { effort: v } }));
    const sel = $('.ai-model', body);
    sel.addEventListener('change', () => this.save({ ai: { models: { [i.provider]: sel.value } } }, sel.value ? 'Modèle : ' + sel.value : 'Modèle par défaut'));
    const load = async () => {
      const list = await follet.aiModels(i.provider);
      if (!Array.isArray(list)) { snack('Liste indisponible : ' + (list && list.error)); return; }
      const all = [...new Set([i.model, ...list].filter(Boolean))];
      sel.innerHTML = `<option value="">Par défaut</option>` + all.map((m) => `<option value="${esc(m)}" ${m === i.model ? 'selected' : ''}>${esc(m)}</option>`).join('');
    };
    $('.ai-refresh', body).addEventListener('click', load);
    load();
  },

  // ---------- Systeme ----------
  r_system() {
    const c = this.data.config;
    const drives = this.data.drives.map((d) => `<label class="chip ${c.disks.includes(d) ? 'selected' : ''}" style="cursor:pointer"><input type="checkbox" data-d="${esc(d)}" ${c.disks.includes(d) ? 'checked' : ''} hidden>${ms(c.disks.includes(d) ? 'check' : 'hard_drive')}${d.slice(0, 2)}</label>`).join(' ');
    return this.row('Disques affichés', '', `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${drives}</div>`)
      + this.row('Shell du terminal', 'Par défaut : PowerShell 7.', `<select class="field shell">${[['pwsh.exe', 'PowerShell 7'], ['powershell.exe', 'Windows PowerShell'], ['cmd.exe', 'Invite de commandes'], ['wsl.exe', 'WSL']].map(([v, l]) => `<option value="${v}" ${c.shell === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
  },
  b_system(body) {
    $$('[data-d]', body).forEach((cb) => cb.addEventListener('change', async () => {
      const disks = $$('[data-d]', body).filter((x) => x.checked).map((x) => x.dataset.d);
      await this.save({ disks }); this.open('system');
    }));
    $('.shell', body).addEventListener('change', (e) => this.save({ shell: e.target.value }, 'Effet au prochain terminal'));
  },

  // ---------- A propos ----------
  r_about() {
    return this.row('Follet', `Version ${esc(this.data.version)} · Material You`, `<button class="btn tonal sm state tour">${ms('tour')}Revoir la visite</button>`)
      + `<div class="set-row upd-row"><div class="txt"><div class="hl">Mises à jour</div><div class="sup upd-sup">…</div></div><div class="upd-ctrl"></div></div>`
      + this.row('Données personnelles', esc(this.data.dataDir) + '<br>Config, tâches, étagère et conversations Claude restent sur ce PC.', `<button class="btn tonal sm state open-data">${ms('folder_open')}Ouvrir</button>`)
      + this.row('Sauvegarde des réglages', "Pour un nouveau PC : réglages, tuiles, tâches, favoris et éléments épinglés (et tes adresses d'agenda). Les clés d'IA ne sont jamais exportées.", `<div style="display:flex;gap:6px"><button class="btn tonal sm state cfg-exp">${ms('upload')}Exporter</button><button class="btn tonal sm state cfg-imp">${ms('download')}Importer</button></div>`)
      + this.row('Services contactés', 'ipwho.is / geojs.io (position par IP), Open-Meteo (météo), speed.cloudflare.com (test de vitesse, sur demande), tes agendas iCal.', '');
  },
  b_about(body) {
    $('.open-data', body).addEventListener('click', () => follet.openDataFolder());
    $('.tour', body).addEventListener('click', () => I.tour(0));
    $('.cfg-exp', body).addEventListener('click', async () => { if (await follet.configExport()) snack('Réglages exportés'); });
    $('.cfg-imp', body).addEventListener('click', async () => {
      const r = await follet.configImport(); if (!r) return;
      if (r.error) return snack('Fichier de réglages invalide');
      snack('Réglages importés'); setTimeout(() => location.reload(), 900);
    });
    const paint = (s) => {
      const sup = $('.upd-sup', body), ctrl = $('.upd-ctrl', body);
      if (!sup) return;
      const L = s.latest;
      const txt = {
        idle: 'Vérifiée automatiquement toutes les 6 heures.',
        checking: 'Recherche…',
        none: `Tu as la dernière version${L ? ` (${esc(L.version)})` : ''}.`,
        available: `Version ${esc(L && L.version)} disponible.`,
        downloading: `Téléchargement… ${Math.round(s.progress * 100)} %`,
        ready: 'Lancement de l\'installateur…',
        error: esc(s.error || 'Erreur'),
      }[s.state];
      sup.innerHTML = txt;
      ctrl.innerHTML = s.state === 'available'
        ? `<button class="btn filled sm state upd-go">${ms('download')}Installer</button>`
        : `<button class="btn tonal sm state upd-check" ${s.state === 'checking' || s.state === 'downloading' ? 'disabled' : ''}>${ms('refresh')}Vérifier</button>`;
      $('.upd-go', ctrl)?.addEventListener('click', () => follet.updateInstall());
      $('.upd-check', ctrl)?.addEventListener('click', () => follet.updateCheck());
    };
    follet.updateStatus().then(paint);
    this.offUpdate && this.offUpdate();
    this.offUpdate = follet.onUpdate(paint);
  },
});

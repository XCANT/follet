/* Demarrage : construit la navigation et les vues, puis applique le mode demo si demande. */
(async function boot() {
  try { const { config } = await follet.configGet(); I.setLang(config.language); I.gpu = config.behavior.accel !== false; Follet.setPalette((config.mascot || {}).color); I.outfits = (config.mascot || {}).outfits !== false; I.wheel = config.behavior.wheel || 'open'; I.applyLayout(config); } catch { }
  const views = $('#views');
  for (const v of Object.values(I.views)) {
    const el = document.createElement('section');
    el.className = 'view'; el.dataset.view = v.id;
    el.innerHTML = v.html;
    views.appendChild(el);
    v.el = el;
    try { v.init && v.init(el); } catch (e) { console.error('init ' + v.id, e); }
  }

  I.buildNav = async () => {
    const { config } = await follet.configGet();
    I.applyLayout(config);
    const visible = I.order.filter((id) => config.tabs[id] !== false);
    $('#nav').innerHTML = visible.map((id) => `<button data-tab="${id}"><span class="ind">${ms(I.views[id].icon)}</span><span class="lbl">${esc(I.views[id].label)}</span></button>`).join('');
    $$('#nav button').forEach((b) => b.addEventListener('click', () => I.showTab(b.dataset.tab)));
    if (!visible.includes(I.tab) && I.tab !== 'settings') I.tab = visible[0] || 'home';
    $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === I.tab));
  };
  await I.buildNav();
  I.showTab(I.tab);
  I.renderCompact();
  I.updateMood();
  I.updateOutfit();

  // L'icone de la zone de notification = la mascotte aux couleurs du theme
  const trayIcon = () => { clearTimeout(I.trayT); I.trayT = setTimeout(() => Follet.png(64).then(follet.setTrayIcon).catch(() => { }), 900); };
  I.on('theme', trayIcon); I.on('mascot-palette', trayIcon); trayIcon();

  // Visite guidee : au premier lancement (3 pages), et une fois les nouveautes (pages 2 et 3) apres une mise a jour.
  // Reglages -> A propos permet de la revoir.
  const TOUR = 2;
  I.tour = async (from = 0) => {
    $('#welcome')?.remove();
    const { config: c } = await follet.configGet().catch(() => ({ config: {} }));
    const key = (k) => esc(String(c[k] || '—').replace('Control', 'Ctrl'));
    const card = (icon, b, t) => `<div>${ms(icon)}<b>${b}</b><span>${t}</span></div>`;
    const pages = [
      { title: "Salut, moi c'est Follet !", sub: "Je vis dans cette encoche, en haut de ton écran. Voici comment m'utiliser :",
        steps: card('mouse', 'Survole', 'pour voir la musique et ta journée') + card('swipe_down', 'Fais défiler', 'ou clique pour tout ouvrir')
          + card('keyboard', key('shortcut'), "m'ouvre de n'importe où") + card('move_to_inbox', 'Glisse des fichiers', 'sur moi pour les garder sous la main'),
        foot: "Devant une fenêtre plein écran, je me cache : garde la souris un instant en haut de l'écran, au milieu, pour me faire revenir." },
      { title: 'Mes raccourcis', sub: 'Ils marchent partout dans Windows, même quand je suis replié :',
        steps: card('content_paste', key('clipShortcut'), "l'historique du presse-papiers, Entrée colle") + card('screenshot_monitor', key('shotShortcut'), "capture l'écran dans l'Étagère")
          + card('document_scanner', key('ocrShortcut'), "copie le texte d'une zone de l'écran") + card('colorize', key('colorShortcut'), 'pipette : copie une couleur'),
        foot: "Sur l'encoche repliée : glisse à deux doigts (ou Maj+molette) pour changer de chanson, clic du milieu pour la pause." },
      { title: 'À découvrir', sub: "Quelques trucs que tu pourrais manquer :",
        steps: card('partly_cloudy_day', 'Météo détaillée', "clique la météo dans Aujourd'hui : pluie à venir, 24 h, 7 jours") + card('timer', 'Minuteurs et chrono', "plusieurs à la fois, Pomodoro, tours")
          + card('lyrics', 'Paroles', "synchronisées avec ta musique, dans l'aperçu") + card('palette', 'À ton goût', 'thèmes, noir OLED, tuiles, ordre des onglets dans les Réglages'),
        foot: "Je change aussi de tenue : tuque quand il fait froid, parapluie sous la pluie, chapeau de sorcière en octobre…" },
    ];
    let i = from;
    const w = document.createElement('div');
    w.id = 'welcome';
    $('#notch').appendChild(w);
    const close = () => {
      localStorage.setItem('welcomed', '1'); localStorage.setItem('tour', String(TOUR)); I.welcoming = false;
      w.classList.add('bye'); setTimeout(() => w.remove(), 400);
      I.showTab('home');
    };
    const render = () => {
      const p = pages[i], last = i === pages.length - 1;
      w.innerHTML = `<div class="w-mascot"></div>
        <div class="w-title">${p.title}</div>
        <div class="w-sub">${p.sub}</div>
        <div class="w-steps">${p.steps}</div>
        <div class="w-foot"><span class="variant body-s">${p.foot}</span>
          <div class="w-dots">${pages.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
          ${last ? '' : '<button class="btn text state w-skip">Passer</button>'}
          <button class="btn filled state w-go">${last ? "C'est parti" : 'Suivant'} ${ms('arrow_forward')}</button></div>`;
      Follet.create($('.w-mascot', w), { size: 96, mood: 'happy' });
      $('.w-go', w).addEventListener('click', () => { if (last) close(); else { i++; render(); } });
      $('.w-skip', w)?.addEventListener('click', close);
    };
    render();
    I.setMode('expanded'); I.welcoming = true;
  };
  if (!localStorage.getItem('welcomed') || I.demo === 'welcome') I.tour(0);
  else if (+(localStorage.getItem('tour') || 0) < TOUR && !I.demo) I.tour(1);

  if (I.demo && I.demo !== 'welcome') {
    I.setMode('expanded');
    const all = [...I.order, 'settings'];
    if (all.includes(I.demo)) I.showTab(I.demo);
    else { let i = 0; I.showTab(all[0]); setInterval(() => { i = (i + 1) % all.length; I.showTab(all[i]); }, 5000); }
  }
})();

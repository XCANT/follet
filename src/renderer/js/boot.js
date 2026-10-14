/* Demarrage : construit la navigation et les vues, puis applique le mode demo si demande. */
(async function boot() {
  try { const { config } = await follet.configGet(); I.setLang(config.language); I.gpu = config.behavior.accel !== false; Follet.setPalette((config.mascot || {}).color); I.outfits = (config.mascot || {}).outfits !== false; I.applyLayout(config); } catch { }
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

  // Premier lancement : Follet se presente et explique les gestes
  if (!localStorage.getItem('welcomed') || I.demo === 'welcome') {
    const w = document.createElement('div');
    w.id = 'welcome';
    w.innerHTML = `<div class="w-mascot"></div>
      <div class="w-title">Salut, moi c'est Follet !</div>
      <div class="w-sub">Je vis dans cette encoche, en haut de ton écran. Voici comment m'utiliser :</div>
      <div class="w-steps">
        <div>${ms('mouse')}<b>Survole</b><span>pour voir la musique et ta journée</span></div>
        <div>${ms('swipe_down')}<b>Fais défiler</b><span>ou clique pour tout ouvrir</span></div>
        <div>${ms('keyboard')}<b>Ctrl+Alt+Espace</b><span>m'ouvre de n'importe où</span></div>
        <div>${ms('move_to_inbox')}<b>Glisse des fichiers</b><span>sur moi pour les garder sous la main</span></div>
      </div>
      <div class="w-foot"><span class="variant body-s">Devant une fenêtre plein écran, je me cache : touche le haut de l'écran, au milieu, pour me faire revenir.</span>
      <button class="btn filled state w-go">C'est parti ${ms('arrow_forward')}</button></div>`;
    $('#notch').appendChild(w);
    Follet.create($('.w-mascot', w), { size: 96, mood: 'happy' });
    I.setMode('expanded'); I.welcoming = true;
    $('.w-go', w).addEventListener('click', () => {
      localStorage.setItem('welcomed', '1'); I.welcoming = false;
      w.classList.add('bye'); setTimeout(() => w.remove(), 400);
      I.showTab('home');
    });
  }

  if (I.demo && I.demo !== 'welcome') {
    I.setMode('expanded');
    const all = [...I.order, 'settings'];
    if (all.includes(I.demo)) I.showTab(I.demo);
    else { let i = 0; I.showTab(all[0]); setInterval(() => { i = (i + 1) % all.length; I.showTab(all[i]); }, 5000); }
  }
})();

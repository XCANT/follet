/* Demarrage : construit la navigation et les vues, puis applique le mode demo si demande. */
(async function boot() {
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
    const visible = I.order.filter((id) => config.tabs[id] !== false);
    $('#nav').innerHTML = visible.map((id) => `<button data-tab="${id}"><span class="ind">${ms(I.views[id].icon)}</span><span class="lbl">${esc(I.views[id].label)}</span></button>`).join('');
    $$('#nav button').forEach((b) => b.addEventListener('click', () => I.showTab(b.dataset.tab)));
    if (!visible.includes(I.tab) && I.tab !== 'settings') I.tab = visible[0] || 'home';
    $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === I.tab));
  };
  await I.buildNav();
  I.showTab(I.tab);
  I.renderCompact();

  if (I.demo) {
    I.setMode('expanded');
    const all = [...I.order, 'settings'];
    if (all.includes(I.demo)) I.showTab(I.demo);
    else { let i = 0; I.showTab(all[0]); setInterval(() => { i = (i + 1) % all.length; I.showTab(all[i]); }, 5000); }
  }
})();

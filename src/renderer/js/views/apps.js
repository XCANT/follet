/* Apps : lanceur base sur le menu Demarrer, avec recherche et favoris. */
I.view('apps', {
  label: 'Apps', icon: 'apps',
  html: `<div class="toolbar"><div class="search">${ms('search')}<input class="app-search" placeholder="Chercher une appli · Entrée pour lancer"></div></div>
    <div class="favs"></div>
    <div class="scroll app-grid"></div>`,

  init(el) {
    this.el = el;
    this.obs = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const ph = en.target; this.obs.unobserve(ph);
        island.appIcon(ph.dataset.path).then((u) => { if (u && ph.isConnected) { const i = document.createElement('img'); i.src = u; ph.replaceWith(i); } });
      }
    });
    const search = $('.app-search', el);
    search.addEventListener('input', () => this.render());
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const f = $('.app-grid .app', el); if (f) this.launch(f.dataset.path); }
    });
    el.addEventListener('click', async (e) => {
      const t = e.target.closest('.app'); if (!t) return;
      if (e.target.closest('.fav')) { this.favs = await island.appFav(t.dataset.path, !this.favs.includes(t.dataset.path)); this.render(); return; }
      this.launch(t.dataset.path);
    });
  },
  async show() {
    if (!this.apps) { const r = await island.appsList(); this.apps = r.apps; this.favs = r.favorites; }
    this.render();
    setTimeout(() => $('.app-search', this.el).focus(), 60);
  },
  launch(p) { island.appLaunch(p); $('.app-search', this.el).value = ''; I.setMode('collapsed'); },
  tile(a, fav) {
    return `<button class="app state" data-path="${esc(a.path)}" title="${esc(a.name)}"><div class="ph" data-path="${esc(a.path)}"></div><span>${esc(a.name)}</span>
      <i class="icon-btn xs state fav ${fav ? 'on' : ''}" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ms('star', fav ? 'fill' : '')}</i></button>`;
  },
  render() {
    if (!this.apps) return;
    const q = $('.app-search', this.el).value.trim().toLowerCase();
    const favApps = this.favs.map((p) => this.apps.find((a) => a.path === p)).filter(Boolean);
    $('.favs', this.el).innerHTML = q ? '' : favApps.map((a) => this.tile(a, true)).join('');
    const list = this.apps.filter((a) => !q || a.name.toLowerCase().includes(q)).slice(0, 140);
    $('.app-grid', this.el).innerHTML = list.map((a) => this.tile(a, this.favs.includes(a.path))).join('') || `<div class="empty" style="grid-column:1/-1">${ms('search_off')}Aucune appli trouvée</div>`;
    $$('.ph', this.el).forEach((p) => this.obs.observe(p));
  },
});

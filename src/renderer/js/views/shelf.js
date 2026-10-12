/* Etagere : fichiers deposes sur l'island, a glisser ensuite vers n'importe quelle appli. */
I.view('shelf', {
  label: 'Étagère', icon: 'inventory_2',
  html: `<div class="shelf-head">
      <div style="flex:1"><div class="title-m">Étagère</div><div class="body-s variant">Glisse des fichiers sur l'encoche pour les garder ici, puis fais-les glisser où tu veux.</div></div>
      <button class="btn outlined sm state shelf-clear">${ms('delete_sweep')}Tout retirer</button>
    </div>
    <div class="scroll shelf-grid"></div>`,

  init(el) {
    this.el = el;
    const grid = $('.shelf-grid', el);
    grid.addEventListener('click', async (e) => {
      const f = e.target.closest('.file'); if (!f) return;
      const p = f.dataset.path;
      if (e.target.closest('[data-a=remove]')) { await island.shelfRemove(p); this.refresh(); }
      else if (e.target.closest('[data-a=reveal]')) island.shelfReveal(p);
      else island.shelfOpen(p);
    });
    // glisser vers l'exterieur : on laisse Windows gerer le glisser natif
    grid.addEventListener('dragstart', (e) => {
      const f = e.target.closest('.file'); if (!f) return;
      e.preventDefault();
      I.dragOut = true; setTimeout(() => (I.dragOut = false), 1500);
      island.shelfDrag(f.dataset.path);
    });
    $('.shelf-clear', el).addEventListener('click', async () => { await island.shelfClear(); this.refresh(); });
  },
  show() { this.refresh(); },

  async refresh() {
    if (!this.el) return;
    const items = await island.shelfList();
    const grid = $('.shelf-grid', this.el);
    $('.shelf-clear', this.el).style.display = items.length ? '' : 'none';
    grid.innerHTML = items.length ? items.map((f) => `<div class="file state ${f.exists ? '' : 'missing'}" draggable="true" data-path="${esc(f.path)}" title="${esc(f.path)}">
        <div class="ph" data-icon="${esc(f.path)}">${ms(f.dir ? 'folder' : 'draft', 's40')}</div>
        <div class="nm">${esc(f.name)}</div><div class="sz">${!f.exists ? 'Introuvable' : f.dir ? 'Dossier' : fmtBytes(f.size)}</div>
        <div class="acts"><button class="icon-btn xs state" data-a="reveal" title="Afficher dans l'explorateur">${ms('folder_open')}</button><button class="icon-btn xs state" data-a="remove" title="Retirer">${ms('close')}</button></div>
      </div>`).join('')
      : `<div class="empty" style="grid-column:1/-1;padding-top:60px">${ms('move_to_inbox')}<span class="title-s">L'étagère est vide</span>Fais glisser des fichiers sur l'encoche, même quand elle est repliée.</div>`;
    for (const ph of $$('[data-icon]', grid)) {
      island.shelfIcon(ph.dataset.icon).then((u) => { if (u) ph.outerHTML = `<img src="${u}" draggable="false">`; });
    }
  },
});

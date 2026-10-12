/* Presse-papiers : historique des textes copies (en memoire seulement). */
I.view('clip', {
  label: 'Copié', icon: 'content_paste',
  html: `<div class="toolbar">
      <div class="search">${ms('search')}<input class="clip-search" placeholder="Rechercher dans l'historique"></div>
      <button class="btn outlined sm state clip-clear">${ms('delete_sweep')}Effacer</button>
    </div>
    <div class="scroll clips"></div>
    <div class="body-s variant" style="margin-top:8px;text-align:center">${ms('lock', 's18')} Gardé en mémoire seulement, jamais écrit sur le disque · clic pour recopier</div>`,

  init(el) {
    this.el = el; this.clips = [];
    island.clipList().then((c) => (this.clips = c));
    island.onClip((c) => { this.clips = c; if (I.mode === 'expanded' && I.tab === 'clip') this.render(); });
    $('.clip-search', el).addEventListener('input', () => this.render());
    $('.clip-clear', el).addEventListener('click', async () => { this.clips = await island.clipClear(); this.render(); });
    $('.clips', el).addEventListener('click', async (e) => {
      const c = e.target.closest('.clip'); if (!c) return;
      const at = +c.dataset.at;
      if (e.target.closest('.del')) { this.clips = await island.clipRemove(at); this.render(); return; }
      const item = this.clips.find((x) => x.at === at); if (!item) return;
      await island.clipCopy(item.text);
      snack('Copié dans le presse-papiers');
      setTimeout(() => I.setMode('collapsed'), 700);
    });
  },
  show() { this.render(); setTimeout(() => $('.clip-search', this.el).focus(), 60); },

  render() {
    const q = $('.clip-search', this.el).value.toLowerCase();
    const list = this.clips.filter((c) => !q || c.text.toLowerCase().includes(q));
    $('.clips', this.el).innerHTML = list.length ? list.map((c) => `<div class="clip state" data-at="${c.at}">
        <div class="body">${esc(c.text.length > 500 ? c.text.slice(0, 500) + '…' : c.text)}</div>
        <span class="meta">${ago(c.at)}</span><button class="icon-btn xs state del" title="Retirer">${ms('close')}</button></div>`).join('')
      : `<div class="empty">${ms('content_paste_off')}${this.clips.length ? 'Aucun résultat' : 'Copie du texte (Ctrl+C) : il apparaîtra ici'}</div>`;
  },
});

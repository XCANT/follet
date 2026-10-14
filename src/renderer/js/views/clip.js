/* Presse-papiers : historique des textes et images copies (en memoire seulement) et elements epingles
   (gardes sur le disque). Ctrl+Alt+V l'ouvre : fleches pour choisir, Entree colle dans l'appli d'avant. */
const URL_RE = /^https?:\/\/\S+$/i, COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
I.view('clip', {
  label: 'Copié', icon: 'content_paste',
  html: `<div class="toolbar">
      <div class="search">${ms('search')}<input class="clip-search" placeholder="Rechercher dans l'historique"></div>
      <button class="btn outlined sm state clip-clear">${ms('delete_sweep')}Effacer</button>
    </div>
    <div class="scroll clips"></div>
    <div class="body-s variant clip-foot" style="margin-top:8px;text-align:center"></div>`,

  init(el) {
    this.el = el; this.clips = []; this.pins = []; this.sel = 0;
    this.load();
    follet.onClip((c) => { this.clips = c; if (this.visible()) this.render(); });
    $('.clip-search', el).addEventListener('input', () => { this.sel = 0; this.render(); });
    $('.clip-search', el).addEventListener('keydown', (e) => {
      const items = $$('.clip', el);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.sel = Math.max(0, Math.min(items.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1))); this.highlight(); }
      else if (e.key === 'Enter' && items[this.sel]) { e.preventDefault(); this.use(items[this.sel], !e.shiftKey); }
      else if (e.key === 'Escape') I.setMode('collapsed');
    });
    $('.clip-clear', el).addEventListener('click', async () => { this.clips = await follet.clipClear(); this.render(); });
    $('.clips', el).addEventListener('click', async (e) => {
      const c = e.target.closest('.clip'); if (!c) return;
      const item = this.item(c);
      if (e.target.closest('.del')) { this.clips = await follet.clipRemove(+c.dataset.at); this.render(); return; }
      if (e.target.closest('.pin')) { this.pins = c.dataset.pin != null ? await follet.clipUnpin(item.text) : await follet.clipPin(item.text); this.render(); return; }
      if (e.target.closest('.open')) { follet.openUrl(item.text); I.setMode('collapsed'); return; }
      this.use(c, false);
    });
  },
  visible() { return I.mode === 'expanded' && I.tab === 'clip'; },
  async load() { const r = await follet.clipList(); this.clips = r.clips; this.pins = r.pins; this.canPaste = r.canPaste; },
  async show() { await this.load(); this.sel = 0; this.render(); setTimeout(() => $('.clip-search', this.el).focus(), 60); },

  item(c) { return c.dataset.pin != null ? { type: 'text', text: this.pins[+c.dataset.pin] } : this.clips.find((x) => x.at === +c.dataset.at); },
  // Entree : colle dans l'appli d'avant (si l'historique a ete ouvert par le raccourci), sinon copie
  async use(c, paste) {
    const item = this.item(c); if (!item) return;
    const ref = item.type === 'image' ? item.at : item.text;
    if (paste && this.canPaste) { this.canPaste = false; I.setMode('collapsed'); await follet.clipPaste(ref); return; }
    await follet.clipCopy(ref);
    snack('Copié dans le presse-papiers');
    setTimeout(() => I.setMode('collapsed'), 700);
  },
  highlight() {
    $$('.clip', this.el).forEach((c, i) => c.classList.toggle('sel', i === this.sel));
    const s = $('.clip.sel', this.el); if (s) s.scrollIntoView({ block: 'nearest' });
  },

  row(c, pinIndex) {
    const text = c.text || '', pinned = pinIndex != null || this.pins.includes(text);
    const kind = c.type === 'image' ? 'image' : URL_RE.test(text.trim()) ? 'link' : COLOR_RE.test(text.trim()) ? 'color' : 'text';
    const body = kind === 'image' ? `<img class="clip-img" src="${c.thumb}"><span class="meta">${c.w}×${c.h}</span>`
      : `${kind === 'color' ? `<span class="swatch" style="background:${esc(text.trim())}"></span>` : kind === 'link' ? ms('link', 's18') : ''}<div class="body">${esc(text.length > 500 ? text.slice(0, 500) + '…' : text)}</div>`;
    const attrs = pinIndex != null ? `data-pin="${pinIndex}"` : `data-at="${c.at}"`;
    return `<div class="clip state ${kind}" ${attrs}>${body}
      ${pinIndex == null ? `<span class="meta">${ago(c.at)}</span>` : ''}
      ${kind === 'link' ? `<button class="icon-btn xs state open" title="Ouvrir le lien">${ms('open_in_new')}</button>` : ''}
      ${kind !== 'image' ? `<button class="icon-btn xs state pin ${pinned ? 'on' : ''}" title="${pinned ? 'Désépingler' : 'Épingler'}">${ms('push_pin', pinned ? 'fill' : '')}</button>` : ''}
      ${pinIndex == null ? `<button class="icon-btn xs state del" title="Retirer">${ms('close')}</button>` : ''}</div>`;
  },
  render() {
    const q = $('.clip-search', this.el).value.toLowerCase();
    const match = (t) => !q || (t || '').toLowerCase().includes(q);
    const pins = this.pins.map((t, i) => [t, i]).filter(([t]) => match(t));
    const list = this.clips.filter((c) => (c.type === 'image' ? !q : match(c.text)));
    let html = '';
    if (pins.length) html += `<div class="clip-h">${ms('push_pin', 'fill s18')}Épinglés</div>` + pins.map(([t, i]) => this.row({ type: 'text', text: t }, i)).join('');
    if (list.length) html += (pins.length ? `<div class="clip-h">${ms('history', 's18')}Historique</div>` : '') + list.map((c) => this.row(c)).join('');
    $('.clips', this.el).innerHTML = html || `<div class="empty">${ms('content_paste_off')}${this.clips.length || this.pins.length ? 'Aucun résultat' : 'Copie du texte ou une image (Ctrl+C) : ils apparaîtront ici'}</div>`;
    $('.clip-foot', this.el).innerHTML = `${ms('lock', 's18')} ` + (this.canPaste ? 'Entrée colle dans l\'appli d\'avant · Maj+Entrée copie seulement' : 'Historique en mémoire seulement · les épinglés sont gardés · clic pour recopier');
    this.sel = Math.min(this.sel, Math.max(0, $$('.clip', this.el).length - 1));
    this.highlight();
  },
});

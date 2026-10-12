/* IA : Follet sur sa scene + discussion avec le fournisseur choisi (Claude Code, API, Ollama...). */
I.view('ai', {
  label: 'Follet', icon: 'local_fire_department',
  html: `<div class="grid v-ai">
    <div class="card stage">
      <div class="stage-mascot"></div>
      <div class="stage-name">Follet</div>
      <div class="stage-status">Prêt à t'aider</div>
      <div class="stage-pickers">
        <button class="chip assist state pick-provider" title="Changer de fournisseur">${ms('hub')}<span class="lbl">…</span></button>
        <button class="chip assist state pick-model" title="Changer de modèle">${ms('neurology')}<span class="lbl">…</span></button>
      </div>
      <div class="ideas"></div>
      <div class="stage-usage"></div>
    </div>
    <div class="card chat">
      <div class="scroll chat-log"></div>
      <div class="chat-input">
        <button class="icon-btn state chat-new" title="Nouvelle conversation">${ms('edit_square')}</button>
        <div class="ta-wrap">
          <button class="chip sm state clip-attach" title="Joindre le dernier texte copié">${ms('content_paste')}Presse-papiers</button>
          <textarea rows="1" placeholder="Demande à Follet… (Entrée pour envoyer)"></textarea>
        </div>
        <button class="icon-btn filled state chat-send" title="Envoyer">${ms('arrow_upward')}</button>
      </div>
    </div>
  </div>`,

  init(el) {
    this.el = el; this.messages = []; this.busy = false; this.attach = false;
    this.mascot = Follet.create($('.stage-mascot', el), { size: 112 });
    I.on('mood', (m) => { if (!this.busy) this.mascot.setMood(m === 'sleep' && I.tab === 'ai' && I.mode === 'expanded' ? 'idle' : m); });
    I.on('theme', () => this.refreshAvatar());
    this.refreshAvatar();
    this.renderEmpty();

    const ta = $('textarea', el);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } });
    $('.chat-send', el).addEventListener('click', () => (this.busy ? follet.aiStop() : this.send()));
    $('.chat-new', el).addEventListener('click', () => { if (this.busy) return; this.messages = []; this.renderEmpty(); ta.focus(); });
    $('.clip-attach', el).addEventListener('click', (e) => { this.attach = !this.attach; e.currentTarget.classList.toggle('selected', this.attach); });
    $('.ideas', el).addEventListener('click', (e) => { const b = e.target.closest('[data-idea]'); if (b) this.idea(b.dataset.idea); });
    $('.pick-provider', el).addEventListener('click', (e) => this.pickProvider(e.currentTarget));
    $('.pick-model', el).addEventListener('click', (e) => this.pickModel(e.currentTarget));

    follet.onAi(({ type, data }) => {
      if (type === 'delta') { if (!this.text) this.mascot.bump(); this.text += data; this.queue(); }
      else if (type === 'error') this.add('err', `${ms('error', 's18')} ${esc(data)}`);
      else if (type === 'done') this.finish();
    });

    const IDEAS = [
      ['summary', 'notes', 'Résume ce que j\'ai copié'], ['explain', 'lightbulb', 'Explique ce que j\'ai copié'],
      ['translate', 'translate', 'Traduis ce que j\'ai copié'], ['write', 'edit', 'Aide-moi à écrire un message'],
    ];
    $('.ideas', el).innerHTML = IDEAS.map(([k, i, l]) => `<button class="idea state" data-idea="${k}">${ms(i, 's18')}<span>${l}</span></button>`).join('');
  },

  async show() {
    this.info = await follet.aiInfo();
    this.renderPickers(); this.loadUsage();
    setTimeout(() => $('textarea', this.el).focus(), 60);
  },

  async refreshAvatar() { try { this.avatar = await Follet.png(56); } catch { } },

  renderPickers() {
    const i = this.info, p = i.providers[i.provider];
    $('.pick-provider .lbl', this.el).textContent = p.label;
    $('.pick-model .lbl', this.el).textContent = i.model || (i.provider === 'claude-code' ? 'Modèle par défaut' : 'Choisir un modèle');
  },
  pickProvider(anchor) {
    const i = this.info;
    openMenu(anchor, [{ header: 'Fournisseur d\'IA' }, ...Object.entries(i.providers).map(([id, p]) => ({
      icon: id === i.provider ? 'check' : p.key === true && !p.hasKey ? 'key' : 'hub', label: `${p.label} — ${p.key === true && !p.hasKey ? 'clé requise' : p.hint}`, on: id === i.provider, value: id,
    }))], async (it) => {
      await follet.configSet({ ai: { provider: it.value } });
      this.info = await follet.aiInfo(); this.renderPickers(); this.loadUsage();
      const p = this.info.providers[it.value];
      if (p.key === true && !p.hasKey) { snack('Ajoute ta clé dans Réglages → IA'); I.showTab('settings'); I.views.settings.open('ai'); }
    });
  },
  async pickModel(anchor) {
    const list = await follet.aiModels(this.info.provider);
    if (!Array.isArray(list) || !list.length) { snack(list && list.error ? 'Modèles indisponibles : ' + list.error : 'Aucun modèle trouvé'); return; }
    openMenu(anchor, [{ header: 'Modèle' }, ...list.slice(0, 40).map((m) => ({ icon: m === this.info.model ? 'check' : 'neurology', label: m, on: m === this.info.model, value: m }))], async (it) => {
      await follet.configSet({ ai: { models: { [this.info.provider]: it.value } } });
      this.info = await follet.aiInfo(); this.renderPickers();
    });
  },

  async loadUsage() {
    const el = $('.stage-usage', this.el);
    if (!this.info || this.info.provider !== 'claude-code') { el.innerHTML = ''; return; }
    const u = await follet.claudeUsage().catch(() => null);
    if (!u) { el.innerHTML = ''; return; }
    const max = Math.max(1, ...u.days.map((d) => d.out));
    const reset = u.windowStart ? hhmm(new Date(u.windowStart + 5 * 3600e3)) : null;
    el.innerHTML = `<div class="u-line"><b>${fmtTok(u.today.out)}</b> jetons aujourd'hui${reset ? ` · fenêtre jusqu'à ${reset}` : ''}</div>
      <div class="u-bars">${u.days.map((d, i) => `<div class="${i === 6 ? 'today' : ''}" title="${fmtTok(d.out)} jetons"><i style="height:${Math.max(4, (100 * d.out) / max)}%"></i></div>`).join('')}</div>`;
  },

  renderEmpty() {
    $('.chat-log', this.el).innerHTML = `<div class="empty chat-hello">${ms('waving_hand')}<span class="title-m">Salut, c'est Follet !</span>Pose-moi une question, ou choisis une idée à gauche. Je peux lire ce que tu as copié.</div>`;
  },

  async idea(k) {
    const clips = await follet.clipList();
    const last = clips[0] && clips[0].text;
    const prompts = {
      summary: 'Résume ce texte en quelques points clairs :',
      explain: 'Explique-moi simplement ce texte :',
      translate: 'Traduis ce texte (en anglais s\'il est en français, sinon en français) :',
    };
    if (k === 'write') { const ta = $('textarea', this.el); ta.value = 'Aide-moi à écrire un message pour '; ta.focus(); return; }
    if (!last) { snack('Copie d\'abord du texte (Ctrl+C)'); return; }
    this.send(`${prompts[k]}\n\n${last}`, `${prompts[k].replace(/ :$/, '')} (texte copié, ${last.length} caractères)`);
  },

  setBusy(b) {
    this.busy = b;
    $('.chat-send .ms', this.el).textContent = b ? 'stop' : 'arrow_upward';
    $('.chat-send', this.el).dataset.tip = b ? 'Arrêter' : 'Envoyer';
    $('.stage-status', this.el).textContent = b ? 'Je réfléchis…' : 'Prêt à t\'aider';
    I.moodState.think = b; I.updateMood();
    this.mascot.setMood(b ? 'think' : I.mood);
  },
  add(cls, html) {
    const log = $('.chat-log', this.el); $('.chat-hello', log)?.remove();
    const row = document.createElement('div'); row.className = 'msg-row ' + cls;
    row.innerHTML = cls === 'ai' ? `<img class="avatar" src="${this.avatar || ''}"><div class="msg ai"></div>` : `<div class="msg ${cls}">${html}</div>`;
    log.appendChild(row); log.scrollTop = log.scrollHeight;
    return row.querySelector('.msg');
  },
  queue() { if (!this.queued) { this.queued = true; requestAnimationFrame(() => this.paint()); } },
  paint() {
    this.queued = false; if (!this.ai) return;
    this.ai.innerHTML = md(this.text); this.ai.classList.toggle('typing', this.busy);
    const log = $('.chat-log', this.el); log.scrollTop = log.scrollHeight;
  },
  async send(text, shown) {
    const ta = $('textarea', this.el);
    let q = (text ?? ta.value).trim();
    if (!q || this.busy) return;
    if (!text) { ta.value = ''; ta.style.height = 'auto'; }
    let display = shown || q;
    if (this.attach && !text) {
      const clips = await follet.clipList();
      if (clips[0]) { q += `\n\n---\nTexte copié :\n${clips[0].text}`; display += `\n📋 + texte copié`; }
      this.attach = false; $('.clip-attach', this.el).classList.remove('selected');
    }
    this.add('user', esc(display));
    this.messages.push({ role: 'user', content: q });
    this.text = ''; this.ai = this.add('ai', ''); this.ai.classList.add('typing');
    this.setBusy(true);
    if (!(await follet.aiAsk(this.messages))) { this.setBusy(false); }
  },
  finish() {
    this.setBusy(false); this.paint();
    if (this.text) { this.messages.push({ role: 'assistant', content: this.text }); I.flashMood('happy', 1800); }
    else if (this.ai) { this.ai.closest('.msg-row').remove(); this.messages.pop(); }
    this.ai = null;
    if (this.info && this.info.provider === 'claude-code') this.loadUsage();
  },
});

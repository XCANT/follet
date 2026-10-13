/* IA : Follet sur sa scene, discussion avec le fournisseur choisi, et tableau de bord d'utilisation. */
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
      <div class="win"></div>
      <div class="mini-stats"></div>
    </div>
    <div class="card chat">
      <div class="chat-head"><div class="seg-mode"></div><span class="ch-info variant body-s"></span><button class="icon-btn sm state chat-new" title="Nouvelle conversation">${ms('edit_square')}</button></div>
      <div class="pane-chat">
        <div class="scroll chat-log"></div>
        <div class="attachments"></div>
        <div class="chat-input">
          <div class="ta-wrap">
            <textarea rows="1" placeholder="Demande à Follet… (Entrée pour envoyer)"></textarea>
            <div class="ta-tools">
              <button class="chip sm state clip-attach" title="Joindre le dernier texte copié">${ms('content_paste')}Presse-papiers</button>
              <span class="ta-hint">Maj+Entrée : nouvelle ligne</span>
            </div>
          </div>
          <button class="icon-btn filled state chat-send" title="Envoyer">${ms('arrow_upward')}</button>
        </div>
      </div>
      <div class="pane-usage scroll"></div>
    </div>
  </div>`,

  init(el) {
    this.el = el; this.messages = []; this.busy = false; this.attach = false; this.files = []; this.pane = 'chat';
    this.mascot = Follet.create($('.stage-mascot', el), { size: 84, active: () => I.mode === 'expanded' && I.tab === 'ai' });
    I.on('mood', (m) => { if (!this.busy) this.mascot.setMood(m === 'sleep' && I.tab === 'ai' && I.mode === 'expanded' ? 'idle' : m); });
    I.on('theme', () => this.refreshAvatar()); I.on('mascot-palette', () => this.refreshAvatar());
    this.refreshAvatar();
    this.renderEmpty();

    segmented($('.seg-mode', el), [['chat', 'Discussion'], ['usage', 'Utilisation']], 'chat', (v) => this.setPane(v));
    $('.pane-usage', el).style.display = 'none';
    const ta = $('textarea', el);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } });
    $('.chat-send', el).addEventListener('click', () => (this.busy ? follet.aiStop() : this.send()));
    $('.chat-new', el).addEventListener('click', () => { if (this.busy) return; this.messages = []; this.files = []; this.renderFiles(); this.renderEmpty(); this.setPane('chat'); ta.focus(); });
    $('.clip-attach', el).addEventListener('click', (e) => { this.attach = !this.attach; e.currentTarget.classList.toggle('selected', this.attach); });
    $('.chat-log', el).addEventListener('click', (e) => { const b = e.target.closest('[data-idea]'); if (b) this.idea(b.dataset.idea); });
    $('.attachments', el).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { this.files.splice(+b.dataset.rm, 1); this.renderFiles(); } });
    $('.pick-provider', el).addEventListener('click', (e) => this.pickProvider(e.currentTarget));
    $('.pick-model', el).addEventListener('click', (e) => this.pickModel(e.currentTarget));
    $('.mini-stats', el).addEventListener('click', () => this.setPane('usage'));

    follet.onAi(({ type, data }) => {
      if (type === 'delta') { if (!this.text) { this.mascot.bump(); this.t1 = Date.now(); } this.text += data; this.queue(); }
      else if (type === 'error') this.add('err', `${ms('error', 's18')} ${esc(data)}`);
      else if (type === 'done') this.finish();
    });
  },

  async show() {
    this.info = await follet.aiInfo();
    this.renderPickers(); this.loadUsage();
    clearInterval(this.ut); this.ut = setInterval(() => this.loadUsage(), 30000);
    if (this.pane === 'chat') setTimeout(() => $('textarea', this.el).focus(), 60);
  },
  hide() { clearInterval(this.ut); },

  setPane(p) {
    this.pane = p;
    $$('.chat-head .segmented button', this.el).forEach((b) => b.classList.toggle('on', b.dataset.v === p));
    $('.pane-chat', this.el).style.display = p === 'chat' ? '' : 'none';
    $('.pane-usage', this.el).style.display = p === 'usage' ? '' : 'none';
    if (p === 'usage') this.renderUsage(); else setTimeout(() => $('textarea', this.el).focus(), 30);
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

  // ---------- utilisation ----------
  async loadUsage() {
    const [cu, fu] = await Promise.all([follet.claudeUsage().catch(() => null), follet.aiUsage().catch(() => null)]);
    this.cu = cu; this.fu = fu;
    this.renderSide();
    if (this.pane === 'usage') this.renderUsage();
  },
  renderSide() {
    const cu = this.cu, fu = this.fu, cc = this.info && this.info.provider === 'claude-code';
    const win = $('.win', this.el), mini = $('.mini-stats', this.el);
    if (cc && cu) {
      const w = cu.window;
      const pct = w ? Math.min(100, (100 * (Date.now() - w.start)) / (w.end - w.start)) : 0;
      const left = w ? Math.max(0, w.end - Date.now()) : 0;
      const g = gauge(64, 7);
      win.innerHTML = `${g.html(`<span class="ms s20">${w ? 'hourglass_top' : 'bedtime'}</span>`)}
        <div class="w-txt"><div class="w-lbl">Fenêtre de 5 h</div>
        <div class="w-big">${w ? `${Math.floor(left / 3600e3)} h ${pad(Math.floor((left % 3600e3) / 60e3))}` : 'Libre'}</div>
        <div class="w-sub">${w ? `fin à ${hhmm(new Date(w.end))}` : 'Aucune fenêtre en cours'}</div></div>`;
      g.set($('.gauge', win), pct);
      const max = Math.max(1, ...cu.days.map((d) => d.out));
      mini.innerHTML = `<div class="ms-row"><div><b>${fmtTok(cu.today.out)}</b><span>jetons auj.</span></div><div><b>${cu.today.n}</b><span>messages</span></div><div><b>${cu.sessionsToday}</b><span>sessions</span></div></div>
        <div class="u-bars">${cu.days.map((d, i) => `<div class="${i === 6 ? 'today' : ''}" title="${dayName(new Date(d.day), { weekday: 'long' })} : ${fmtTok(d.out)} jetons"><i style="height:${Math.max(4, (100 * d.out) / max)}%"></i><span>${dayName(new Date(d.day), { weekday: 'narrow' })}</span></div>`).join('')}</div>
        <div class="ms-more">Voir le détail ${ms('chevron_right', 's18')}</div>`;
    } else if (fu) {
      win.innerHTML = '';
      mini.innerHTML = `<div class="ms-row"><div><b>${fu.today.n}</b><span>questions auj.</span></div><div><b>${fmtTok(fu.month.out)}</b><span>jetons (30 j)</span></div><div><b>${fu.month.ms ? (fu.month.ms / 1000).toFixed(1) + ' s' : '—'}</b><span>réponse moy.</span></div></div>
        <div class="ms-more">Voir le détail ${ms('chevron_right', 's18')}</div>`;
    }
    $('.ch-info', this.el).textContent = this.messages.length ? `${Math.ceil(this.messages.length / 2)} échange${this.messages.length > 2 ? 's' : ''}` : '';
  },
  renderUsage() {
    const cu = this.cu, fu = this.fu, box = $('.pane-usage', this.el);
    const big = (v, l, icon) => `<div class="u-big">${ms(icon, 's20')}<b>${v}</b><span class="lbl">${l}</span></div>`;
    const bars = (list, total) => list.map((x) => `<div class="u-row"><span class="nm ellipsis" title="${esc(x.name)}">${esc(x.name.replace(/^claude-/, ''))}</span><div class="linear"><i style="width:${(100 * x.out) / Math.max(1, total)}%"></i></div><span class="v">${fmtTok(x.out)}</span></div>`).join('');
    let html = '';
    if (cu) {
      const hmax = Math.max(1, ...cu.hours), nowH = new Date().getHours();
      html += `<div class="u-title">Claude Code ${ms('info', 's18 variant')}<span class="variant body-s">tiré des journaux locaux, 7 derniers jours</span></div>
        <div class="u-bigs">${big(fmtTok(cu.today.out), 'jetons générés aujourd\'hui', 'bolt')}${big(fmtTok(cu.week.out), 'cette semaine', 'date_range')}${big(cu.today.n, `messages · ${cu.sessionsToday} session${cu.sessionsToday > 1 ? 's' : ''}`, 'forum')}${big(fmtTok(cu.week.cr), 'relus depuis le cache', 'cached')}</div>
        <div class="u-card"><div class="u-sub">Aujourd'hui, heure par heure</div>
          <div class="u-hours">${cu.hours.map((v, h) => `<div class="${h === nowH ? 'now' : ''} ${h > nowH ? 'future' : ''}" title="${h} h : ${fmtTok(v)} jetons"><i style="height:${v ? Math.max(6, (100 * v) / hmax) : 0}%"></i></div>`).join('')}</div>
          <div class="u-axis"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div></div>
        <div class="u-two">
          <div class="u-card"><div class="u-sub">Par modèle</div>${bars(cu.byModel, cu.week.out) || '<div class="variant body-s">—</div>'}</div>
          <div class="u-card"><div class="u-sub">Par projet</div>${bars(cu.byProject, cu.week.out) || '<div class="variant body-s">—</div>'}</div>
        </div>`;
    }
    if (fu) {
      const p = this.info ? this.info.providers[fu.provider].label : '';
      html += `<div class="u-card u-follet">${ms('local_fire_department', 's20')}<div><b>Par Follet avec ${esc(p)}</b><span>${fu.today.n} question${fu.today.n > 1 ? 's' : ''} aujourd'hui · ${fu.month.n} en 30 jours · ${fmtTok(fu.month.out)} jetons générés${fu.month.ms ? ` · réponse en ${(fu.month.ms / 1000).toFixed(1)} s en moyenne` : ''}</span></div></div>`;
    }
    box.innerHTML = html || `<div class="empty">${ms('monitoring')}<span class="title-s">Pas encore de données</span>Pose une question à Follet pour commencer.</div>`;
  },

  // ---------- discussion ----------
  renderEmpty() {
    const IDEAS = [
      ['summary', 'notes', 'Résume ce que j\'ai copié'], ['explain', 'lightbulb', 'Explique ce que j\'ai copié'],
      ['translate', 'translate', 'Traduis ce que j\'ai copié'], ['write', 'edit', 'Aide-moi à écrire un message'],
    ];
    $('.chat-log', this.el).innerHTML = `<div class="chat-hello">
      <div class="title-l">Salut, c'est Follet !</div>
      <div class="variant">Pose-moi une question, ou commence par une idée.</div>
      <div class="ideas">${IDEAS.map(([k, i, l]) => `<button class="idea state" data-idea="${k}">${ms(i, 's20')}<span>${l}</span></button>`).join('')}</div>
      <div class="hello-tip">${ms('upload_file', 's18')}Glisse un fichier texte sur l'encoche, puis sur <b>Demander à Follet</b>, pour que je le lise.</div>
    </div>`;
    this.renderSide && this.info && this.renderSide();
  },

  // Fichiers deposes sur la cible "Demander a Follet"
  async attachFiles(paths) {
    this.setPane('chat');
    const list = await follet.aiReadFiles(paths);
    const ok = list.filter((f) => f.text != null), bad = list.filter((f) => f.text == null);
    this.files.push(...ok);
    this.renderFiles();
    if (bad.length) snack(`Ignoré : ${bad.map((f) => `${f.name} (${f.skip})`).join(', ')}`);
    if (ok.length) { const ta = $('textarea', this.el); if (!ta.value) ta.value = ok.length > 1 ? 'Résume ces fichiers.' : 'Résume ce fichier.'; ta.focus(); ta.select(); }
  },
  renderFiles() {
    $('.attachments', this.el).innerHTML = this.files.map((f, i) => `<span class="chip sm att">${ms('description', 's18')}${esc(f.name)}<button class="icon-btn xs state" data-rm="${i}" title="Retirer">${ms('close', 's16')}</button></span>`).join('');
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
    if (this.files.length && !text) {
      q += this.files.map((f) => `\n\n---\nFichier « ${f.name} » :\n${f.text}`).join('');
      display += `\n📎 ${this.files.map((f) => f.name).join(', ')}`;
      this.files = []; this.renderFiles();
    }
    if (this.attach && !text) {
      const clips = await follet.clipList();
      if (clips[0]) { q += `\n\n---\nTexte copié :\n${clips[0].text}`; display += `\n📋 + texte copié`; }
      this.attach = false; $('.clip-attach', this.el).classList.remove('selected');
    }
    this.add('user', esc(display));
    this.messages.push({ role: 'user', content: q });
    this.text = ''; this.t0 = Date.now(); this.ai = this.add('ai', ''); this.ai.classList.add('typing');
    this.setBusy(true);
    if (!(await follet.aiAsk(this.messages))) { this.setBusy(false); }
  },
  finish() {
    this.setBusy(false); this.paint();
    if (this.text) {
      this.messages.push({ role: 'assistant', content: this.text }); I.flashMood('happy', 1800);
      const meta = document.createElement('div'); meta.className = 'msg-meta';
      meta.textContent = `${((Date.now() - this.t0) / 1000).toFixed(1)} s${this.info && this.info.model ? ' · ' + this.info.model : ''}`;
      this.ai.after(meta);
    } else if (this.ai) { this.ai.closest('.msg-row').remove(); this.messages.pop(); }
    this.ai = null;
    this.loadUsage();
  },
});

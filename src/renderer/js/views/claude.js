/* Claude : questions rapides via Claude Code (abonnement, pas d'API payante) + consommation du jour. */
I.view('claude', {
  label: 'Claude', icon: 'auto_awesome',
  html: `<div class="grid v-claude">
    <div class="card chat">
      <div class="scroll chat-log"><div class="empty">${ms('auto_awesome')}<span class="title-s">Demande à Claude</span>Passe par Claude Code et ton abonnement, sans API payante.</div></div>
      <div class="chat-input">
        <button class="icon-btn state chat-new" title="Nouvelle conversation">${ms('add_comment')}</button>
        <textarea rows="1" placeholder="Écris ta question… (Entrée pour envoyer)"></textarea>
        <button class="icon-btn filled state chat-send" title="Envoyer">${ms('arrow_upward')}</button>
      </div>
    </div>
    <div class="card usage"></div>
  </div>`,

  init(el) {
    this.el = el; this.cont = false; this.busy = false;
    const ta = $('textarea', el);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } });
    $('.chat-send', el).addEventListener('click', () => (this.busy ? island.claudeStop() : this.send()));
    $('.chat-new', el).addEventListener('click', () => {
      if (this.busy) return;
      this.cont = false;
      $('.chat-log', el).innerHTML = `<div class="empty">${ms('auto_awesome')}Nouvelle conversation</div>`;
      ta.focus();
    });
    island.onClaude(({ type, data }) => {
      if (type === 'delta') { this.text += data; this.queue(); }
      else if (type === 'result') { if (data.text && !this.text) this.text = data.text; if (data.error) this.add('err', esc(data.text || 'Erreur')); this.cont = true; }
      else if (type === 'error') this.add('err', esc(data));
      else if (type === 'done') { this.setBusy(false); this.paint(); if (!this.text && this.ai) this.ai.remove(); this.loadUsage(); }
    });
  },
  show() { this.loadUsage(); setTimeout(() => $('textarea', this.el).focus(), 60); clearInterval(this.t); this.t = setInterval(() => this.loadUsage(), 30000); },
  hide() { clearInterval(this.t); },

  setBusy(b) {
    this.busy = b;
    $('.chat-send .ms', this.el).textContent = b ? 'stop' : 'arrow_upward';
    $('.chat-send', this.el).title = b ? 'Arrêter' : 'Envoyer';
  },
  add(cls, html) {
    const log = $('.chat-log', this.el); $('.empty', log)?.remove();
    const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; log.appendChild(d);
    log.scrollTop = log.scrollHeight; return d;
  },
  queue() { if (!this.queued) { this.queued = true; requestAnimationFrame(() => this.paint()); } },
  paint() {
    this.queued = false; if (!this.ai) return;
    this.ai.innerHTML = md(this.text); this.ai.classList.toggle('typing', this.busy);
    const log = $('.chat-log', this.el); log.scrollTop = log.scrollHeight;
  },
  async send() {
    const ta = $('textarea', this.el), q = ta.value.trim();
    if (!q || this.busy) return;
    ta.value = ''; ta.style.height = 'auto';
    this.add('user', esc(q));
    this.text = ''; this.ai = this.add('ai typing', '');
    this.setBusy(true);
    if (!(await island.claudeAsk(q, this.cont))) this.setBusy(false);
  },

  async loadUsage() {
    const u = await island.claudeUsage().catch(() => null), el = $('.usage', this.el);
    if (!u) { el.innerHTML = `<div class="empty">${ms('data_usage')}Journaux introuvables</div>`; return; }
    const max = Math.max(1, ...u.days.map((d) => d.out));
    const reset = u.windowStart ? new Date(u.windowStart + 5 * 3600e3) : null;
    const models = Object.entries(u.models).sort((a, b) => b[1].out - a[1].out).slice(0, 3)
      .map(([m, v]) => `<div class="kv"><span>${esc(m.replace(/^claude-/, ''))}</span><b>${fmtTok(v.out)}</b></div>`).join('');
    el.innerHTML = `<div class="card-title"><span>Claude Code · aujourd'hui</span>${ms('data_usage')}</div>
      <div class="u-big">${fmtTok(u.today.out)}<small>jetons générés</small></div>
      <div>
        <div class="kv"><span>Requêtes</span><b>${u.today.n}</b></div>
        <div class="kv"><span>Sessions</span><b>${u.sessionsToday}</b></div>
        <div class="kv"><span>Contexte relu</span><b>${fmtTok(u.today.cr)}</b></div>
        <div class="kv"><span>Fenêtre de 5 h</span><b>${fmtTok(u.last5h.out)}</b></div>
        ${reset ? `<div class="kv"><span>Fin estimée</span><b>${hhmm(reset)}</b></div>` : ''}
      </div>
      ${models ? `<div><div class="card-title" style="margin:4px 0 2px"><span>Modèles</span></div>${models}</div>` : ''}
      <div class="u-bars">${u.days.map((d, i) => `<div class="${i === 6 ? 'today' : ''}" title="${fmtTok(d.out)} jetons"><i style="height:${Math.max(4, (100 * d.out) / max)}%"></i><span>${new Date(d.day).toLocaleDateString('fr-CA', { weekday: 'narrow' })}</span></div>`).join('')}</div>`;
  },
});

/* Aujourd'hui : horloge, meteo, agenda de la semaine, minuteur, taches. */
I.view('today', {
  label: "Aujourd'hui", icon: 'today',
  html: `<div class="grid v-today">
    <div class="col">
      <div style="padding:4px 8px 0"><div class="date-big"></div><div class="clock-big"></div></div>
      <div class="card weather"><div class="empty">${ms('cloud')}Chargement…</div></div>
    </div>
    <div class="card agenda">
      <div class="card-title">
        <div class="ag-tabs"><button class="ag-tab on state" data-p="agenda">Agenda</button><button class="ag-tab state" data-p="notifs">Notifications<span class="badge notif-count"></span></button></div>
        <button class="icon-btn xs state cal-refresh" title="Actualiser">${ms('refresh')}</button>
        <button class="btn text sm state notif-clear" title="Les retire aussi du centre de notifications de Windows" style="display:none">Tout effacer</button>
      </div>
      <div class="scroll agenda-list" style="flex:1"></div>
      <div class="scroll notif-list" style="flex:1;display:none"></div>
    </div>
    <div class="col">
      <div class="card timer-card">
        <div class="ag-tabs t-tabs"><button class="ag-tab on state" data-tp="timer">Minuteur</button><button class="ag-tab state" data-tp="sw">Chrono</button></div>
        <div class="timer-ring"></div>
        <div class="timer-list"></div>
        <div class="timer-presets"></div>
        <div class="timer-actions" style="display:flex;gap:8px"></div>
      </div>
      <div class="card todo-card">
        <div class="card-title"><span>À faire</span><span class="badge todo-count"></span></div>
        <div class="scroll todo-list" style="flex:1"></div>
        <div class="add-row"><input class="field todo-input" placeholder="Ajouter une tâche…"></div>
      </div>
    </div>
  </div>`,

  init(el) {
    this.el = el;
    this.g = gauge(120, 10);
    $('.timer-ring', el).innerHTML = this.g.html('<span class="t-val"></span>');
    $('.timer-presets', el).innerHTML = [5, 10, 25, 45].map((m) => `<button class="chip sm assist state" data-min="${m}">${m} min</button>`).join('')
      + `<button class="chip sm assist state" data-pomo title="25 min de travail, 5 min de pause, enchaînés">${ms('target', 's18')}Pomodoro</button>`;
    this.tp = 'timer';
    $('.t-tabs', el).addEventListener('click', (e) => { const b = e.target.closest('[data-tp]'); if (b) { this.tp = b.dataset.tp; this.adding = false; this.renderTimer(); } });
    $('.timer-presets', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-min]');
      if (b) this.sel = I.addTimer(+b.dataset.min * 60).id;
      if (e.target.closest('[data-pomo]')) { const p = I.timers.find((x) => x.pomo); this.sel = (p || I.addTimer(1500, { pomo: { phase: 'work', n: 1 } })).id; }
      this.adding = false; this.renderTimer();
    });
    $('.timer-list', el).addEventListener('click', (e) => { const b = e.target.closest('[data-tid]'); if (b) { this.sel = +b.dataset.tid; this.renderTimer(); } });
    $('.timer-actions', el).addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      const sw = I.stopwatch;
      if (a === 'sw-start') sw.start = Date.now();
      if (a === 'sw-pause') { sw.acc = I.swElapsed(); sw.start = null; }
      if (a === 'sw-lap') sw.laps = [I.swElapsed(), ...sw.laps].slice(0, 20);
      if (a === 'sw-reset') I.stopwatch = { acc: 0, start: null, laps: [] };
      if (a === 'add') this.adding = !this.adding;
      const t = this.selected();
      if (t) {
        if (a === 'pause') Object.assign(t, { left: I.timerLeft(t), paused: true });
        if (a === 'resume') { t.end = Date.now() + t.left * 1000; delete t.paused; delete t.left; }
        if (a === 'stop') I.timers = I.timers.filter((x) => x !== t);
        if (a === 'plus') { if (t.paused) t.left += 60; else t.end += 60000; t.total += 60; }
      }
      I.saveTimer(); I.tickTimer(); this.renderTimer();
    });
    // le chrono affiche les dixiemes : rafraichi plus souvent quand il est visible
    setInterval(() => { if (this.tp === 'sw' && I.stopwatch.start && I.mode === 'expanded' && I.tab === 'today') $('.t-val', el).firstChild.textContent = I.fmtSw(I.swElapsed()); }, 100);
    I.on('timer', () => { if (I.mode === 'expanded' && I.tab === 'today') this.renderTimer(); });
    I.on('tick', (now) => { if (I.mode === 'expanded' && I.tab === 'today') this.renderClock(now); });

    $('.cal-refresh', el).addEventListener('click', () => this.loadCalendar(true));
    $('.weather', el).addEventListener('click', () => I.showTab('weather'));
    // historique des notifications : ce qui reste dans le centre de notifications de Windows
    $('.ag-tabs', el).addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) this.setPane(b.dataset.p); });
    $('.notif-list', el).addEventListener('click', (e) => { const x = e.target.closest('.n-del'); if (x) follet.notifRemove(+x.dataset.id); });
    $('.notif-clear', el).addEventListener('click', () => (this.notifs || []).forEach((n) => follet.notifRemove(n.id)));
    follet.onNotifs((list) => { this.notifs = list; this.renderNotifs(); });
    follet.notifs().then((r) => { this.notifs = r.list; this.access = r.access; this.renderNotifs(); }).catch(() => { });
    $('.agenda-list', el).addEventListener('click', (e) => { if (e.target.closest('.add-cal')) { I.showTab('settings'); I.views.settings.open('agenda'); } });
    $('.todo-list', el).addEventListener('click', (e) => {
      const it = e.target.closest('.todo'); if (!it) return;
      const i = +it.dataset.i;
      if (e.target.closest('.del')) this.todos.splice(i, 1);
      else if (e.target.closest('.check') || e.target.closest('.txt')) this.todos[i].done = !this.todos[i].done;
      else return;
      follet.todosSave(this.todos); this.renderTodos();
    });
    $('.todo-input', el).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) { this.todos.push({ text: e.target.value.trim(), done: false }); e.target.value = ''; follet.todosSave(this.todos); this.renderTodos(); }
    });
    follet.todos().then((t) => { this.todos = t || []; this.renderTodos(); });

    // meteo et agenda servent aussi a l'apercu de l'encoche : on charge tout de suite, puis toutes les 15 min
    const refresh = () => { this.loadWeather(); this.loadCalendar(); };
    // rappels : quelques minutes avant chaque evenement, puis a son debut
    this.reminded = new Set();
    setInterval(() => this.checkReminders(), 20000);
    refresh(); setInterval(refresh, 15 * 60e3);
  },

  // "Pluie dans 30 min" : une fois par averse, quand rien ne tombe encore
  async rainAlert(w) {
    const s = I.views.weather.soon(w);
    if (!s || s.none || s.now) { if (s && s.none) this.rainSaid = null; return; }
    const { config } = await follet.configGet();
    if (config.activities.rain === false || s.mins > 60 || this.rainSaid) return;
    this.rainSaid = Date.now();
    I.activity({ kind: 'rain', mins: s.mins, snow: s.snow, text: I.views.weather.soonText(s) });
  },
  async checkReminders() {
    if (!this.events) return;
    const lead = (await follet.configGet()).config.activities.reminder ?? 10;
    if (!lead) return;
    const now = Date.now();
    for (const ev of this.events) {
      if (ev.allDay) continue;
      const s = new Date(ev.start).getTime(), left = s - now;
      for (const [tag, due] of [['soon', left <= lead * 60e3 && left > 60e3], ['now', left <= 60e3 && left > -2 * 60e3]]) {
        const id = `${tag}|${ev.start}|${ev.title}`;
        if (!due || this.reminded.has(id)) continue;
        this.reminded.add(id);
        I.activity({ kind: 'event', title: ev.title, location: ev.location, color: ev.color, mins: tag === 'soon' ? Math.round(left / 60e3) : 0 });
      }
    }
  },
  setPane(p) {
    this.pane = p;
    $$('.ag-tab', this.el).forEach((b) => b.classList.toggle('on', b.dataset.p === p));
    $('.agenda-list', this.el).style.display = p === 'agenda' ? '' : 'none';
    $('.notif-list', this.el).style.display = p === 'notifs' ? '' : 'none';
    $('.cal-refresh', this.el).style.display = p === 'agenda' ? '' : 'none';
    this.renderNotifs();
  },
  renderNotifs() {
    const list = this.notifs || [], el = this.el;
    $('.notif-count', el).textContent = list.length || '';
    $('.notif-clear', el).style.display = this.pane === 'notifs' && list.length ? '' : 'none';
    if (this.pane !== 'notifs') return;
    $('.notif-list', el).innerHTML = !list.length
      ? `<div class="empty">${ms('notifications_off')}${this.access && this.access !== 'Allowed' ? "Follet n'a pas accès aux notifications" : 'Aucune notification'}</div>`
      : list.map((n) => `<div class="notif-item">
          ${n.logo ? `<img class="n-ico" src="${n.logo}">` : `<div class="n-ico">${ms('notifications', 's18')}</div>`}
          <div class="n-txt"><div class="n-head"><span class="ellipsis">${esc(n.app || '')}</span><span>${hhmm(new Date(n.time))}</span></div>
            <div class="title-s ellipsis" data-noi18n>${esc(n.title || '')}</div><div class="body-s variant n-body" data-noi18n>${esc(n.body || '')}</div></div>
          <button class="icon-btn xs state n-del" data-id="${n.id}" title="Effacer">${ms('close')}</button></div>`).join('');
  },
  show() { this.renderClock(new Date()); this.renderTimer(); this.loadWeather(); this.loadCalendar(); },

  renderClock(now) {
    $('.clock-big', this.el).innerHTML = `${hhmm(now)}<small>${pad(now.getSeconds())}</small>`;
    $('.date-big', this.el).textContent = dayName(now, { weekday: 'long', day: 'numeric', month: 'long' });
  },

  selected() { return I.timers.find((x) => x.id === this.sel) || I.nextTimer(); },
  renderTimer() {
    const el = this.el;
    $$('.t-tabs .ag-tab', el).forEach((b) => b.classList.toggle('on', b.dataset.tp === this.tp));
    const ring = $('.timer-ring .gauge', el), val = $('.t-val', el), list = $('.timer-list', el), acts = $('.timer-actions', el);
    if (this.tp === 'sw') {
      const sw = I.stopwatch, e = I.swElapsed(), running = !!sw.start;
      val.innerHTML = `<span>${I.fmtSw(e)}</span>`;
      this.g.set(ring, ((e % 60) / 60) * 100);
      $('.timer-presets', el).style.display = 'none';
      // duree de chaque tour (les temps sont gardes cumules)
      list.innerHTML = sw.laps.slice(0, 2).map((l, i) => `<span class="chip sm">${I.lang === 'en' ? 'Lap' : 'Tour'} ${sw.laps.length - i} · ${I.fmtSw(l - (sw.laps[i + 1] || 0))}</span>`).join('');
      acts.innerHTML = `<button class="btn tonal sm state" data-a="${running ? 'sw-pause' : 'sw-start'}">${ms(running ? 'pause' : 'play_arrow')}${running ? 'Pause' : e ? 'Reprendre' : 'Démarrer'}</button>`
        + (running ? `<button class="icon-btn sm tonal state" data-a="sw-lap" title="Tour">${ms('flag')}</button>` : '')
        + (e ? `<button class="icon-btn sm state" data-a="sw-reset" title="Réinitialiser">${ms('restart_alt')}</button>` : '');
      return;
    }
    const t = this.selected(), left = I.timerLeft(t);
    if (t) this.sel = t.id;
    val.innerHTML = `<span>${t ? fmtDur(Math.ceil(left)) : '0:00'}</span>` + (t && t.pomo ? `<small class="t-pomo">${I.pomoLabel(t.pomo)}</small>` : '');
    this.g.set(ring, t ? (100 * left) / t.total : 0);
    $('.timer-presets', el).style.display = !t || this.adding ? '' : 'none';
    list.innerHTML = I.timers.length > 1 ? I.timers.map((x) => `<button class="chip sm state ${x === t ? 'selected' : ''}" data-tid="${x.id}">${ms(x.paused ? 'pause' : x.pomo ? 'target' : 'timer', 's18')}${fmtDur(Math.ceil(I.timerLeft(x)))}</button>`).join('') : '';
    acts.innerHTML = !t ? "<span class='body-s variant'>Un minuteur s'affiche dans l'encoche</span>"
      : `<button class="btn tonal sm state" data-a="${t.paused ? 'resume' : 'pause'}">${ms(t.paused ? 'play_arrow' : 'pause')}${t.paused ? 'Reprendre' : 'Pause'}</button>
         <button class="icon-btn sm tonal state" data-a="plus" title="+1 min">${ms('add')}</button>
         <button class="icon-btn sm state" data-a="stop" title="Arrêter">${ms('stop')}</button>
         <button class="icon-btn sm state ${this.adding ? 'selected' : ''}" data-a="add" title="Autre minuteur">${ms('more_time')}</button>`;
  },


  renderTodos() {
    const el = this.el, todos = this.todos || [];
    $('.todo-count', el).textContent = `${todos.filter((t) => t.done).length}/${todos.length}`;
    $('.todo-list', el).innerHTML = todos.length ? todos.map((t, i) => `<div class="todo ${t.done ? 'done' : ''}" data-i="${i}">
      <input type="checkbox" class="check" ${t.done ? 'checked' : ''}><span class="txt">${esc(t.text)}</span>
      <button class="icon-btn xs state del" title="Supprimer">${ms('close')}</button></div>`).join('')
      : `<div class="empty">${ms('task_alt')}Rien à faire</div>`;
  },

  async loadWeather() {
    const w = await follet.weather().catch(() => null);
    const el = $('.weather', this.el);
    if (!w || !w.current) { el.innerHTML = `<div class="empty">${ms('cloud_off')}Météo indisponible<br><span class="body-s">Vérifie la connexion ou règle une ville dans Réglages → Météo</span></div>`; return; }
    const c = w.current;
    I.weatherNow = { temp: Math.round(c.temperature_2m), icon: weatherIcon(c.weather_code, c.is_day), city: w.city };
    const nowH = new Date().getHours();
    const hours = (w.hourly?.time || []).slice(0, 12).map((t, i) => {
      const d = new Date(t);
      return `<div class="w-hour"><span>${d.getHours() === nowH ? 'Maint.' : d.getHours() + 'h'}</span>${ms(weatherIcon(w.hourly.weather_code[i], d.getHours() >= 7 && d.getHours() < 19 ? 1 : 0), 'fill')}<span>${Math.round(w.hourly.temperature_2m[i])}°</span></div>`;
    }).join('');
    const lo = Math.min(...w.daily.temperature_2m_min.slice(0, 4)), hi = Math.max(...w.daily.temperature_2m_max.slice(0, 4));
    const days = w.daily.time.slice(0, 4).map((d, k) => {
      const mn = w.daily.temperature_2m_min[k], mx = w.daily.temperature_2m_max[k];
      const l = ((mn - lo) / (hi - lo || 1)) * 100, r = ((mx - lo) / (hi - lo || 1)) * 100;
      return `<div class="w-day"><span>${k === 0 ? 'Auj.' : new Date(d + 'T12:00').toLocaleDateString(I.locale, { weekday: 'short' })}</span>${ms(weatherIcon(w.daily.weather_code[k]), 'fill')}
        <div class="rng"><i style="left:${l}%;right:${100 - r}%"></i></div><span>${Math.round(mn)}° / ${Math.round(mx)}°</span></div>`;
    }).join('');
    el.innerHTML = `<div class="card-title"><span>${w.source === 'ip' ? ms('near_me', 'fill') : ms('location_on', 'fill')} ${esc(w.city || 'Météo')}</span><span>${c.relative_humidity_2m ?? ''}${c.relative_humidity_2m != null ? ' %' : ''} ${ms('water_drop')}</span></div>
      <div class="w-now">${ms(weatherIcon(c.weather_code, c.is_day), 'fill')}<span class="w-temp">${Math.round(c.temperature_2m)}°</span></div>
      <div class="w-desc">${weatherLabel(c.weather_code)} · ressenti ${Math.round(c.apparent_temperature)}° · vent ${Math.round(c.wind_speed_10m)} km/h</div>
      <div class="w-hours">${hours}</div>
      <div class="w-days">${days}</div>`;
    this.updatePeek();
    this.rainAlert(w);
  },

  async loadCalendar(force) {
    const el = $('.agenda-list', this.el);
    const cal = await follet.calendar(force).catch((e) => ({ configured: true, events: [], errors: [e.message] }));
    this.events = cal.events || [];
    if (!cal.configured) {
      el.innerHTML = `<div class="empty">${ms('calendar_month')}Aucun agenda configuré<br><button class="btn tonal sm state add-cal" style="margin-top:8px">${ms('add')}Ajouter un agenda</button></div>`;
      this.updatePeek(); return;
    }
    const now = new Date(), today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const byDay = new Map();
    for (const ev of this.events) {
      const s = new Date(ev.start), e = new Date(ev.end);
      for (let d = new Date(Math.max(s, today0)); d < e || +d === +s; d.setDate(d.getDate() + 1)) {
        const k = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        if (k - today0 >= 7 * 864e5) break;
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(ev);
        if (!ev.allDay || (+d === +s && e - s <= 864e5)) break;
      }
    }
    el.innerHTML = !byDay.size ? `<div class="empty">${ms('event_available')}Rien de prévu cette semaine${cal.errors?.length ? `<span class="body-s">${esc(cal.errors[0])}</span>` : ''}</div>`
      : [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([k, evs]) => {
        const diff = Math.round((k - today0) / 864e5);
        const label = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : dayName(new Date(k), { weekday: 'long', day: 'numeric', month: 'short' });
        return `<div class="day-h ${diff === 0 ? 'today' : ''}">${label}</div>` + evs.map((ev) => {
          const s = new Date(ev.start), e = new Date(ev.end);
          const cls = !ev.allDay && e < now ? 'past' : !ev.allDay && s <= now && e > now ? 'now' : '';
          return `<div class="ev ${cls}"><div class="bar" ${ev.color ? `style="background:${esc(ev.color)}"` : ''}></div><div class="t">${ev.allDay ? 'Jour' : hhmm(s)}</div>
            <div class="ellipsis"><div class="n ellipsis">${esc(ev.title)}</div>${ev.location ? `<div class="l ellipsis">${esc(ev.location)}</div>` : ''}</div></div>`;
        }).join('');
      }).join('');
    this.updatePeek();
  },

  // Ligne d'apercu de l'encoche quand rien ne joue : prochain evenement ou meteo
  updatePeek() {
    const now = new Date();
    const next = (this.events || []).find((e) => !e.allDay && new Date(e.end) > now && new Date(e.start) - now < 18 * 3600e3);
    I.nextEvent = next ? `${hhmm(new Date(next.start))} ${next.title}` : null;
    const w = I.weatherNow;
    I.peekLine = [I.nextEvent, w ? `${w.temp}° ${w.city || ''}`.trim() : null].filter(Boolean).join(' · ') || null;
    I.peekIcon = w ? w.icon : null;
    I.renderCompact();
    I.views.home.el && I.views.home.renderStatus();
  },
});

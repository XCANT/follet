/* Aujourd'hui : horloge, meteo, agenda de la semaine, minuteur, taches. */
I.view('today', {
  label: "Aujourd'hui", icon: 'today',
  html: `<div class="grid v-today">
    <div class="col">
      <div style="padding:4px 8px 0"><div class="date-big"></div><div class="clock-big"></div></div>
      <div class="card weather"><div class="empty">${ms('cloud')}Chargement…</div></div>
    </div>
    <div class="card agenda">
      <div class="card-title"><span>Agenda</span><button class="icon-btn xs state cal-refresh" title="Actualiser">${ms('refresh')}</button></div>
      <div class="scroll agenda-list" style="flex:1"></div>
    </div>
    <div class="col">
      <div class="card timer-card">
        <div class="timer-ring"></div>
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
    $('.timer-presets', el).innerHTML = [1, 5, 10, 25, 45].map((m) => `<button class="chip sm assist state" data-min="${m}">${m} min</button>`).join('');
    $('.timer-presets', el).addEventListener('click', (e) => { const b = e.target.closest('[data-min]'); if (b) this.startTimer(+b.dataset.min * 60); });
    $('.timer-actions', el).addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; const t = I.timer; if (!a || !t) return;
      if (a === 'pause') I.timer = { left: I.timerLeft(), total: t.total, paused: true };
      if (a === 'resume') I.timer = { end: Date.now() + t.left * 1000, total: t.total };
      if (a === 'stop') I.timer = null;
      if (a === 'plus') I.timer = t.paused ? { ...t, left: t.left + 60, total: t.total + 60 } : { ...t, end: t.end + 60000, total: t.total + 60 };
      I.saveTimer(); this.renderTimer();
    });
    I.on('timer', () => { if (I.mode === 'expanded' && I.tab === 'today') this.renderTimer(); });
    I.on('tick', (now) => { if (I.mode === 'expanded' && I.tab === 'today') this.renderClock(now); });

    $('.cal-refresh', el).addEventListener('click', () => this.loadCalendar(true));
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
    refresh(); setInterval(refresh, 15 * 60e3);
  },

  show() { this.renderClock(new Date()); this.renderTimer(); this.loadWeather(); this.loadCalendar(); },

  renderClock(now) {
    $('.clock-big', this.el).innerHTML = `${hhmm(now)}<small>${pad(now.getSeconds())}</small>`;
    $('.date-big', this.el).textContent = dayName(now, { weekday: 'long', day: 'numeric', month: 'long' });
  },

  startTimer(sec) { I.timer = { end: Date.now() + sec * 1000, total: sec }; I.saveTimer(); this.renderTimer(); },
  renderTimer() {
    const t = I.timer, el = this.el;
    const left = I.timerLeft();
    $('.t-val', el).textContent = t ? fmtDur(Math.ceil(left)) : '0:00';
    this.g.set($('.timer-ring .gauge', el), t ? (100 * left) / t.total : 0);
    $('.timer-presets', el).style.display = t ? 'none' : '';
    $('.timer-actions', el).innerHTML = !t ? '<span class="body-s variant">Un minuteur s\'affiche dans l\'encoche</span>'
      : `<button class="btn tonal sm state" data-a="${t.paused ? 'resume' : 'pause'}">${ms(t.paused ? 'play_arrow' : 'pause')}${t.paused ? 'Reprendre' : 'Pause'}</button>
         <button class="icon-btn sm tonal state" data-a="plus" title="+1 min">${ms('add')}</button>
         <button class="icon-btn sm state" data-a="stop" title="Arrêter">${ms('stop')}</button>`;
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

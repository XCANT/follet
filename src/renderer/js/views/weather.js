/* Meteo detaillee : s'ouvre depuis la carte meteo d'Aujourd'hui. Conditions actuelles, 24 heures en
   graphique (temperature et risque de pluie), 7 jours, vent, UV, qualite de l'air, soleil. */
const T = (fr, en) => (I.lang === 'en' ? en : fr);
I.view('weather', {
  label: 'Météo', icon: 'partly_cloudy_day', nav: false,
  html: `<div class="grid v-weather">
    <div class="col">
      <div class="card w-hero"></div>
      <div class="w-tiles"></div>
    </div>
    <div class="col">
      <div class="card w-chart"><div class="card-title"><span>24 heures</span><span class="w-legend">${ms('water_drop', 'fill')} risque de pluie</span></div><div class="w-svg"></div></div>
      <div class="card w-week"><div class="card-title"><span>7 jours</span></div><div class="w-week-list"></div></div>
    </div>
  </div>`,

  init(el) {
    this.el = el;
    el.addEventListener('click', (e) => { if (e.target.closest('.w-back')) I.showTab('today'); });
  },
  async show() {
    this.w = await follet.weather().catch(() => null);
    this.render();
  },

  // degrade du ciel selon la meteo et l'heure
  sky(code, day) {
    if (code >= 95) return ['#3b2a5c', '#6b4a8a'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return day ? ['#7d97b3', '#c9d6e3'] : ['#2c3a4f', '#5a6b82'];
    if (code >= 51) return day ? ['#4a6382', '#7f97b0'] : ['#1f2c3d', '#3d5068'];
    if (code === 3 || code === 45 || code === 48) return day ? ['#6c7f93', '#a3b2c2'] : ['#26303c', '#4a5563'];
    return day ? ['#2f7bd6', '#7cc0f2'] : ['#141d3d', '#3a3f7a'];
  },

  // pluie ou neige dans les 2 prochaines heures (pas de 15 min)
  soon(w) {
    const m = w.minutely_15; if (!m || !m.time) return null;
    const now = Date.now(), wet = (i) => (m.precipitation[i] || 0) >= 0.1 || (m.snowfall?.[i] || 0) > 0;
    const idx = m.time.map((t, i) => [new Date(t).getTime(), i]).filter(([t]) => t + 15 * 60e3 > now);
    if (!idx.length) return null;
    const snow = (i) => (m.snowfall?.[i] || 0) > 0;
    if (wet(idx[0][1])) {
      const stop = idx.find(([, i]) => !wet(i));
      return { now: true, snow: snow(idx[0][1]), stop: stop ? new Date(stop[0]) : null };
    }
    const start = idx.find(([, i]) => wet(i));
    return start ? { now: false, snow: snow(start[1]), mins: Math.max(5, Math.round((start[0] - now) / 60e3)) } : { none: true };
  },
  soonText(s) {
    if (!s) return '';
    const en = I.lang === 'en';
    if (s.none) return en ? 'No rain in the next 2 hours' : 'Pas de pluie dans les 2 prochaines heures';
    const what = s.snow ? (en ? 'Snow' : 'Neige') : (en ? 'Rain' : 'Pluie');
    if (s.now) return s.stop ? (en ? `${what} until about ${hhmm(s.stop)}` : `${what} jusque vers ${hhmm(s.stop)}`) : (en ? `${what} for the next 2 hours` : `${what} pour les 2 prochaines heures`);
    return en ? `${what} in about ${s.mins} min` : `${what} dans environ ${s.mins} min`;
  },

  render() {
    const w = this.w, el = this.el;
    if (!w || !w.current) {
      $('.w-hero', el).innerHTML = `<button class="icon-btn sm state w-back" title="Retour">${ms('arrow_back')}</button><div class="empty">${ms('cloud_off')}Météo indisponible</div>`;
      return;
    }
    const c = w.current, d = w.daily, day = c.is_day;
    const [a, b] = this.sky(c.weather_code, day);
    const hero = $('.w-hero', el), soon = this.soon(w);
    hero.style.background = `linear-gradient(160deg, ${a}, ${b})`;
    hero.innerHTML = `<div class="w-top"><button class="icon-btn sm state w-back" title="Retour">${ms('arrow_back')}</button><span class="w-city">${ms(w.source === 'ip' ? 'near_me' : 'location_on', 'fill')} ${esc(w.city || '')}</span></div>
      <div class="w-big">${ms(weatherIcon(c.weather_code, day), 'fill')}<span>${Math.round(c.temperature_2m)}°</span></div>
      <div class="w-cond">${weatherLabel(c.weather_code)}</div>
      <div class="w-hl" data-noi18n>${T('Max.', 'High')} ${Math.round(d.temperature_2m_max[0])}° · ${T('Min.', 'Low')} ${Math.round(d.temperature_2m_min[0])}° · ${T('Ressenti', 'Feels like')} ${Math.round(c.apparent_temperature)}°</div>
      ${soon ? `<div class="w-soon">${ms(soon.none ? 'check_circle' : 'umbrella', 'fill')}<span data-noi18n>${this.soonText(soon)}</span></div>` : ''}`;

    // tuiles de details
    const uv = c.uv_index ?? 0, uvL = uv < 3 ? T('Faible', 'Low') : uv < 6 ? T('Modéré', 'Moderate') : uv < 8 ? T('Élevé', 'High') : uv < 11 ? T('Très élevé', 'Very high') : T('Extrême', 'Extreme');
    const aqi = w.air && w.air.us_aqi, aqL = aqi == null ? '' : aqi <= 50 ? T('Bon', 'Good') : aqi <= 100 ? T('Moyen', 'Moderate') : aqi <= 150 ? T('Mauvais (sensibles)', 'Unhealthy (sensitive)') : aqi <= 200 ? T('Mauvais', 'Unhealthy') : T('Très mauvais', 'Very unhealthy');
    const dirs = I.lang === 'en' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], dir = dirs[Math.round(((c.wind_direction_10m || 0) % 360) / 45) % 8];
    const tile = (icon, title, val, sub, extra = '') => `<div class="card w-tile" data-noi18n><div class="wt-h">${ms(icon, 'fill')}${title}</div><div class="wt-v">${val}${extra}</div><div class="wt-s">${sub}</div></div>`;
    $('.w-tiles', el).innerHTML = [
      tile('air', T('Vent', 'Wind'), `${Math.round(c.wind_speed_10m)}<small> km/h</small>`, `${dir} · ${T('rafales', 'gusts')} ${Math.round(c.wind_gusts_10m || 0)} km/h`, `<span class="ms wt-arrow" style="transform:rotate(${(c.wind_direction_10m || 0) + 180}deg)">navigation</span>`),
      tile('humidity_percentage', T('Humidité', 'Humidity'), `${c.relative_humidity_2m}<small> %</small>`, `${T('Nuages', 'Clouds')} ${c.cloud_cover ?? 0} %`),
      tile('sunny', T('Indice UV', 'UV index'), `${Math.round(uv)}`, `${uvL} · max. ${Math.round(d.uv_index_max?.[0] ?? uv)}`),
      tile('aq', T("Qualité de l'air", 'Air quality'), aqi == null ? '–' : `${aqi}`, aqi == null ? T('Indisponible', 'Unavailable') : `${aqL} · PM2.5 ${Math.round(w.air.pm2_5 ?? 0)}`),
      tile('wb_twilight', T('Soleil', 'Sun'), `${hhmm(new Date(d.sunrise[0]))}`, `${T('Coucher', 'Sunset')} ${hhmm(new Date(d.sunset[0]))}`),
      tile('compress', T('Pression', 'Pressure'), `${Math.round(c.pressure_msl)}<small> hPa</small>`, `${T('Visibilité', 'Visibility')} ${Math.round((c.visibility ?? 0) / 1000)} km`),
    ].join('');

    this.renderChart();
    // 7 jours
    const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max);
    $('.w-week-list', el).innerHTML = d.time.map((t, k) => {
      const mn = d.temperature_2m_min[k], mx = d.temperature_2m_max[k];
      const l = ((mn - lo) / (hi - lo || 1)) * 100, r = ((mx - lo) / (hi - lo || 1)) * 100;
      const p = d.precipitation_probability_max?.[k];
      return `<div class="w-wd"><span class="wd-n">${k === 0 ? "Aujourd'hui" : new Date(t + 'T12:00').toLocaleDateString(I.locale, { weekday: 'long' })}</span>${ms(weatherIcon(d.weather_code[k]), 'fill')}
        <span class="wd-p">${p >= 20 ? `${ms('water_drop', 'fill')}${p} %` : ''}</span><span class="wd-t lo">${Math.round(mn)}°</span><div class="rng"><i style="left:${l}%;right:${100 - r}%"></i></div><span class="wd-t">${Math.round(mx)}°</span></div>`;
    }).join('');
  },

  // 24 heures : courbe de temperature, barres de risque de pluie, une etiquette toutes les 3 heures
  renderChart() {
    const w = this.w, h = w.hourly, box = $('.w-svg', this.el);
    const now = Date.now();
    const start = Math.max(0, h.time.findIndex((t) => new Date(t).getTime() + 3600e3 > now));
    const n = Math.min(25, h.time.length - start); if (n < 2) return;
    const W = box.clientWidth || 520, H = box.clientHeight || 170, top = 50, bottom = H - 30, pad = 14;
    const temps = h.temperature_2m.slice(start, start + n), lo = Math.min(...temps), hi = Math.max(...temps);
    const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad), y = (t) => top + (1 - (t - lo) / (hi - lo || 1)) * (bottom - top - 26);
    let line = `M${x(0)} ${y(temps[0])}`;
    for (let i = 1; i < n; i++) { const mx = (x(i - 1) + x(i)) / 2; line += ` C${mx} ${y(temps[i - 1])} ${mx} ${y(temps[i])} ${x(i)} ${y(temps[i])}`; }
    const area = `${line} L${x(n - 1)} ${bottom} L${x(0)} ${bottom} Z`;
    let bars = '', labels = '';
    for (let i = 0; i < n; i++) {
      const p = h.precipitation_probability?.[start + i] || 0;
      if (p > 0) bars += `<rect class="wc-bar" x="${x(i) - 4}" y="${bottom - (p / 100) * 40}" width="8" height="${(p / 100) * 40}" rx="3"/>`;
      if (i % 3 === 0) {
        const d = new Date(h.time[start + i]);
        labels += `<text class="wc-t" x="${x(i)}" y="${y(temps[i]) - 10}">${Math.round(temps[i])}°</text>`
          + `<text class="wc-h" x="${x(i)}" y="${H - 8}">${i === 0 ? (I.lang === 'en' ? 'Now' : 'Maint.') : d.getHours() + 'h'}</text>`
          + `<text class="wc-i ms" x="${x(i)}" y="18">${weatherIcon(h.weather_code[start + i], h.is_day?.[start + i] ?? 1)}</text>`
          + (p >= 20 ? `<text class="wc-p" x="${x(i)}" y="${bottom - (p / 100) * 40 - 4}">${p}%</text>` : '');
      }
    }
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="wcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--md-primary)" stop-opacity=".35"/><stop offset="1" stop-color="var(--md-primary)" stop-opacity="0"/></linearGradient></defs>
      ${bars}<path d="${area}" fill="url(#wcg)"/><path class="wc-line" d="${line}"/><circle class="wc-dot" cx="${x(0)}" cy="${y(temps[0])}" r="4"/>${labels}</svg>`;
  },
});

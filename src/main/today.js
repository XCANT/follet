// Aujourd'hui : agenda (iCal), meteo (Open-Meteo, position par IP), taches.
const { ipcMain, Notification } = require('electron');
const core = require('./core');

// ---------- taches ----------
ipcMain.handle('todos', () => core.state.todos);
ipcMain.handle('todos-save', (_e, todos) => { core.state.todos = todos; core.saveState(); return true; });

// ---------- agenda ----------
let calCache = { at: 0, data: null };
core.events.on('config', (c, b) => { if (JSON.stringify(c.calendars) !== JSON.stringify(b.calendars)) calCache.at = 0; });
ipcMain.handle('calendar', async (_e, force) => {
  const cals = (core.config.calendars || []).filter(Boolean);
  if (!cals.length) return { configured: false, events: [] };
  if (!force && calCache.data && Date.now() - calCache.at < 10 * 60e3) return calCache.data;
  const ical = require('node-ical');
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 864e5);
  const events = [], errors = [];
  for (const cal of cals) {
    const url = typeof cal === 'string' ? cal : cal.url;
    const color = typeof cal === 'string' ? null : cal.color;
    try {
      const data = ical.sync.parseICS(await core.fetchText(url.replace(/^webcal:/, 'https:')));
      for (const ev of Object.values(data)) {
        if (ev.type !== 'VEVENT') continue;
        const allDay = ev.datetype === 'date';
        const dur = ev.end ? new Date(ev.end) - new Date(ev.start) : allDay ? 864e5 : 0;
        const push = (s, src = ev) => {
          const e = new Date(s.getTime() + dur);
          if (e > start && s < end) events.push({ title: src.summary || '(sans titre)', start: s.toISOString(), end: e.toISOString(), allDay, location: src.location || '', color });
        };
        if (ev.rrule) {
          const ex = ev.exdate ? Object.values(ev.exdate).map((d) => new Date(d).getTime()) : [];
          for (const o of ev.rrule.between(new Date(start.getTime() - dur), end, true)) {
            const s = allDay ? new Date(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()) : new Date(o);
            if (ex.includes(s.getTime())) continue;
            if (ev.recurrences && ev.recurrences[s.toISOString().slice(0, 10)]) continue;   // instance modifiee, traitee plus bas
            push(s);
          }
          for (const r of Object.values(ev.recurrences || {})) {
            const rs = new Date(r.start), re = r.end ? new Date(r.end) : new Date(rs.getTime() + dur);
            if (re > start && rs < end) events.push({ title: r.summary || ev.summary, start: rs.toISOString(), end: re.toISOString(), allDay: r.datetype === 'date', location: r.location || '', color });
          }
        } else {
          let s = new Date(ev.start);
          if (allDay) s = new Date(s.getFullYear(), s.getMonth(), s.getDate());
          push(s);
        }
      }
    } catch (err) { errors.push(err.message); }
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  calCache = { at: Date.now(), data: { configured: true, events, errors } };
  return calCache.data;
});

// ---------- meteo ----------
let locCache = { at: 0, data: null };
async function locate() {
  const w = core.config.weather || {};
  if (w.mode === 'fixed' && w.lat != null) return { city: w.city, lat: w.lat, lon: w.lon, source: 'config' };
  if (locCache.data && Date.now() - locCache.at < 30 * 60e3) return locCache.data;
  const providers = [
    ['https://ipwho.is/', (j) => j.success !== false && { city: j.city, lat: j.latitude, lon: j.longitude }],
    ['https://get.geojs.io/v1/ip/geo.json', (j) => ({ city: j.city, lat: +j.latitude, lon: +j.longitude })],
  ];
  for (const [url, pick] of providers) {
    try {
      const loc = pick(await core.fetchJson(url));
      if (loc && isFinite(loc.lat) && isFinite(loc.lon)) { locCache = { at: Date.now(), data: { ...loc, source: 'ip' } }; return locCache.data; }
    } catch { }
  }
  if (w.fallback && w.fallback.lat != null) return { ...w.fallback, source: 'fallback' };
  return null;
}
let weatherCache = { at: 0, key: '', data: null };
core.events.on('config', (c, b) => { if (JSON.stringify(c.weather) !== JSON.stringify(b.weather)) { weatherCache.at = 0; locCache.at = 0; } });
ipcMain.handle('weather', async () => {
  const loc = await locate(); if (!loc) return null;
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  // 14 min : la pluie a 15 min (minutely_15) reste fraiche pour l'alerte "pluie bientot"
  if (weatherCache.data && weatherCache.key === key && Date.now() - weatherCache.at < 14 * 60e3) return weatherCache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,uv_index,pressure_msl,precipitation,cloud_cover,visibility'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,is_day&forecast_hours=25'
    + '&minutely_15=precipitation,snowfall&forecast_minutely_15=8'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset&timezone=auto&forecast_days=7';
  const air = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}&current=us_aqi,pm2_5&timezone=auto`;
  try {
    const [w, a] = await Promise.all([core.fetchJson(url), core.fetchJson(air).catch(() => null)]);
    weatherCache = { at: Date.now(), key, data: { city: loc.city, source: loc.source, ...w, air: a && a.current } };
  } catch { }
  return weatherCache.data;
});
// Recherche de ville (reglages) via le geocodage d'Open-Meteo
ipcMain.handle('geocode', async (_e, q) => {
  if (!q || q.length < 2) return [];
  const j = await core.fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr`);
  return (j.results || []).map((r) => ({ city: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
});

// ---------- notifications systeme (minuteur fini, etc.) ----------
ipcMain.handle('notify', (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: false }).show(); return true; });

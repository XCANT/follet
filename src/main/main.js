// Island : encoche facon "Dynamic Island" en haut de l'ecran.
const { app, BrowserWindow, ipcMain, screen, clipboard, shell, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

const ROOT = __dirname;                                   // src/main
const RENDERER = path.join(ROOT, '..', 'renderer');
const APP_DIR = path.join(ROOT, '..', '..');
// Tout ce qui est personnel (config, to-do, conversations Claude) vit dans %APPDATA%\Island,
// jamais dans le dossier du code : rien de perso ne peut finir dans git.
const DATA = app.getPath('userData');
const CONFIG_PATH = path.join(DATA, 'config.json');
const STATE_PATH = path.join(DATA, 'state.json');
const WIN_W = 860, WIN_H = 560;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ---------- config / etat ----------
function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(CONFIG_PATH)) fs.copyFileSync(path.join(APP_DIR, 'config.example.json'), CONFIG_PATH);
let config = readJson(CONFIG_PATH, {});
let state = readJson(STATE_PATH, { todos: [], favorites: [] });
function saveState() { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); }

// ---------- helper PowerShell persistant ----------
let helper, helperBuf = '', helperSeq = 0;
const helperWaiting = new Map();
function startHelper() {
  helper = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'helper.ps1')], { windowsHide: true });
  helper.stdout.setEncoding('utf8');
  helper.stdout.on('data', (chunk) => {
    helperBuf += chunk;
    let i;
    while ((i = helperBuf.indexOf('\n')) >= 0) {
      const line = helperBuf.slice(0, i).trim(); helperBuf = helperBuf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const w = helperWaiting.get(msg.id);
        if (w) { helperWaiting.delete(msg.id); msg.ok ? w.resolve(msg.data) : w.reject(new Error(msg.error)); }
      } catch { /* ligne non JSON : on ignore */ }
    }
  });
  helper.on('exit', () => {
    for (const w of helperWaiting.values()) w.reject(new Error('helper arrete'));
    helperWaiting.clear();
    if (!app.isQuitting) setTimeout(startHelper, 2000);
  });
}
function callHelper(op, arg) {
  return new Promise((resolve, reject) => {
    const id = ++helperSeq;
    helperWaiting.set(id, { resolve, reject });
    helper.stdin.write(JSON.stringify({ id, op, arg }) + '\n');
    setTimeout(() => { if (helperWaiting.delete(id)) reject(new Error('timeout')); }, 8000);
  });
}

// ---------- fenetre ----------
let win, tray;
function targetDisplay() {
  const all = screen.getAllDisplays();
  const want = config.display;   // "primary" ou "1920x1080"
  if (want && want !== 'primary') {
    const d = all.find(d => `${d.size.width}x${d.size.height}` === want);
    if (d) return d;
  }
  return screen.getPrimaryDisplay();
}
function placeWindow() {
  const b = targetDisplay().bounds;
  win.setBounds({ x: Math.round(b.x + (b.width - WIN_W) / 2), y: b.y, width: WIN_W, height: WIN_H });
}
function createWindow() {
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  placeWindow();
  win.loadFile(path.join(RENDERER, 'index.html'), process.env.ISLAND_DEMO ? { query: { demo: process.env.ISLAND_DEMO } } : undefined);
  if (process.env.ISLAND_EVAL) setTimeout(async () => {
    try { console.log('[eval]', JSON.stringify(await win.webContents.executeJavaScript(process.env.ISLAND_EVAL))); } catch (e) { console.log('[eval error]', e.message); }
  }, +(process.env.ISLAND_EVAL_DELAY || 8000));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.once('ready-to-show', () => win.showInactive());
  screen.on('display-metrics-changed', placeWindow);
  screen.on('display-added', placeWindow);
  screen.on('display-removed', placeWindow);
}

ipcMain.on('capture-mouse', (_e, on) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!on, { forward: true });
});
// Fenetre maximisee devant : l'encoche se range au-dessus de l'ecran, et ressort
// quand la souris touche le haut de l'ecran au milieu.
let coveredByMax = false, revealed = false, tucked = false;
function applyTuck() {
  const want = coveredByMax && !revealed;
  if (want !== tucked) { tucked = want; win && win.webContents.send('tuck', want); }
}
ipcMain.on('collapsed', () => {
  if (win && win.isFocused()) win.blur();
  revealed = false; applyTuck();
});
const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
// On regarde quelle fenetre est visible en haut de l'ecran, a cote de l'encoche
// (et non la fenetre active : une appli maximisee peut etre derriere une petite boite de dialogue).
async function checkForeground() {
  const d = targetDisplay(), b = d.bounds;
  const pt = screen.dipToScreenPoint({ x: Math.round(b.x + b.width * 0.25), y: b.y + 4 });
  const w = await callHelper('at', pt);
  if (w && w.pid === process.pid) return;               // notre propre fenetre : on ne change rien
  let covers = false;
  if (w && !DESKTOP_CLASSES.has(w.cls)) {
    const r = screen.screenToDipRect(null, { x: w.l, y: w.t, width: w.r - w.l, height: w.b - w.t });
    const fillsTop = r.width >= d.workArea.width - 2 && r.y <= d.workArea.y + 2;   // pleine largeur collee en haut
    covers = w.max || fillsTop;
  }
  const fg = w || { cls: 'aucune' };
  if (covers !== coveredByMax) {
    console.log(`[tuck] ${covers ? 'fenetre maximisee devant' : 'bureau libre'} (${fg.cls})`);
    coveredByMax = covers; if (!covers) revealed = false; applyTuck(); }
}
// Masquer completement pendant un jeu / une appli en plein ecran exclusif
let hiddenForFullscreen = false;
async function checkFullscreen() {
  const s = await callHelper('quns');
  let busy = s === 3 || s === 4;
  // 2 = "occupe" : Windows le signale aussi sur le bureau (Wallpaper Engine), donc on verifie
  // que la fenetre active couvre vraiment tout l'ecran, barre des taches comprise.
  if (s === 2) {
    const fg = await callHelper('fg');
    if (fg && !DESKTOP_CLASSES.has(fg.cls) && fg.pid !== process.pid) {
      const r = screen.screenToDipRect(null, { x: fg.l, y: fg.t, width: fg.r - fg.l, height: fg.b - fg.t });
      const b = targetDisplay().bounds;
      busy = r.x <= b.x && r.y <= b.y && r.x + r.width >= b.x + b.width && r.y + r.height >= b.y + b.height;
    }
  }
  if (busy !== hiddenForFullscreen) { hiddenForFullscreen = busy; busy ? win.hide() : win.showInactive(); }
}
setInterval(() => { if (win && helper) checkForeground().catch(() => { }); }, 400);
setInterval(() => { if (win && helper) checkFullscreen().catch(() => { }); }, 2500);
setInterval(() => {
  if (!win || !tucked) return;
  const p = screen.getCursorScreenPoint(), b = targetDisplay().bounds;
  if (p.y <= b.y + 1 && Math.abs(p.x - (b.x + b.width / 2)) <= 150) {
    revealed = true; applyTuck(); win.webContents.send('reveal');
  }
}, 50);

// ---------- media / volume ----------
ipcMain.handle('helper', (_e, op, arg) => callHelper(op, arg));

// ---------- stats ----------
let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i].times, t = c.times;
    const dt = (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + (t.idle - p.idle);
    idle += t.idle - p.idle; total += dt;
  });
  lastCpu = now;
  return total ? Math.round(100 * (1 - idle / total)) : 0;
}
function nvidia() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 3000 }, (err, out) => {
        if (err) return resolve(null);
        const [name, util, temp, used, total, power] = out.trim().split(',').map(s => s.trim());
        resolve({ name, util: +util, temp: +temp, memUsed: +used, memTotal: +total, power: parseFloat(power) || null });
      });
  });
}
function lhmCpuTemp() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8085/data.json', { timeout: 800 }, (res) => {
      let s = ''; res.on('data', d => s += d);
      res.on('end', () => {
        try {
          const found = [];
          (function walk(n, inCpu) {
            const cpu = inCpu || (n.ImageURL || '').includes('cpu.png');
            if (cpu && /°C/.test(n.Value || '') && /Tctl|Package|Core \(Tctl/i.test(n.Text || '')) found.push(parseFloat(n.Value));
            (n.Children || []).forEach(c => walk(c, cpu));
          })(JSON.parse(s), false);
          resolve(found.length ? found[0] : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
let lastNet = null;
ipcMain.handle('stats', async () => {
  const [gpu, cpuTemp, net] = await Promise.all([nvidia(), lhmCpuTemp(), callHelper('net').catch(() => null)]);
  let netRate = null;
  if (net) {
    const t = Date.now();
    if (lastNet) {
      const dt = (t - lastNet.t) / 1000;
      netRate = { down: Math.max(0, (net.rx - lastNet.rx) / dt), up: Math.max(0, (net.tx - lastNet.tx) / dt) };
    }
    lastNet = { ...net, t };
  }
  const disks = [];
  for (const d of (config.disks || ['C:\\'])) {
    try { const s = await fs.promises.statfs(d); disks.push({ name: d.slice(0, 2), total: s.blocks * s.bsize, free: s.bavail * s.bsize }); } catch { }
  }
  return {
    cpu: { load: cpuPercent(), temp: cpuTemp, model: os.cpus()[0].model.trim(), cores: os.cpus().length },
    ram: { total: os.totalmem(), free: os.freemem() },
    gpu, net: netRate, disks, uptime: os.uptime(),
  };
});

// ---------- presse-papiers (en memoire seulement) ----------
let clipHistory = [];
let lastClip = clipboard.readText();
setInterval(() => {
  const t = clipboard.readText();
  if (t && t !== lastClip && t.trim()) {
    lastClip = t;
    clipHistory = [{ text: t, at: Date.now() }, ...clipHistory.filter(c => c.text !== t)].slice(0, 40);
    if (win) win.webContents.send('clip-update', clipHistory);
  } else if (t !== lastClip) lastClip = t;
}, 700);
ipcMain.handle('clip-list', () => clipHistory);
ipcMain.handle('clip-copy', (_e, text) => { lastClip = text; clipboard.writeText(text); return true; });
ipcMain.handle('clip-remove', (_e, at) => { clipHistory = clipHistory.filter(c => c.at !== at); return clipHistory; });
ipcMain.handle('clip-clear', () => { clipHistory = []; return clipHistory; });

// ---------- apps (raccourcis du menu Demarrer) ----------
let appsCache = null;
function scanStartMenu() {
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];
  const out = new Map();
  const skip = /uninstall|désinstaller|desinstaller|readme|help|aide|documentation|web ?site|site web|licen[cs]e|manual|manuel|release notes|recovery/i;
  function walk(dir, depth) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(e.name)) {
        const name = e.name.replace(/\.(lnk|url)$/i, '');
        if (!skip.test(name) && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), { name, path: p });
      }
    }
  }
  roots.forEach(r => walk(r, 0));
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
const iconCache = new Map();
async function iconFor(p) {
  if (iconCache.has(p)) return iconCache.get(p);
  let target = p;
  if (p.toLowerCase().endsWith('.lnk')) { try { target = shell.readShortcutLink(p).target || p; } catch { } }
  let url = null;
  try { url = (await app.getFileIcon(target, { size: 'large' })).toDataURL(); } catch { }
  if ((!url || url.length < 200) && target !== p) { try { url = (await app.getFileIcon(p, { size: 'large' })).toDataURL(); } catch { } }
  iconCache.set(p, url);
  return url;
}
ipcMain.handle('apps-list', async () => {
  if (!appsCache) appsCache = scanStartMenu();
  return { apps: appsCache, favorites: state.favorites };
});
ipcMain.handle('app-icon', (_e, p) => iconFor(p));
ipcMain.handle('app-launch', (_e, p) => shell.openPath(p));
ipcMain.handle('app-fav', (_e, p, on) => {
  state.favorites = state.favorites.filter(f => f !== p);
  if (on) state.favorites.push(p);
  saveState(); return state.favorites;
});
ipcMain.handle('open-uri', (_e, uri) => {
  // Seulement des schemas connus et sans danger (ms-settings:, ms-screenclip:, etc.) ou des exe Windows
  if (/^(ms-settings:|ms-screenclip:|ms-actioncenter:|ms-clock:|ms-availablenetworks:)/.test(uri)) return shell.openExternal(uri);
  const allowed = { taskmgr: 'taskmgr.exe', explorer: 'explorer.exe', calc: 'calc.exe', terminal: 'wt.exe' };
  if (allowed[uri]) { spawn(allowed[uri], [], { detached: true, stdio: 'ignore' }).unref(); return true; }
  return false;
});

// ---------- alimentation ----------
ipcMain.handle('power', (_e, action) => {
  const cmds = {
    lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
    sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
    restart: ['shutdown.exe', ['/r', '/t', '0']],
    shutdown: ['shutdown.exe', ['/s', '/t', '0']],
    signout: ['shutdown.exe', ['/l']],
  };
  const c = cmds[action]; if (!c) return false;
  spawn(c[0], c[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
});

// ---------- aujourd'hui : to-do, calendrier, meteo ----------
ipcMain.handle('todos', () => state.todos);
ipcMain.handle('todos-save', (_e, todos) => { state.todos = todos; saveState(); return true; });

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { timeout: 10000, headers: { 'User-Agent': 'island/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchText(res.headers.location));
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let s = ''; res.setEncoding('utf8'); res.on('data', d => s += d); res.on('end', () => resolve(s));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
let calCache = { at: 0, data: null };
ipcMain.handle('calendar', async (_e, force) => {
  const urls = (config.calendars || []).filter(Boolean);
  if (!urls.length) return { configured: false, events: [] };
  if (!force && calCache.data && Date.now() - calCache.at < 10 * 60e3) return calCache.data;
  const ical = require('node-ical');
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 864e5);
  const events = []; const errors = [];
  for (const cal of urls) {
    const url = typeof cal === 'string' ? cal : cal.url;
    const color = typeof cal === 'string' ? null : cal.color;
    try {
      const data = ical.sync.parseICS(await fetchText(url));
      for (const ev of Object.values(data)) {
        if (ev.type !== 'VEVENT') continue;
        const allDay = ev.datetype === 'date';
        const dur = ev.end ? (new Date(ev.end) - new Date(ev.start)) : (allDay ? 864e5 : 0);
        const push = (s) => {
          const e = new Date(s.getTime() + dur);
          if (e > start && s < end) events.push({ title: ev.summary || '(sans titre)', start: s.toISOString(), end: e.toISOString(), allDay, location: ev.location || '', color });
        };
        if (ev.rrule) {
          const occ = ev.rrule.between(new Date(start.getTime() - dur), end, true);
          const ex = ev.exdate ? Object.values(ev.exdate).map(d => new Date(d).getTime()) : [];
          for (const o of occ) {
            let s = new Date(o);
            if (allDay) s = new Date(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate());
            if (ex.includes(s.getTime())) continue;
            const key = s.toISOString().slice(0, 10);
            if (ev.recurrences && ev.recurrences[key]) continue;   // instance modifiee : listee a part
            push(s);
          }
          if (ev.recurrences) for (const r of Object.values(ev.recurrences)) {
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

// Position : par adresse IP (le portable bouge), sinon la ville de secours de la config.
let locCache = { at: 0, data: null };
async function locate() {
  const w = config.weather || {};
  if (w.mode === 'fixed' && w.lat != null) return { city: w.city, lat: w.lat, lon: w.lon, source: 'config' };
  if (locCache.data && Date.now() - locCache.at < 30 * 60e3) return locCache.data;
  const providers = [
    ['https://ipwho.is/', (j) => j.success !== false && { city: j.city, lat: j.latitude, lon: j.longitude }],
    ['https://get.geojs.io/v1/ip/geo.json', (j) => ({ city: j.city, lat: +j.latitude, lon: +j.longitude })],
  ];
  for (const [url, pick] of providers) {
    try {
      const loc = pick(JSON.parse(await fetchText(url)));
      if (loc && isFinite(loc.lat) && isFinite(loc.lon)) {
        locCache = { at: Date.now(), data: { ...loc, source: 'ip' } };
        return locCache.data;
      }
    } catch { }
  }
  if (w.fallback && w.fallback.lat != null) return { ...w.fallback, source: 'fallback' };
  return null;
}
let weatherCache = { at: 0, data: null, key: '' };
ipcMain.handle('weather', async () => {
  const loc = await locate(); if (!loc) return null;
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  if (weatherCache.data && weatherCache.key === key && Date.now() - weatherCache.at < 20 * 60e3) return weatherCache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`;
  try {
    const d = JSON.parse(await fetchText(url));
    weatherCache = { at: Date.now(), key, data: { city: loc.city, source: loc.source, ...d } };
  } catch { }
  return weatherCache.data;
});

// ---------- terminal (pwsh via node-pty) ----------
let pty = null;
ipcMain.handle('pty-start', (_e, cols, rows) => {
  if (pty) return true;
  const nodePty = require('@lydell/node-pty');
  pty = nodePty.spawn(config.shell || 'pwsh.exe', ['-NoLogo'], {
    name: 'xterm-256color', cols: cols || 100, rows: rows || 24, cwd: os.homedir(),
    env: { ...process.env, TERM_PROGRAM: 'island' },
  });
  pty.onData(d => win && win.webContents.send('pty-data', d));
  pty.onExit(() => { pty = null; win && win.webContents.send('pty-exit'); });
  return true;
});
ipcMain.on('pty-write', (_e, d) => pty && pty.write(d));
ipcMain.on('pty-resize', (_e, c, r) => { try { pty && pty.resize(c, r); } catch { } });

// ---------- Claude : question rapide + consommation ----------
const CHAT_DIR = path.join(DATA, 'claude-chat');
fs.mkdirSync(CHAT_DIR, { recursive: true });
let claudeProc = null;
ipcMain.handle('claude-ask', (_e, prompt, cont) => {
  if (claudeProc) return false;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (cont) args.push('--continue');
  if (config.claudeModel) args.push('--model', config.claudeModel);
  claudeProc = spawn(config.claudePath || 'claude', args, { cwd: CHAT_DIR, windowsHide: true, env: process.env });
  claudeProc.stdin.end(prompt);
  let buf = '';
  const send = (type, data) => win && win.webContents.send('claude-event', { type, data });
  claudeProc.stdout.setEncoding('utf8');
  claudeProc.stdout.on('data', (chunk) => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') send('delta', m.event.delta.text);
      else if (m.type === 'result') send('result', { text: m.result, cost: m.total_cost_usd, error: m.is_error });
    }
  });
  let err = '';
  claudeProc.stderr.setEncoding('utf8');
  claudeProc.stderr.on('data', d => err += d);
  claudeProc.on('error', e => { send('error', e.message); claudeProc = null; });
  claudeProc.on('close', (code) => { if (code && err) send('error', err.slice(-500)); send('done'); claudeProc = null; });
  return true;
});
ipcMain.handle('claude-stop', () => { if (claudeProc) claudeProc.kill(); return true; });

// Lit les journaux locaux de Claude Code (~/.claude/projects/**/*.jsonl)
const usageFileCache = new Map();   // chemin -> { mtime, entries }
ipcMain.handle('claude-usage', async () => {
  const base = path.join(os.homedir(), '.claude', 'projects');
  const since = Date.now() - 7 * 864e5;
  const files = [];
  (function walk(dir) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) { try { const st = fs.statSync(p); if (st.mtimeMs >= since) files.push({ p, mtime: st.mtimeMs }); } catch { } }
    }
  })(base);
  const seen = new Set(); const all = [];
  for (const f of files) {
    let c = usageFileCache.get(f.p);
    if (!c || c.mtime !== f.mtime) {
      const entries = [];
      const text = await fs.promises.readFile(f.p, 'utf8').catch(() => '');
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue;
        try {
          const j = JSON.parse(line);
          const u = j.message?.usage; if (!u || !j.timestamp) continue;
          entries.push({ key: (j.message.id || '') + ':' + (j.requestId || ''), t: Date.parse(j.timestamp), model: j.message.model || '?',
            inp: u.input_tokens || 0, out: u.output_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, session: j.sessionId });
        } catch { }
      }
      c = { mtime: f.mtime, entries }; usageFileCache.set(f.p, c);
    }
    for (const e of c.entries) { if (e.t >= since && !seen.has(e.key)) { seen.add(e.key); all.push(e); } }
  }
  const now = Date.now(); const today = new Date(); today.setHours(0, 0, 0, 0);
  const sum = (arr) => arr.reduce((a, e) => ({ inp: a.inp + e.inp, out: a.out + e.out, cw: a.cw + e.cw, cr: a.cr + e.cr, n: a.n + 1 }), { inp: 0, out: 0, cw: 0, cr: 0, n: 0 });
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d0 = today.getTime() - i * 864e5, d1 = d0 + 864e5;
    days.push({ day: d0, ...sum(all.filter(e => e.t >= d0 && e.t < d1)) });
  }
  const todayEntries = all.filter(e => e.t >= today.getTime());
  const models = {};
  for (const e of todayEntries) { const m = models[e.model] ||= { out: 0, n: 0 }; m.out += e.out; m.n++; }
  const last5 = all.filter(e => e.t >= now - 5 * 3600e3);
  const first5 = last5.length ? Math.min(...last5.map(e => e.t)) : null;
  return {
    today: sum(todayEntries), last5h: sum(last5), windowStart: first5,
    sessionsToday: new Set(todayEntries.map(e => e.session)).size,
    days, models,
  };
});

// ---------- tray ----------
// Hors paquet, electron.exe doit recevoir le dossier de l'appli en argument
const LOGIN_ITEM = { path: process.execPath, args: [APP_DIR] };
function createTray() {
  const icon = nativeImage.createFromPath(path.join(RENDERER, 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Island');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: win.isVisible() ? 'Masquer l\'island' : 'Afficher l\'island', click: () => { win.isVisible() ? win.hide() : win.showInactive(); rebuild(); } },
    { label: 'Recharger', click: () => { config = readJson(CONFIG_PATH, {}); calCache.at = 0; weatherCache.at = 0; locCache.at = 0; placeWindow(); win.reload(); } },
    { label: 'Ouvrir config.json', click: () => shell.openPath(CONFIG_PATH) },
    { label: 'Démarrer avec Windows', type: 'checkbox', checked: app.getLoginItemSettings(LOGIN_ITEM).openAtLogin,
      click: (m) => app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: m.checked, name: 'Island' }) },
    { type: 'separator' },
    { label: 'Quitter', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  rebuild();
}

app.whenReady().then(() => {
  startHelper();
  createWindow();
  createTray();
  // Ctrl+Alt+Espace : ouvrir/fermer l'island
  globalShortcut.register(config.shortcut || 'Control+Alt+Space', () => {
    if (!win.isVisible()) win.showInactive();
    revealed = true; applyTuck();
    win.webContents.send('toggle');
  });
});
ipcMain.on('focus-window', () => { if (win) win.focus(); });
app.on('before-quit', () => { app.isQuitting = true; try { helper.kill(); } catch { } try { pty && pty.kill(); } catch { } });
app.on('window-all-closed', () => app.quit());

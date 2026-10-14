// Base partagee par tous les modules du processus principal :
// chemins, configuration, etat persistant, envoi vers l'interface, petits utilitaires reseau.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

const SRC = path.join(__dirname, '..');
const APP_DIR = path.join(SRC, '..');
const RENDERER = path.join(SRC, 'renderer');
// Les donnees personnelles vivent dans %APPDATA%\Follet, jamais dans le dossier du code.
const DATA = app.getPath('userData');
const CONFIG_PATH = path.join(DATA, 'config.json');
const STATE_PATH = path.join(DATA, 'state.json');

const DEFAULTS = {
  display: 'primary',
  shortcut: 'Control+Alt+Space',
  shell: 'pwsh.exe',
  disks: ['C:\\'],
  calendars: [],
  weather: { mode: 'ip', fallback: null },
  theme: { source: 'art', color: '#6750a4', variant: 'tonal' },
  behavior: { tuck: true, hideFullscreen: true, hover: 'normal', accel: true },
  activities: { volume: true, media: true, battery: true, audioDevice: true, notif: true, mic: true },
  tabs: { home: true, today: true, stats: true, shelf: true, clip: true, apps: true, term: true, ai: true, power: true },
  ai: { provider: 'claude-code', models: {}, effort: 'low', customBase: '' },
  mascot: { color: 'corail' },
  notch: { size: 'normal', pos: 50 },   // pos : 0 = bord gauche, 50 = centre, 100 = bord droit
  tabOrder: [],
  language: 'auto',
};

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

fs.mkdirSync(DATA, { recursive: true });
// Migration depuis l'ancien nom (Island) : on recopie la config, l'etat et les conversations
(function migrate() {
  const old = path.join(app.getPath('appData'), 'Island');
  if (fs.existsSync(CONFIG_PATH) || !fs.existsSync(path.join(old, 'config.json'))) return;
  for (const f of ['config.json', 'state.json']) { try { fs.copyFileSync(path.join(old, f), path.join(DATA, f)); } catch { } }
  try { fs.cpSync(path.join(old, 'claude-chat'), path.join(DATA, 'claude-chat'), { recursive: true }); } catch { }
})();
const events = new EventEmitter();

// Journal : %APPDATA%\Follet\logs\follet.log (1 Mo max, l'ancien est garde en .old)
const LOG_DIR = path.join(DATA, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG = path.join(LOG_DIR, 'follet.log');
function log(level, ...args) {
  const line = `${new Date().toISOString()} [${level}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1e6) fs.renameSync(LOG, LOG + '.old');
    fs.appendFileSync(LOG, line);
  } catch { }
}
for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => { orig(...a); log(level === 'log' ? 'info' : level, ...a); };
}
process.on('uncaughtException', (e) => log('crash', e));
process.on('unhandledRejection', (e) => log('rejet', e));
let config = merge(DEFAULTS, readJson(CONFIG_PATH, {}));
let state = merge({ todos: [], favorites: [], shelf: [] }, readJson(STATE_PATH, {}));
// ancien reglage claudeModel -> ai.models['claude-code']
if (config.claudeModel && !config.ai.models['claude-code']) { config.ai.models['claude-code'] = config.claudeModel; }
delete config.claudeModel;
if (!fs.existsSync(CONFIG_PATH)) saveConfig();

function saveConfig() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); }
function setConfig(patch) {
  const before = config;
  config = merge(config, patch);
  // les tableaux sont remplaces, pas fusionnes
  for (const [k, v] of Object.entries(patch)) if (Array.isArray(v)) config[k] = v;
  saveConfig();
  events.emit('config', config, before);
  return config;
}
function reloadConfig() { const before = config; config = merge(DEFAULTS, readJson(CONFIG_PATH, {})); events.emit('config', config, before); }
function saveState() { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); }

let win = null;
function setWindow(w) { win = w; }
function getWindow() { return win; }
function send(channel, ...args) { if (win && !win.isDestroyed()) win.webContents.send(channel, ...args); }

function fetchRaw(url, { timeout = 10000, method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method, timeout, headers: { 'User-Agent': 'follet/1.0', ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(fetchRaw(new URL(res.headers.location, url).href, { timeout, method, body, headers })); }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}
async function fetchText(url, opts) {
  const res = await fetchRaw(url, opts);
  if (res.statusCode !== 200) { res.resume(); throw new Error('HTTP ' + res.statusCode); }
  res.setEncoding('utf8');
  let s = ''; for await (const d of res) s += d;
  return s;
}
const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

module.exports = {
  SRC, APP_DIR, RENDERER, DATA, CONFIG_PATH, DEFAULTS,
  get config() { return config; }, setConfig, reloadConfig,
  get state() { return state; }, saveState,
  events, setWindow, getWindow, send, log, LOG_DIR,
  fetchRaw, fetchText, fetchJson,
};

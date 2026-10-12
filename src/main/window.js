// Fenetre transparente toujours au-dessus, centree en haut de l'ecran choisi.
// La souris traverse la fenetre partout sauf sur l'encoche : le processus principal suit le curseur
// et active la capture quand il passe sur le rectangle que l'interface lui signale.
const { BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const core = require('./core');
const helper = require('./helper');

const WIN_W = 900, WIN_H = 600;
let win = null;
let notchRect = null;        // rectangle de l'encoche dans la fenetre (px CSS), null = rien a capturer
let inside = false;
let coveredByMax = false, revealed = false, tucked = false, hiddenForFullscreen = false;

function targetDisplay() {
  const all = screen.getAllDisplays();
  const want = core.config.display;
  if (want && want !== 'primary') {
    const d = all.find((d) => String(d.id) === String(want) || `${d.size.width}x${d.size.height}` === want);
    if (d) return d;
  }
  return screen.getPrimaryDisplay();
}
function place() {
  if (!win) return;
  const b = targetDisplay().bounds;
  win.setBounds({ x: Math.round(b.x + (b.width - WIN_W) / 2), y: b.y, width: WIN_W, height: WIN_H });
}

function create() {
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, fullscreenable: false, maximizable: false,
    backgroundColor: '#00000000', title: 'Follet',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  core.setWindow(win);
  // Visualiseur : le son du systeme (boucle locale) est analyse dans l'interface, jamais enregistre
  win.webContents.session.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((s) => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  place();
  const demo = process.env.FOLLET_DEMO;
  win.loadFile(path.join(core.RENDERER, 'index.html'), demo ? { query: { demo } } : undefined);
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  if (process.env.FOLLET_EVAL) setTimeout(async () => {
    try { console.log('[eval]', JSON.stringify(await win.webContents.executeJavaScript(process.env.FOLLET_EVAL))); } catch (e) { console.log('[eval error]', e.message); }
  }, +(process.env.FOLLET_EVAL_DELAY || 8000));
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, place);
  core.events.on('config', (c, before) => { if (c.display !== before.display) place(); applyTuck(); });

  setInterval(trackCursor, 40);
  setInterval(() => checkCovered().catch(() => { }), 400);
  setInterval(() => checkFullscreen().catch(() => { }), 2500);
  return win;
}

// ---------- capture de la souris ----------
ipcMain.on('notch-rect', (_e, r) => { notchRect = r; });
function trackCursor() {
  if (!win || !win.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  const wb = win.getBounds();
  const now = !!notchRect && p.x >= wb.x + notchRect.x && p.x <= wb.x + notchRect.x + notchRect.w
    && p.y >= wb.y + notchRect.y && p.y <= wb.y + notchRect.y + notchRect.h;
  if (now !== inside) {
    inside = now;
    win.setIgnoreMouseEvents(!now, { forward: true });
    core.send('pointer', now);
  }
  // Rangee : le haut de l'ecran au milieu la fait ressortir
  if (tucked) {
    const b = targetDisplay().bounds;
    if (p.y <= b.y + 1 && Math.abs(p.x - (b.x + b.width / 2)) <= 150) reveal();
  }
}

// ---------- rangement devant une fenetre maximisee ----------
function applyTuck() {
  const want = core.config.behavior.tuck && coveredByMax && !revealed;
  if (want !== tucked) { tucked = want; core.send('tuck', want); }
}
function reveal() { revealed = true; applyTuck(); core.send('reveal'); }
ipcMain.on('collapsed', () => {
  if (win && win.isFocused()) win.blur();
  revealed = false; applyTuck();
});
const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
// On regarde la fenetre visible en haut de l'ecran, a cote de l'encoche (pas la fenetre active :
// une appli maximisee peut etre derriere une petite boite de dialogue).
async function checkCovered() {
  if (!win || !helper.ready) return;
  const d = targetDisplay(), b = d.bounds;
  const pt = screen.dipToScreenPoint({ x: Math.round(b.x + b.width * 0.2), y: b.y + 4 });
  const w = await helper.call('at', pt);
  if (w && w.pid === process.pid) return;
  let covers = false;
  if (w && !DESKTOP_CLASSES.has(w.cls)) {
    const r = screen.screenToDipRect(null, { x: w.l, y: w.t, width: w.r - w.l, height: w.b - w.t });
    covers = w.max || (r.width >= d.workArea.width - 2 && r.y <= d.workArea.y + 2);
  }
  if (covers !== coveredByMax) { coveredByMax = covers; if (!covers) revealed = false; applyTuck(); }
}

// ---------- masquage en plein ecran (jeux) ----------
async function checkFullscreen() {
  if (!win || !helper.ready) return;
  let busy = false;
  if (core.config.behavior.hideFullscreen) {
    const s = await helper.call('quns');
    busy = s === 3 || s === 4;
    // 2 = "occupe" : aussi signale sur le bureau (Wallpaper Engine) -> on verifie la fenetre active
    if (s === 2) {
      const fg = await helper.call('fg');
      if (fg && !DESKTOP_CLASSES.has(fg.cls) && fg.pid !== process.pid) {
        const r = screen.screenToDipRect(null, { x: fg.l, y: fg.t, width: fg.r - fg.l, height: fg.b - fg.t });
        const b = targetDisplay().bounds;
        busy = r.x <= b.x && r.y <= b.y && r.x + r.width >= b.x + b.width && r.y + r.height >= b.y + b.height;
      }
    }
  }
  if (busy !== hiddenForFullscreen) { hiddenForFullscreen = busy; busy ? win.hide() : win.showInactive(); }
}

ipcMain.on('focus-window', () => win && win.focus());

module.exports = { create, place, reveal, targetDisplay, get win() { return win; }, get tucked() { return tucked; } };

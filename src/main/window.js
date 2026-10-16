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
let dwell = 0, hovered = false, last = null;
const HOVER_DELAY = { fast: 120, normal: 280, slow: 550 }; // ms de presence lente avant l'apercu
const REVEAL_DELAY = { fast: 300, normal: 450, slow: 700 };   // ms immobile en haut de l'ecran pour sortir de sa cachette
let edgeDwell = 0;
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
  const pos = Math.max(0, Math.min(100, +((core.config.notch || {}).pos ?? 50)));
  const free = Math.max(0, b.width - WIN_W);
  win.setBounds({ x: Math.round(b.x + free * pos / 100), y: b.y, width: WIN_W, height: WIN_H });
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
  // a la fermeture, les minuteries ci-dessous voient win = null au lieu d'une fenetre detruite
  win.on('closed', () => { win = null; });
  // L'interface plante (rare) : on la recharge plutot que de laisser une encoche vide
  win.webContents.on('render-process-gone', (_e, d) => { console.error('interface arrêtée : ' + d.reason); if (d.reason !== 'clean-exit') setTimeout(() => !win.isDestroyed() && win.reload(), 1000); });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  if (process.env.FOLLET_EVAL) setTimeout(async () => {
    try { console.log('[eval]', JSON.stringify(await win.webContents.executeJavaScript(process.env.FOLLET_EVAL))); } catch (e) { console.log('[eval error]', e.message); }
    // capture PNG (avec transparence) de l'encoche seule, pour la documentation
    // FOLLET_CAPTURE_FRAMES=n : n images (chemin-000.png...) toutes les FOLLET_CAPTURE_MS ms, pour les animations
    if (process.env.FOLLET_CAPTURE) setTimeout(async () => {
      const r = notchRect || { x: 0, y: 0, w: WIN_W, h: WIN_H };
      const n = +(process.env.FOLLET_CAPTURE_FRAMES || 0), every = +(process.env.FOLLET_CAPTURE_MS || 80);
      const out = process.env.FOLLET_CAPTURE, fs = require('fs');
      if (!n) fs.writeFileSync(out, (await win.webContents.capturePage({ x: r.x, y: 0, width: r.w, height: r.h })).toPNG());
      else {
        const t0 = Date.now();
        for (let i = 0; i < n; i++) {
          const img = await win.webContents.capturePage({ x: r.x, y: 0, width: r.w, height: r.h });
          fs.writeFileSync(out.replace(/\.png$/, `-${String(i).padStart(3, '0')}.png`), img.toPNG());
          const wait = t0 + (i + 1) * every - Date.now();
          if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        }
        fs.writeFileSync(out, '');                 // marqueur de fin pour les scripts
      }
      console.log('[capture]', out);
    }, 1200);
  }, +(process.env.FOLLET_EVAL_DELAY || 8000));
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, place);
  core.events.on('config', (c, before) => { if (c.display !== before.display || (c.notch || {}).pos !== (before.notch || {}).pos) place(); applyTuck(); });

  setInterval(trackCursor, 40);
  setInterval(() => checkCovered().catch(() => { }), 400);
  setInterval(() => checkFullscreen().catch(() => { }), 2500);
  return win;
}

// ---------- capture de la souris ----------
ipcMain.on('notch-rect', (_e, r) => { notchRect = r; });
// Menu du clic droit ouvert : on ne touche a rien. Rendre la fenetre "traversable" (setIgnoreMouseEvents)
// quand la souris sort de l'encoche fermait le menu natif sous Windows.
let menuOpen = false;
function setMenuOpen(v) { menuOpen = v; }
function trackCursor() {
  if (!win || !win.isVisible() || menuOpen) return;
  const p = screen.getCursorScreenPoint();
  const wb = win.getBounds();
  const now = !!notchRect && p.x >= wb.x + notchRect.x && p.x <= wb.x + notchRect.x + notchRect.w
    && p.y >= wb.y + notchRect.y && p.y <= wb.y + notchRect.y + notchRect.h;
  if (now !== inside) {
    inside = now;
    win.setIgnoreMouseEvents(!now, { forward: true });
    core.send('pointer', now);
    dwell = 0; hovered = false;
  }
  // Intention de survol : l'apercu ne s'ouvre que si la souris s'attarde (lente) dans l'encoche,
  // pas quand elle la traverse pour aller vers un onglet de navigateur.
  const speed = last ? Math.hypot(p.x - last.x, p.y - last.y) / 40 : 0;
  last = p;
  if (inside && !hovered) {
    if (speed < 0.5) dwell += 40; else dwell = Math.max(0, dwell - 40);
    if (dwell >= (HOVER_DELAY[core.config.behavior.hover] || 280)) { hovered = true; core.send('hover'); }
  }
  // Rangee : la souris posee en haut de l'ecran, au milieu, la fait ressortir. Il faut s'y attarder,
  // presque immobile : on vise souvent les onglets du navigateur tout en haut, sans vouloir l'encoche.
  if (tucked) {
    const b = targetDisplay().bounds;
    if (p.y <= b.y + 1 && Math.abs(p.x - (b.x + b.width / 2)) <= 150 && speed < 0.3) {
      edgeDwell += 40;
      if (edgeDwell >= (REVEAL_DELAY[core.config.behavior.hover] || 450)) { edgeDwell = 0; reveal(); }
    } else edgeDwell = 0;
  } else edgeDwell = 0;
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
// On regarde les fenetres visibles en haut de l'ecran, de chaque cote de l'encoche (pas la fenetre active :
// une appli maximisee peut etre derriere une petite boite de dialogue). Deux fenetres cote a cote
// (ancrees a gauche et a droite) collees en haut rangent l'encoche comme une fenetre maximisee.
async function checkCovered() {
  if (!win || !helper.ready) return;
  const d = targetDisplay(), b = d.bounds, wb = win.getBounds();
  const cx = notchRect ? wb.x + notchRect.x + notchRect.w / 2 : b.x + b.width / 2;
  const xs = [cx - 160, cx + 160].map((x) => Math.round(Math.min(b.x + b.width - 2, Math.max(b.x + 1, x))));
  const ws = await Promise.all(xs.map((x) => helper.call('at', screen.dipToScreenPoint({ x, y: b.y + 4 }))));
  if (ws.some((w) => w && w.pid === process.pid)) return;
  const atTop = (w) => {
    if (!w || DESKTOP_CLASSES.has(w.cls)) return false;
    if (w.max) return true;
    const r = screen.screenToDipRect(null, { x: w.l, y: w.t, width: w.r - w.l, height: w.b - w.t });
    return r.y <= d.workArea.y + 2;
  };
  const covers = ws.some((w) => w && w.max) || ws.every(atTop);
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

module.exports = { create, place, reveal, setMenuOpen, targetDisplay, get win() { return win; }, get tucked() { return tucked; } };

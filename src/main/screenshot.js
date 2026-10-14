// Capture d'ecran vers l'etagere : raccourci global (Ctrl+Alt+S par defaut). L'ecran sous la souris est
// capture par le helper en pleine resolution, sans l'encoche, enregistre dans Images\Captures d'ecran, copie et depose dans l'etagere.
const { app, globalShortcut, screen, clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const core = require('./core');
const { shelfAdd } = require('./tools');
const helper = require('./helper');

let windowMod = null, current = null, busy = false;
const pad = (n) => String(n).padStart(2, '0');

async function capture() {
  if (busy) return;
  busy = true;
  const win = windowMod && windowMod.win;
  try {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const r = screen.dipToScreenRect(null, d.bounds);   // pixels physiques, pleine resolution
    const now = new Date();
    const dir = path.join(app.getPath('pictures'), 'Screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `Follet ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}.png`);
    // l'encoche s'efface le temps de la capture
    if (win) win.setOpacity(0);
    await new Promise((res) => setTimeout(res, 120));
    try { await helper.call('screenshot', { x: r.x, y: r.y, w: r.width, h: r.height, path: file }, 10000); } finally { if (win) win.setOpacity(1); }
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) throw new Error('aucune image');
    clipboard.writeImage(img);
    shelfAdd([file]);
    core.send('activity', { kind: 'shot', path: file, thumb: img.resize({ height: 96 }).toDataURL() });
  } catch (e) {
    if (win) win.setOpacity(1);
    core.log('warn', 'capture : ' + e.message);
  } finally { busy = false; }
}

function register() {
  if (current) { try { globalShortcut.unregister(current); } catch { } }
  current = core.config.shotShortcut || null;
  if (current) try { globalShortcut.register(current, capture); } catch { current = null; }
}

function start(w) {
  windowMod = w;
  register();
  core.events.on('config', (c, before) => { if (c.shotShortcut !== before.shotShortcut) register(); });
}
module.exports = { start, capture };

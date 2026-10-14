// Outils d'ecran : copier le texte d'une zone (OCR de Windows, hors ligne) et pipette de couleur.
// L'ecran sous la souris est fige dans une fenetre plein ecran ou l'on choisit la zone ou le pixel.
const { app, BrowserWindow, globalShortcut, screen, clipboard, nativeImage, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('./core');
const helper = require('./helper');
const { t } = require('./i18n');

let windowMod = null, overlay = null, shot = null;
const keys = { ocrShortcut: 'ocr', colorShortcut: 'color' };
const current = {};

async function open(mode) {
  if (overlay) return;
  const notch = windowMod && windowMod.win;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const r = screen.dipToScreenRect(null, d.bounds);
  const file = path.join(os.tmpdir(), `follet-pick-${process.pid}.png`);
  try {
    if (notch) notch.setOpacity(0);
    await new Promise((res) => setTimeout(res, 120));
    try { await helper.call('screenshot', { x: r.x, y: r.y, w: r.width, h: r.height, path: file }, 10000); } finally { if (notch) notch.setOpacity(1); }
    shot = nativeImage.createFromPath(file);
    fs.rm(file, () => { });
    if (shot.isEmpty()) throw new Error('aucune image');
  } catch (e) { core.log('warn', 'pipette/ocr : ' + e.message); return; }

  overlay = new BrowserWindow({
    ...d.bounds, frame: false, resizable: false, movable: false, skipTaskbar: true, show: false, hasShadow: false,
    alwaysOnTop: true, fullscreenable: false, enableLargerThanScreen: true, backgroundColor: '#000000', title: 'Follet',
    webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setBounds(d.bounds);
  overlay.on('closed', () => { overlay = null; shot = null; });
  overlay.on('blur', () => overlay && overlay.close());
  overlay.loadFile(path.join(core.RENDERER, 'picker.html'));
  overlay.webContents.once('did-finish-load', () => {
    overlay.webContents.send('picker-init', {
      mode, image: shot.toDataURL(),
      hint: mode === 'ocr' ? t('Sélectionne le texte à copier · Échap pour annuler') : t('Clique sur une couleur pour la copier · Échap pour annuler'),
    });
  });
}

// l'image est dessinee : on montre la fenetre (avant, Windows pouvait la garder invisible)
ipcMain.on('picker-ready', (e) => {
  if (!overlay || e.sender !== overlay.webContents) return;
  overlay.show(); overlay.moveTop(); overlay.focus();
});

ipcMain.on('picker-done', async (_e, res) => {
  const img = shot;
  if (overlay) overlay.close();
  if (!res || !img) return;
  if (res.color) {
    clipboard.writeText(res.color);
    core.send('activity', { kind: 'color', hex: res.color });
    return;
  }
  // zone choisie, en pixels de l'image ; agrandie si petite (l'OCR lit mieux les grands caracteres)
  const { x, y, w, h } = res.rect;
  if (w < 4 || h < 4) return;
  let crop = img.crop({ x, y, width: w, height: h });
  if (h < 80) crop = crop.resize({ height: h * 3, quality: 'best' });
  else if (h < 200) crop = crop.resize({ height: h * 2, quality: 'best' });
  const file = path.join(os.tmpdir(), `follet-ocr-${process.pid}.png`);
  try {
    fs.writeFileSync(file, crop.toPNG());
    const r = await helper.call('ocr', file, 15000);
    const text = String(r.text || '').trim();
    if (text) clipboard.writeText(text);
    core.send('activity', { kind: 'ocr', text });
  } catch (e) {
    core.log('warn', 'ocr : ' + e.message);
    core.send('activity', { kind: 'ocr', text: '', error: true });
  } finally { fs.rm(file, () => { }); }
});

function register() {
  for (const [k, mode] of Object.entries(keys)) {
    if (current[k]) { try { globalShortcut.unregister(current[k]); } catch { } }
    current[k] = core.config[k] || null;
    if (!current[k]) continue;
    let ok = false;
    try { ok = globalShortcut.register(current[k], () => open(mode)); } catch { }
    if (!ok) { core.log('warn', `raccourci ${current[k]} deja pris par une autre appli`); current[k] = null; }
  }
}

function start(w) {
  windowMod = w;
  register();
  core.events.on('config', (c, before) => { if (Object.keys(keys).some((k) => c[k] !== before[k])) register(); });
}
app.on('will-quit', () => { if (overlay) overlay.destroy(); });
module.exports = { start, open };

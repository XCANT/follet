// Follet : une encoche facon "Dynamic Island" en haut de l'ecran, pour Windows.
const { app, Tray, Menu, nativeImage, globalShortcut, shell, ipcMain, powerMonitor } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('Follet');

const core = require('./core');
const helper = require('./helper');
const windowMod = require('./window');
const theme = require('./theme');
const monitors = require('./monitors');
const settings = require('./settings');
require('./stats');
require('./today');
require('./tools');
require('./terminal');
require('./ai');
const update = require('./update');
const notifs = require('./notifs');

// ---------- raccourci global ----------
let shortcut = null;
function registerShortcut() {
  if (shortcut) globalShortcut.unregister(shortcut);
  shortcut = core.config.shortcut || 'Control+Alt+Space';
  try {
    globalShortcut.register(shortcut, () => {
      const win = windowMod.win; if (!win) return;
      if (!win.isVisible()) win.showInactive();
      windowMod.reveal();
      core.send('toggle');
    });
  } catch { /* raccourci invalide : on garde l'appli utilisable */ }
}
core.events.on('config', (c, before) => { if (c.shortcut !== before.shortcut) registerShortcut(); });

// ---------- icone de la zone de notification ----------
let tray;
function createTray() {
  const icon = nativeImage.createFromPath(path.join(core.RENDERER, 'icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Follet');
  const rebuild = async () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: windowMod.win.isVisible() ? 'Masquer Follet' : 'Afficher Follet', click: () => { const w = windowMod.win; w.isVisible() ? w.hide() : w.showInactive(); rebuild(); } },
    { label: 'Réglages…', click: () => { windowMod.reveal(); core.send('open-tab', 'settings'); windowMod.win.focus(); } },
    { label: 'Recharger', click: () => { core.reloadConfig(); windowMod.place(); windowMod.win.reload(); } },
    { label: 'Ouvrir le dossier des données', click: () => shell.openPath(core.DATA) },
    { label: 'Rechercher les mises à jour', click: () => { windowMod.reveal(); core.send('open-tab', 'settings:about'); windowMod.win.focus(); update.check(true); } },
    { label: 'Démarrer avec Windows', type: 'checkbox', checked: await settings.loginEnabled(), click: async (m) => { await settings.setLogin(m.checked); rebuild(); } },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]));
  tray.on('click', () => { windowMod.reveal(); core.send('toggle'); });
  rebuild();
}

// La mascotte, rendue par l'interface aux couleurs du theme, sert d'icone de notification
ipcMain.on('tray-icon', (_e, dataUrl) => { const img = nativeImage.createFromDataURL(dataUrl); if (tray && !img.isEmpty()) tray.setImage(img.resize({ width: 32, height: 32 })); });
ipcMain.handle('idle-time', () => powerMonitor.getSystemIdleTime());

app.whenReady().then(() => {
  helper.start();
  windowMod.create();
  windowMod.win.webContents.on('did-finish-load', () => theme.apply().catch(() => { }));
  monitors.start();
  createTray();
  registerShortcut();
  update.start();
  notifs.start();
});
app.on('second-instance', () => { windowMod.reveal(); core.send('toggle'); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

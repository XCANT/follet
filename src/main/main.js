// Follet : une encoche facon "Dynamic Island" en haut de l'ecran, pour Windows.
const { app, Tray, Menu, nativeImage, globalShortcut, shell, ipcMain, powerMonitor } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('Follet');

const core = require('./core');
const { t } = require('./i18n');
// Acceleration graphique : active par defaut (rendu fluide, moins de processeur donc moins de chaleur).
// Desactivee, Follet economise ~70 Mo mais dessine avec le processeur. Reglable dans Comportement.
// (cle 'accel' : l'ancienne cle 'gpu', desactivee par defaut en 1.5, est volontairement ignoree)
if (core.config.behavior.accel === false) app.disableHardwareAcceleration();
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
const privacy = require('./privacy');
require('./lyrics');
const bluetooth = require('./bluetooth');
const screenshot = require('./screenshot');
const downloads = require('./downloads');

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

// Ctrl+Alt+V : historique du presse-papiers ; Entree y colle dans la fenetre ou l'on etait
let clipShortcut = null;
function registerClipShortcut() {
  if (clipShortcut) { try { globalShortcut.unregister(clipShortcut); } catch { } }
  clipShortcut = core.config.clipShortcut || null;
  if (!clipShortcut) return;
  try {
    globalShortcut.register(clipShortcut, async () => {
      const win = windowMod.win; if (!win) return;
      const fg = await helper.call('fg', null, 1500).catch(() => null);
      require('./tools').setPasteTarget(fg && fg.pid !== process.pid ? fg.hwnd : null);
      if (!win.isVisible()) win.showInactive();
      windowMod.reveal();
      core.send('open-tab', 'clip');
      win.focus();
    });
  } catch { clipShortcut = null; }
}
core.events.on('config', (c, before) => { if (c.clipShortcut !== before.clipShortcut) registerClipShortcut(); });

// ---------- icone de la zone de notification ----------
let tray;
function createTray() {
  const icon = nativeImage.createFromPath(path.join(core.RENDERER, 'icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Follet');
  const rebuild = async () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: t(windowMod.win.isVisible() ? 'Masquer Follet' : 'Afficher Follet'), click: () => { const w = windowMod.win; w.isVisible() ? w.hide() : w.showInactive(); rebuild(); } },
    { label: t('Réglages…'), click: () => { windowMod.reveal(); core.send('open-tab', 'settings'); windowMod.win.focus(); } },
    { label: t('Recharger'), click: () => { core.reloadConfig(); windowMod.place(); windowMod.win.reload(); } },
    { label: t('Ouvrir le dossier des données'), click: () => shell.openPath(core.DATA) },
    { label: t('Rechercher les mises à jour'), click: () => { windowMod.reveal(); core.send('open-tab', 'settings:about'); windowMod.win.focus(); update.check(true); } },
    { label: t('Démarrer avec Windows'), type: 'checkbox', checked: await settings.loginEnabled(), click: async (m) => { await settings.setLogin(m.checked); rebuild(); } },
    { type: 'separator' },
    { label: t('Quitter'), click: () => app.quit() },
  ]));
  tray.on('click', () => { windowMod.reveal(); core.send('toggle'); });
  core.events.on('config', (c, before) => { if (c.language !== before.language) rebuild(); });
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
  registerClipShortcut();
  update.start();
  notifs.start();
  privacy.start();
  bluetooth.start();
  screenshot.start(windowMod);
  downloads.start();
  // Dev : FOLLET_MEM=1 journalise la memoire par processus toutes les 15 s
  if (process.env.FOLLET_MEM) setInterval(() => {
    const by = {}; for (const m of app.getAppMetrics()) by[m.type] = (by[m.type] || 0) + Math.round((m.memory.privateBytes || m.memory.workingSetSize) / 1024);
    core.log('info', '[mem]', JSON.stringify({ ...by, heap: Math.round(process.memoryUsage().heapUsed / 1048576), rss: Math.round(process.memoryUsage().rss / 1048576) }));
  }, 15000);
});
app.on('second-instance', () => { windowMod.reveal(); core.send('toggle'); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// Reglages : lecture/ecriture de la config depuis l'interface, ecrans, disques, demarrage avec Windows.
const { ipcMain, screen, app } = require('electron');
const fs = require('fs');
const { execFile } = require('child_process');
const core = require('./core');

const REG = require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const LOGIN = { path: process.execPath, args: app.isPackaged ? [] : [core.APP_DIR], name: 'Follet' };

function loginEnabled() {
  return new Promise((resolve) => execFile(REG, ['query', RUN_KEY, '/v', 'Follet'], { windowsHide: true }, (err) => resolve(!err)));
}
function setLogin(on) {
  app.setLoginItemSettings({ ...LOGIN, openAtLogin: on });
  return loginEnabled();
}

// Ancien nom (Island) : on remplace son entree de demarrage par celle de Follet
execFile(REG, ['query', RUN_KEY, '/v', 'Island'], { windowsHide: true }, (err) => {
  if (err) return;
  execFile(REG, ['delete', RUN_KEY, '/v', 'Island', '/f'], { windowsHide: true }, () => setLogin(true));
});

// Version installee : si l'entree de demarrage pointe ailleurs (dossier de dev, ancien chemin
// d'installation), on la refait vers cet exe.
if (app.isPackaged) execFile(REG, ['query', RUN_KEY, '/v', 'Follet'], { windowsHide: true }, (err, out) => {
  if (!err && !String(out).toLowerCase().includes(process.execPath.toLowerCase())) {
    core.log('info', 'demarrage : entree corrigee vers', process.execPath);
    setLogin(true);
  }
});

function displays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id), primary: d.id === primary,
    label: `${d.internal ? 'Écran intégré' : 'Écran ' + (i + 1)} · ${d.size.width}×${d.size.height}${d.id === primary ? ' (principal)' : ''}`,
  }));
}
function drives() {
  const out = [];
  for (let c = 65; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { fs.statfsSync(d); out.push(d); } catch { } }
  return out;
}

ipcMain.handle('config-get', async () => ({
  config: core.config, displays: displays(), drives: drives(), login: await loginEnabled(),
  version: app.getVersion(), dataDir: core.DATA,
}));
ipcMain.handle('config-set', (_e, patch) => core.setConfig(patch));
ipcMain.handle('login-set', (_e, on) => setLogin(!!on));

module.exports = { loginEnabled, setLogin };

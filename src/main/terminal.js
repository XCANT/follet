// Terminal integre : un shell (pwsh par defaut) dans un pseudo-terminal, affiche par xterm.js.
const { ipcMain, app } = require('electron');
const os = require('os');
const core = require('./core');

let pty = null;
ipcMain.handle('pty-start', (_e, cols, rows) => {
  if (pty) return true;
  const nodePty = require('@lydell/node-pty');
  pty = nodePty.spawn(core.config.shell || 'pwsh.exe', ['-NoLogo'], {
    name: 'xterm-256color', cols: cols || 100, rows: rows || 24, cwd: os.homedir(),
    env: { ...process.env, TERM_PROGRAM: 'island' },
  });
  pty.onData((d) => core.send('pty-data', d));
  pty.onExit(() => { pty = null; core.send('pty-exit'); });
  return true;
});
ipcMain.on('pty-write', (_e, d) => pty && pty.write(d));
ipcMain.on('pty-resize', (_e, c, r) => { try { pty && pty.resize(c, r); } catch { } });
app.on('before-quit', () => { try { pty && pty.kill(); } catch { } });

// Presse-papiers, lanceur d'applis, etagere de fichiers, raccourcis systeme et alimentation.
const { ipcMain, clipboard, shell, app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const core = require('./core');

// ---------- presse-papiers (en memoire seulement, jamais sur le disque) ----------
let clips = [];
let lastClip = clipboard.readText();
setInterval(() => {
  const t = clipboard.readText();
  if (t === lastClip) return;
  lastClip = t;
  if (!t || !t.trim()) return;
  clips = [{ text: t, at: Date.now() }, ...clips.filter((c) => c.text !== t)].slice(0, 50);
  core.send('clip-update', clips);
}, 700);
ipcMain.handle('clip-list', () => clips);
ipcMain.handle('clip-copy', (_e, text) => { lastClip = text; clipboard.writeText(text); return true; });
ipcMain.handle('clip-remove', (_e, at) => { clips = clips.filter((c) => c.at !== at); return clips; });
ipcMain.handle('clip-clear', () => { clips = []; return clips; });

// ---------- applis (raccourcis du menu Demarrer) ----------
let appsCache = null;
function scanStartMenu() {
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];
  const skip = /uninstall|désinstaller|desinstaller|readme|help|aide|documentation|web ?site|site web|licen[cs]e|manual|manuel|release notes|recovery/i;
  const out = new Map();
  const walk = (dir, depth) => {
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
  };
  roots.forEach((r) => walk(r, 0));
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
const iconCache = new Map();
async function iconFor(p, size = 'large') {
  const key = p + size;
  if (iconCache.has(key)) return iconCache.get(key);
  let target = p;
  if (p.toLowerCase().endsWith('.lnk')) { try { target = shell.readShortcutLink(p).target || p; } catch { } }
  let img = null;
  try { img = await app.getFileIcon(target, { size }); } catch { }
  if ((!img || img.isEmpty()) && target !== p) { try { img = await app.getFileIcon(p, { size }); } catch { } }
  iconCache.set(key, img);
  return img;
}
ipcMain.handle('apps-list', () => { appsCache ||= scanStartMenu(); return { apps: appsCache, favorites: core.state.favorites }; });
ipcMain.handle('app-icon', async (_e, p) => { const i = await iconFor(p); return i && !i.isEmpty() ? i.toDataURL() : null; });
ipcMain.handle('app-launch', (_e, p) => shell.openPath(p));
ipcMain.handle('app-fav', (_e, p, on) => {
  core.state.favorites = core.state.favorites.filter((f) => f !== p);
  if (on) core.state.favorites.push(p);
  core.saveState(); return core.state.favorites;
});

// ---------- etagere : fichiers deposes sur l'island ----------
function shelfInfo(p) {
  try { const st = fs.statSync(p); return { path: p, name: path.basename(p), size: st.isDirectory() ? null : st.size, dir: st.isDirectory(), exists: true }; }
  catch { return { path: p, name: path.basename(p), exists: false }; }
}
ipcMain.handle('shelf-list', () => core.state.shelf.map((s) => ({ ...shelfInfo(s.path), addedAt: s.addedAt })));
ipcMain.handle('shelf-add', (_e, paths) => {
  const known = new Set(core.state.shelf.map((s) => s.path));
  for (const p of paths) if (p && !known.has(p)) core.state.shelf.unshift({ path: p, addedAt: Date.now() });
  core.state.shelf = core.state.shelf.slice(0, 40);
  core.saveState();
  return core.state.shelf.map((s) => ({ ...shelfInfo(s.path), addedAt: s.addedAt }));
});
ipcMain.handle('shelf-remove', (_e, p) => { core.state.shelf = core.state.shelf.filter((s) => s.path !== p); core.saveState(); return true; });
ipcMain.handle('shelf-clear', () => { core.state.shelf = []; core.saveState(); return true; });
ipcMain.handle('shelf-icon', async (_e, p) => { const i = await iconFor(p, 'normal'); return i && !i.isEmpty() ? i.toDataURL() : null; });
ipcMain.handle('shelf-open', (_e, p) => shell.openPath(p));
ipcMain.handle('shelf-reveal', (_e, p) => { shell.showItemInFolder(p); return true; });
// Glisser un fichier de l'etagere vers une autre appli
ipcMain.on('shelf-drag', async (e, paths) => {
  const files = (Array.isArray(paths) ? paths : [paths]).filter((p) => fs.existsSync(p));
  if (!files.length) return;
  let icon = await iconFor(files[0], 'normal');
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(path.join(core.RENDERER, 'icon.png')).resize({ width: 32 });
  e.sender.startDrag({ files, file: files[0], icon });
});

// ---------- raccourcis systeme ----------
ipcMain.handle('open-uri', (_e, uri) => {
  // Seulement des schemas connus et sans danger, ou des exe Windows de la liste
  if (/^(ms-settings:|ms-screenclip:|ms-actioncenter:|ms-clock:|ms-availablenetworks:|ms-settings-bluetooth:)/.test(uri)) return shell.openExternal(uri);
  const allowed = { taskmgr: 'taskmgr.exe', explorer: 'explorer.exe', calc: 'calc.exe', terminal: 'wt.exe', notepad: 'notepad.exe' };
  if (allowed[uri]) { spawn(allowed[uri], [], { detached: true, stdio: 'ignore' }).unref(); return true; }
  return false;
});
ipcMain.handle('open-data-folder', () => shell.openPath(core.DATA));

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

// Presse-papiers, lanceur d'applis, etagere de fichiers, raccourcis systeme et alimentation.
const { ipcMain, clipboard, shell, app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const core = require('./core');

// ---------- presse-papiers ----------
// L'historique reste en memoire (jamais sur le disque) ; seuls les elements epingles sont gardes
// dans state.json. Le helper donne le numero de sequence du presse-papiers : on ne relit (surtout les
// images, couteuses) que quand il change.
let clips = [];                 // { type: 'text', text, at } | { type: 'image', thumb, w, h, at }
const images = new Map();       // at -> nativeImage (memoire seulement)
let lastSeq = -1, lastText = clipboard.readText(), lastImgSig = null, pasteTarget = null;
const MAX_IMAGES = 8;
const publicList = () => clips;
function pushClip(item) {
  clips = [item, ...clips.filter((c) => (item.type === 'text' ? c.text !== item.text : c.sig !== item.sig))].slice(0, 50);
  const keep = new Set(clips.filter((c) => c.type === 'image').slice(0, MAX_IMAGES).map((c) => c.at));
  clips = clips.filter((c) => c.type !== 'image' || keep.has(c.at));
  for (const at of images.keys()) if (!keep.has(at)) images.delete(at);
  core.send('clip-update', publicList());
}
async function pollClipboard() {
  const helper = require('./helper');
  let seq = 0;
  if (helper.ready && helper.kind === 'exe') seq = await helper.call('clip-seq', null, 2000).catch(() => 0);
  if (seq && seq === lastSeq) return;
  lastSeq = seq;
  const formats = clipboard.availableFormats();
  const t = clipboard.readText();
  if (t && t.trim() && t !== lastText) { lastText = t; return pushClip({ type: 'text', text: t, at: Date.now() }); }
  if (!t && seq && formats.some((f) => f.startsWith('image/'))) {
    const img = clipboard.readImage(); if (img.isEmpty()) return;
    const { width: w, height: h } = img.getSize();
    const thumb = img.resize(w > h ? { width: Math.min(w, 320) } : { height: Math.min(h, 200) }).toDataURL();
    const sig = `${w}x${h}:${thumb.length}:${thumb.slice(-48)}`;
    if (sig === lastImgSig) return;
    lastImgSig = sig;
    const at = Date.now(); images.set(at, img);
    pushClip({ type: 'image', thumb, w, h, sig, at });
  }
}
setInterval(() => pollClipboard().catch(() => { }), 700);

function writeClip(item) {
  if (item.type === 'image') { const img = images.get(item.at); if (!img) return false; lastImgSig = item.sig; clipboard.writeImage(img); }
  else { lastText = item.text; clipboard.writeText(item.text); }
  return true;
}
const findClip = (ref) => (typeof ref === 'string' ? { type: 'text', text: ref } : clips.find((c) => c.at === ref) || null);
ipcMain.handle('clip-list', () => ({ clips: publicList(), pins: core.state.pins || [], canPaste: !!pasteTarget }));
ipcMain.handle('clip-copy', (_e, ref) => { const c = findClip(ref); return c ? writeClip(c) : false; });
// colle dans la fenetre ou l'on etait avant d'ouvrir l'historique (Ctrl+Alt+V)
ipcMain.handle('clip-paste', async (_e, ref) => {
  const c = findClip(ref); if (!c || !writeClip(c)) return false;
  const target = pasteTarget; pasteTarget = null;
  if (!target) return false;
  return require('./helper').call('paste', target, 4000).catch(() => false);
});
ipcMain.handle('clip-remove', (_e, at) => { clips = clips.filter((c) => c.at !== at); images.delete(at); return publicList(); });
ipcMain.handle('clip-clear', () => { clips = []; images.clear(); return publicList(); });
ipcMain.handle('clip-pin', (_e, text) => {
  const pins = (core.state.pins || []).filter((t) => t !== text);
  core.state.pins = [text, ...pins].slice(0, 30); core.saveState(); return core.state.pins;
});
ipcMain.handle('clip-unpin', (_e, text) => { core.state.pins = (core.state.pins || []).filter((t) => t !== text); core.saveState(); return core.state.pins; });
ipcMain.handle('open-url', (_e, url) => (/^https?:\/\//i.test(url) ? shell.openExternal(url).then(() => true) : false));
function setPasteTarget(hwnd) { pasteTarget = hwnd || null; }

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
        if (skip.test(name) || out.has(name.toLowerCase())) continue;
        // raccourci mort (programme desinstalle) : on ne l'affiche pas
        if (/\.lnk$/i.test(e.name)) { try { const t = shell.readShortcutLink(p).target; if (t && /^[a-z]:\\/i.test(t) && !fs.existsSync(t)) continue; } catch { } }
        out.set(name.toLowerCase(), { name, path: p });
      }
    }
  };
  roots.forEach((r) => walk(r, 0));
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
// Icones : Windows echoue souvent quand on lui en demande des dizaines a la fois,
// donc file d'attente (4 en parallele), une seconde tentative, et on ne garde en cache que les succes.
const iconCache = new Map();
let iconBusy = 0;
const iconQueue = [];
function iconSlot() { return new Promise((r) => { if (iconBusy < 4) { iconBusy++; r(); } else iconQueue.push(r); }); }
function iconFree() { const next = iconQueue.shift(); if (next) next(); else iconBusy--; }
async function tryIcon(file, size) { try { const i = await app.getFileIcon(file, { size }); return i && !i.isEmpty() ? i : null; } catch { return null; } }
async function iconFor(p, size = 'large') {
  const key = p + size;
  if (iconCache.has(key)) return iconCache.get(key);
  await iconSlot();
  try {
    let target = null, iconPath = null;
    if (p.toLowerCase().endsWith('.lnk')) { try { const l = shell.readShortcutLink(p); target = l.target; iconPath = l.icon; } catch { } }
    // ordre : la cible, l'icone .ico declaree par le raccourci, puis le raccourci lui-meme (raccourcis "annonces", Store)
    // (une icone dans une DLL n'est pas retenue : Electron ne sait pas choisir l'index et rendrait l'icone generique de la DLL)
    let img = null;
    for (const f of [target, /\.ico$/i.test(iconPath || '') ? iconPath : null, p].filter((x, i, a) => x && a.indexOf(x) === i && (x === p || fs.existsSync(x)))) {
      img = await tryIcon(f, size) || await tryIcon(f, size);
      if (img) break;
    }
    if (img) iconCache.set(key, img);
    return img;
  } finally { iconFree(); }
}
ipcMain.handle('apps-list', () => { appsCache ||= scanStartMenu(); return { apps: appsCache, favorites: core.state.favorites }; });
ipcMain.handle('app-icon', async (_e, p) => { const i = await iconFor(p); return i && !i.isEmpty() ? i.toDataURL() : null; });
ipcMain.handle('app-launch', (_e, p) => shell.openPath(p));
ipcMain.handle('app-fav', (_e, p, on) => {
  core.state.favorites = core.state.favorites.filter((f) => f !== p);
  if (on) core.state.favorites.push(p);
  core.saveState(); return core.state.favorites;
});

// ---------- etagere : fichiers deposes sur l'encoche ----------
function shelfInfo(p) {
  try { const st = fs.statSync(p); return { path: p, name: path.basename(p), size: st.isDirectory() ? null : st.size, dir: st.isDirectory(), exists: true }; }
  catch { return { path: p, name: path.basename(p), exists: false }; }
}
ipcMain.handle('shelf-list', () => core.state.shelf.map((s) => ({ ...shelfInfo(s.path), addedAt: s.addedAt })));
function shelfAdd(paths) {
  const known = new Set(core.state.shelf.map((s) => s.path));
  for (const p of paths) if (p && !known.has(p)) core.state.shelf.unshift({ path: p, addedAt: Date.now() });
  core.state.shelf = core.state.shelf.slice(0, 40);
  core.saveState();
  return core.state.shelf.map((s) => ({ ...shelfInfo(s.path), addedAt: s.addedAt }));
}
ipcMain.handle('shelf-add', (_e, paths) => shelfAdd(paths));
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
function openUri(uri) {
  // Seulement des schemas connus et sans danger, ou des exe Windows de la liste
  if (/^(ms-settings:|ms-screenclip:|ms-actioncenter:|ms-clock:|ms-availablenetworks:|ms-settings-bluetooth:)/.test(uri)) return shell.openExternal(uri);
  const allowed = { taskmgr: 'taskmgr.exe', explorer: 'explorer.exe', calc: 'calc.exe', terminal: 'wt.exe', notepad: 'notepad.exe' };
  if (allowed[uri]) { spawn(allowed[uri], [], { detached: true, stdio: 'ignore' }).unref(); return true; }
  return false;
}
ipcMain.handle('open-uri', (_e, uri) => openUri(uri));

// ---------- tuiles de l'accueil ----------
// L'interface n'envoie que le numero de la tuile : ce qui est lance vient de la config, pas de la page.
ipcMain.handle('tile-run', (_e, i) => {
  const t = (core.config.tiles || [])[i];
  if (!t) return false;
  if (t.type === 'path') return shell.openPath(t.path).then((err) => !err);
  if (t.type === 'url') return /^https?:\/\//i.test(t.url) ? shell.openExternal(t.url).then(() => true) : false;
  if (t.k === 'follet:shot') return require('./screenshot').capture().then(() => true);
  if (t.k === 'follet:focus') return true;   // gere par l'interface (menu des durees)
  if (t.k === 'follet:ocr' || t.k === 'follet:color') return require('./picker').open(t.k.slice(7)).then(() => true);
  if (t.k === 'lock') { spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref(); return true; }
  return openUri(t.k);
});
ipcMain.handle('tile-pick', async (_e, folder) => {
  const { dialog } = require('electron');
  const r = await dialog.showOpenDialog({ properties: [folder ? 'openDirectory' : 'openFile'], defaultPath: folder ? app.getPath('home') : path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs') });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { type: 'path', path: p, label: path.basename(p).replace(/\.(lnk|exe|url)$/i, '') };
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

module.exports = { shelfAdd, setPasteTarget };

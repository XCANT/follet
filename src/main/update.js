// Mises a jour : compare la version avec la derniere release GitHub, telecharge l'installateur
// et le lance. Si `gh` est connecte, son jeton (envoye seulement a api.github.com) evite la limite
// de 60 requetes/heure de l'API anonyme ; sinon on interroge sans compte.
const { ipcMain, app, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('./core');

const REPO = 'XCANT/follet';
const API = `https://api.github.com/repos/${REPO}`;
const EVERY = 6 * 3600e3;

let latest = null;      // { version, notes, url, asset: {id, name, size} }
let state = 'idle';     // idle | checking | none | available | downloading | ready | error
let progress = 0, lastError = null, notified = null;

function ghToken() {
  return new Promise((resolve) => execFile('gh', ['auth', 'token'], { windowsHide: true, timeout: 5000 }, (err, out) => resolve(err ? null : String(out).trim() || null)));
}
async function api(url, accept = 'application/vnd.github+json') {
  const token = await ghToken();
  const headers = { Accept: accept, 'User-Agent': 'Follet/' + app.getVersion(), 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(r.status === 404 ? 'Aucune release trouvée' : 'GitHub ' + r.status);
  return r;
}
const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
function status() { return { state, current: app.getVersion(), latest, progress, error: lastError }; }
function push() { core.send('update-status', status()); }

async function check(manual) {
  if (state === 'downloading') return status();
  state = 'checking'; lastError = null; push();
  try {
    const rel = await (await api(API + '/releases/latest')).json();
    const v = String(rel.tag_name || '').replace(/^v/, '');
    const asset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
    latest = { version: v, notes: rel.body || '', url: rel.html_url, asset: asset && { id: asset.id, name: asset.name, size: asset.size } };
    state = newer(v, app.getVersion()) && asset ? 'available' : 'none';
    if (state === 'available' && !manual && notified !== v) { notified = v; core.send('activity', { kind: 'update', version: v }); }
  } catch (e) {
    state = 'error'; lastError = e.message;
    if (manual) core.log('warn', 'mise a jour :', e.message);
  }
  push();
  return status();
}

async function install() {
  if (!app.isPackaged || state !== 'available' || !latest || !latest.asset) return status();
  state = 'downloading'; progress = 0; push();
  try {
    const r = await api(`${API}/releases/assets/${latest.asset.id}`, 'application/octet-stream');
    const file = path.join(os.tmpdir(), latest.asset.name);
    const out = fs.createWriteStream(file);
    const total = latest.asset.size || +r.headers.get('content-length') || 0;
    let got = 0, lastPush = 0;
    for await (const chunk of r.body) {
      out.write(chunk); got += chunk.length;
      if (total) progress = got / total;
      if (Date.now() - lastPush > 250) { lastPush = Date.now(); push(); }
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    state = 'ready'; progress = 1; push();
    core.log('info', 'mise a jour : lancement de', file);
    // L'installateur remplace l'appli en place ; on quitte pour liberer les fichiers.
    await shell.openPath(file);
    setTimeout(() => app.quit(), 800);
  } catch (e) {
    state = 'error'; lastError = e.message; push();
  }
  return status();
}

ipcMain.handle('update-status', () => status());
ipcMain.handle('update-check', () => check(true));
ipcMain.handle('update-install', () => install());

function start() {
  if (!app.isPackaged) { state = 'none'; return; }    // en dev, on ne propose rien
  setTimeout(() => check(false), 20e3);
  setInterval(() => check(false), EVERY);
}

module.exports = { start, check };

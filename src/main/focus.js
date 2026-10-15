// Mode concentration : l'encoche ne s'elargit plus pour les notifications, chansons, appareils, telechargements,
// pluie et alertes de chauffe. Restent : minuteurs, rappels d'agenda, batterie faible et ce que tu declenches toi-meme.
// until : 0 = desactive, -1 = jusqu'a ce qu'on le coupe, sinon une date (ms). Garde dans state.json.
const { ipcMain } = require('electron');
const core = require('./core');

let timer = null;
const until = () => core.state.focusUntil || 0;
const active = () => until() === -1 || until() > Date.now();

function set(v) {
  // v : minutes, 'morning' (demain 7 h), 'always' ou 0
  let u = 0;
  if (v === 'always') u = -1;
  else if (v === 'morning') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); u = d.getTime(); }
  else if (+v > 0) u = Date.now() + +v * 60000;
  core.state.focusUntil = u; core.saveState();
  schedule();
  core.send('focus', u);
  return u;
}
function schedule() {
  clearTimeout(timer);
  const u = until();
  if (u > 0) timer = setTimeout(() => { if (until() === u) set(0); }, Math.min(u - Date.now(), 2 ** 31 - 1));
}
if (until() > 0 && !active()) { core.state.focusUntil = 0; core.saveState(); }
schedule();

ipcMain.handle('focus-get', () => (active() ? until() : 0));
ipcMain.handle('focus-set', (_e, v) => set(v));

module.exports = { set, active, get until() { return active() ? until() : 0; } };

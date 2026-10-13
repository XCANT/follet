// Indicateur de confidentialite : quelles applis enregistrent un micro en ce moment (sessions de capture
// WASAPI lues par le helper). L'interface affiche un point orange dans l'encoche tant que c'est le cas,
// et une activite quand une nouvelle appli commence.
const { ipcMain } = require('electron');
const core = require('./core');
const helper = require('./helper');

let users = [], busy = false;
const key = (list) => list.map((u) => u.name).sort().join('|');

async function poll() {
  if (busy || !helper.ready) return;
  if (core.config.activities.mic === false) { if (users.length) { users = []; core.send('mic', users); } return; }
  busy = true;
  try {
    const list = (await helper.call('mic-users', null, 4000) || []).filter((u) => u.pid !== process.pid && !/^follet/i.test(u.name));
    // une meme appli peut avoir plusieurs processus : une entree par nom
    const now = [...new Map(list.map((u) => [u.name, { name: u.name, label: u.label }])).values()];
    if (key(now) === key(users)) return;
    const fresh = now.filter((u) => !users.some((x) => x.name === u.name));
    users = now;
    core.send('mic', users);
    if (fresh.length) core.send('activity', { kind: 'mic', apps: fresh.map((u) => u.label) });
  } catch { } finally { busy = false; }
}

ipcMain.handle('mic-get', () => users);

function start() { setInterval(poll, 2000); }
module.exports = { start };

// Appareils Bluetooth connectes (casque, manette, souris...) et leur batterie, lus par le helper.
// Une activite quand un appareil se connecte ou se deconnecte, une alerte quand sa batterie faiblit.
const { ipcMain } = require('electron');
const core = require('./core');
const helper = require('./helper');

let devices = null, busy = false;
const warned = new Set();

async function poll() {
  if (busy || !helper.ready) return;
  busy = true;
  try {
    const list = await helper.call('bt', null, 8000) || [];
    const before = devices;
    devices = list;
    core.send('bt', devices);
    // premier releve : l'etat de depart, sans annonce
    if (!before || core.config.activities.bluetooth === false) return;
    for (const d of list) {
      const was = before.find((x) => x.id === d.id);
      if (!was) core.send('activity', { kind: 'bt', name: d.name, battery: d.battery, category: d.category, on: true });
      else if (d.battery != null && d.battery <= 15 && !warned.has(d.id)) { warned.add(d.id); core.send('activity', { kind: 'bt', name: d.name, battery: d.battery, category: d.category, low: true }); }
      if (d.battery != null && d.battery > 20) warned.delete(d.id);
    }
    for (const d of before) if (!list.some((x) => x.id === d.id)) core.send('activity', { kind: 'bt', name: d.name, category: d.category, on: false });
  } catch { } finally { busy = false; }
}

ipcMain.handle('bt-get', () => devices || []);

function start() { setInterval(poll, 3000); setTimeout(poll, 1500); }
module.exports = { start };

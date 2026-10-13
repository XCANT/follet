// Notifications Windows : lues dans le centre de notifications (UserNotificationListener via helper.ps1)
// et rejouees dans l'encoche. Astuce : couper les "bannieres" d'une appli dans Windows et laisser
// ses notifications aller au centre ; Follet les affiche a la place.
const { ipcMain } = require('electron');
const core = require('./core');
const helper = require('./helper');

let since = Date.now(), recent = [], access = null, busy = false;

async function poll() {
  if (busy || core.config.activities.notif === false) return;
  busy = true;
  try {
    const r = await helper.call('notifs', since, 8000);
    access = r.access;
    // on oublie celles qui ont quitte le centre de notifications
    const present = new Set(r.ids || []);
    const before = recent.length;
    recent = recent.filter((n) => present.has(n.id));
    for (const n of (r.items || []).sort((a, b) => a.time - b.time)) {
      since = Math.max(since, n.time);
      if (recent.some((x) => x.id === n.id)) continue;
      if ((core.config.notifMuted || []).includes(n.appId)) continue;
      recent.unshift(n);
      core.send('activity', { kind: 'notif', id: n.id, app: n.app, appId: n.appId, title: n.title, body: n.body, logo: n.logo });
    }
    recent = recent.slice(0, 30);
    if (recent.length !== before || (r.items || []).length) core.send('notifs', recent);
  } catch { } finally { busy = false; }
}

ipcMain.handle('notifs-get', () => ({ access, list: recent }));
ipcMain.handle('notif-remove', async (_e, id) => { recent = recent.filter((n) => n.id !== id); core.send('notifs', recent); return helper.call('notif-remove', id).catch(() => false); });

function start() { setInterval(poll, 1500); }
module.exports = { start };

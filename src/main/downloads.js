// Telechargements en direct : surveille le dossier Telechargements. Pendant un telechargement, les
// navigateurs ecrivent un fichier temporaire (.crdownload pour Chrome/Edge/Brave, .part pour Firefox)
// renomme a la fin. L'encoche montre la taille recue et la vitesse, puis le fichier va dans l'etagere.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const core = require('./core');
const { shelfAdd } = require('./tools');

const TEMP_EXT = /\.(crdownload|part)$/i;
const active = new Map();   // fichier temporaire -> { name, bytes, at, speed, t0 }
let dir = null, timer = null;

// "Unconfirmed 123456.crdownload" : nom provisoire de Chrome avant de connaitre le vrai nom
const finalName = (f) => f.replace(TEMP_EXT, '');
const provisional = (f) => /^Unconfirmed \d+\.crdownload$/i.test(f);

function scan() {
  let files;
  try { files = fs.readdirSync(dir); } catch { return; }
  const now = Date.now();
  for (const f of files) {
    if (!TEMP_EXT.test(f) || active.has(f)) continue;
    let st; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
    if (now - st.mtimeMs > 60e3) continue;                 // reste d'un vieux telechargement abandonne
    active.set(f, { name: finalName(f), bytes: st.size, at: now, speed: 0, t0: now });
    if (!provisional(f) && core.config.activities.downloads !== false) core.send('activity', { kind: 'download', name: finalName(f), start: true });
  }
  for (const [f, d] of active) {
    const p = path.join(dir, f);
    let st = null; try { st = fs.statSync(p); } catch { }
    if (st) {
      const dt = (now - d.at) / 1000;
      if (dt > 0) d.speed = d.speed * 0.6 + (Math.max(0, st.size - d.bytes) / dt) * 0.4;
      d.bytes = st.size; d.at = now;
      continue;
    }
    // le fichier temporaire a disparu : termine (le vrai fichier existe) ou annule / renomme
    active.delete(f);
    const done = path.join(dir, d.name);
    let fin = null; try { fin = fs.statSync(done); } catch { }
    if (fin && !provisional(f) && core.config.activities.downloads !== false) {
      shelfAdd([done]);
      core.send('activity', { kind: 'download', name: d.name, path: done, size: fin.size, done: true });
    }
  }
  core.send('downloads', core.config.activities.downloads === false ? [] : [...active.entries()].map(([f, d]) => ({ name: provisional(f) ? null : d.name, bytes: d.bytes, speed: Math.round(d.speed) })));
  if (!active.size) { clearInterval(timer); timer = null; }
}

function kick() { if (!timer) { scan(); timer = setInterval(scan, 1000); } }

function start() {
  try { dir = app.getPath('downloads'); fs.watch(dir, { persistent: false }, (_ev, f) => { if (f && TEMP_EXT.test(f)) kick(); }); }
  catch (e) { core.log('warn', 'telechargements : ' + e.message); return; }
  kick();
}
module.exports = { start };

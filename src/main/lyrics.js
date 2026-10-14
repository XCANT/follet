// Paroles synchronisees depuis LRCLIB (lrclib.net : base ouverte et gratuite, sans cle). Une requete par
// chanson, gardee en memoire. Les titres de videos ("Artiste - Titre (Official Video)") sont nettoyes.
const { ipcMain } = require('electron');
const core = require('./core');

const cache = new Map();
const HEADERS = { 'User-Agent': 'Follet (https://github.com/XCANT/follet)' };

const clean = (s) => (s || '')
  .replace(/\s*[([](official|offical|lyric|lyrics|audio|video|music video|clip officiel|visualizer|hd|4k|remaster(ed)?)[^)\]]*[)\]]/gi, '')
  .replace(/\s*-\s*(topic|youtube)$/i, '').replace(/\s+/g, ' ').trim();

function parse(lrc) {
  const out = [];
  for (const line of lrc.split('\n')) {
    const text = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim();
    for (const m of line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

async function query(params) {
  const r = await fetch('https://lrclib.net/api/get?' + new URLSearchParams(params), { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('lrclib ' + r.status);
  return r.json();
}

async function find(artist, title, duration) {
  const tries = [[clean(artist), clean(title)]];
  // video YouTube : l'artiste est souvent dans le titre, et la chaine n'est pas l'artiste
  const dash = clean(title).split(/\s+[-–—]\s+/);
  if (dash.length === 2) tries.push([dash[0], dash[1]]);
  for (const [a, t] of tries) {
    if (!a || !t) continue;
    const p = { artist_name: a, track_name: t };
    if (duration > 0) p.duration = Math.round(duration);
    let r = await query(p);
    if (!r && p.duration) { delete p.duration; r = await query(p); }   // la duree varie d'une source a l'autre
    if (r) return r;
  }
  return null;
}

ipcMain.handle('lyrics-get', async (_e, { artist, title, duration }) => {
  if (core.config.activities.lyrics === false || !title) return null;
  const key = `${artist}|${title}`;
  if (cache.has(key)) return cache.get(key);
  let res = null;
  try {
    const r = await find(artist, title, duration);
    if (r && r.syncedLyrics) res = { lines: parse(r.syncedLyrics) };
    else if (r && r.instrumental) res = { instrumental: true };
  } catch { return null; }                     // erreur reseau : on reessaiera a la prochaine chanson
  cache.set(key, res);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return res;
});

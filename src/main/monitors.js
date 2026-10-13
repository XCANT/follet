// Surveille la musique, le volume, la sortie audio et la batterie.
// Envoie l'etat a l'interface et declenche les "activites en direct" (l'encoche s'elargit quelques secondes).
const { ipcMain, powerMonitor } = require('electron');
const core = require('./core');
const helper = require('./helper');
const theme = require('./theme');

const act = (kind, data) => { if (core.config.activities[kind] !== false) core.send('activity', { kind, ...data }); };

// ---------- musique ----------
let media = { present: false }, thumb = null, thumbVer = null, mediaKey = null, posBase = null;
async function pollMedia() {
  // on dit au helper quelle version de la pochette on a deja : il ne renvoie l'image que si elle a change
  const m = await helper.call('media', thumbVer);
  if (!m.present) {
    if (media.present) { media = m; thumb = null; thumbVer = null; mediaKey = null; theme.setArt(null); core.send('media', media); }
    return;
  }
  const trackChanged = m.key !== mediaKey;
  if (m.thumbVer !== thumbVer) { thumbVer = m.thumbVer; thumb = m.thumb || null; theme.setArt(thumb); }
  // Position : certaines applis ne mettent a jour la ligne de temps qu'aux changements d'etat
  if (!posBase || posBase.raw !== m.position || trackChanged) posBase = { raw: m.position, at: Date.now() };
  const playing = m.status === 'Playing';
  const position = Math.min(m.duration || Infinity, posBase.raw + (playing ? (Date.now() - posBase.at) / 1000 : 0));
  media = { ...m, thumb, position, appName: appLabel(m.app) };
  // nouvelle chanson (pas au tout premier releve)
  // la nouvelle pochette arrive un peu apres le titre : on attend avant d'annoncer la chanson
  if (trackChanged && mediaKey !== null && playing) { const key = m.key; setTimeout(() => { if (mediaKey === key) act('media', { title: m.title, artist: m.artist, thumb }); }, 1200); }
  mediaKey = m.key;
  core.send('media', media);
}
function appLabel(id) {
  if (!id) return '';
  const known = { 'youtube-music': 'YouTube Music', spotify: 'Spotify', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', zunemusic: 'Lecteur multimédia', vlc: 'VLC', discord: 'Discord', applemusic: 'Apple Music', deezer: 'Deezer', tidal: 'TIDAL' };
  const low = id.toLowerCase();
  for (const k in known) if (low.includes(k)) return known[k];
  return id.split(/[!\\]/).filter(Boolean).pop().replace(/\.exe$/i, '');
}

// ---------- volume ----------
let volume = null, volumeSetAt = 0;
async function pollVolume() {
  const v = await helper.call('volume');
  if (volume && (v.level !== volume.level || v.muted !== volume.muted)) {
    if (Date.now() - volumeSetAt > 1200) act('volume', v);     // change venu d'ailleurs (touches, Windows...)
    core.send('volume', v);
  } else if (!volume) core.send('volume', v);
  volume = v;
}

// ---------- sortie audio ----------
let audioDevice = null;
async function pollAudioDevice() {
  const d = await helper.call('audio-device');
  if (audioDevice && d.id !== audioDevice.id) act('audioDevice', { name: d.name });
  audioDevice = d;
}

// ---------- batterie ----------
let battery = null, lowWarned = 100;
async function pollBattery() {
  const b = await helper.call('battery');
  if (!b.present) { battery = b; return; }
  if (battery && b.plugged !== battery.plugged) act('battery', { plugged: b.plugged, percent: b.percent });
  if (!b.plugged) {
    for (const t of [20, 10, 5]) if (b.percent <= t && lowWarned > t) { lowWarned = t; act('battery', { low: true, percent: b.percent }); break; }
  } else lowWarned = 100;
  battery = b;
  core.send('battery', b);
}

function loop(fn, ms) { const run = () => fn().catch(() => { }).finally(() => setTimeout(run, typeof ms === 'function' ? ms() : ms)); setTimeout(run, 800); }
function start() {
  loop(pollMedia, 1000);
  loop(pollVolume, 350);
  loop(pollAudioDevice, 2500);
  loop(pollBattery, 30000);
  powerMonitor.on('on-ac', () => pollBattery().catch(() => { }));
  powerMonitor.on('on-battery', () => pollBattery().catch(() => { }));
}

// ---------- commandes depuis l'interface ----------
ipcMain.handle('media-get', () => media);
ipcMain.handle('media-cmd', async (_e, c) => { await helper.call('media-cmd', c); setTimeout(() => pollMedia().catch(() => { }), 250); return true; });
ipcMain.handle('media-seek', async (_e, s) => { await helper.call('media-seek', s); posBase = null; return true; });
ipcMain.handle('volume-get', () => volume);
ipcMain.handle('volume-set', async (_e, v) => { volumeSetAt = Date.now(); await helper.call('volume-set', v); if (volume && volume.muted) await helper.call('mute', false); return true; });
ipcMain.handle('mute', async (_e, m) => { volumeSetAt = Date.now(); await helper.call('mute', m); return true; });
ipcMain.handle('media-shuffle', async (_e, on) => { await helper.call('media-shuffle', on); setTimeout(() => pollMedia().catch(() => { }), 250); return true; });
ipcMain.handle('media-repeat', async (_e, mode) => { await helper.call('media-repeat', mode); setTimeout(() => pollMedia().catch(() => { }), 250); return true; });
ipcMain.handle('audio-devices', () => helper.call('audio-devices'));
ipcMain.handle('audio-set', async (_e, id) => { await helper.call('audio-set', id); await pollAudioDevice().catch(() => { }); return true; });
ipcMain.handle('radios', () => helper.call('radios', null, 10000));
ipcMain.handle('radio-set', (_e, kind, on) => helper.call('radio-set', { kind, on }, 10000));
ipcMain.handle('battery-get', () => battery);
ipcMain.handle('brightness-get', () => helper.call('brightness', null, 15000));
ipcMain.handle('brightness-set', (_e, id, value) => helper.call('brightness-set', { id, value }));

module.exports = { start };

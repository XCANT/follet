// Couleurs dynamiques Material You (material-color-utilities de Google).
// Source : la pochette en cours, la couleur d'accent de Windows ou une couleur choisie.
const { nativeImage, systemPreferences } = require('electron');
const core = require('./core');

let mcu = null;
const load = async () => (mcu ||= await import('@material/material-color-utilities'));

const VARIANTS = { tonal: 'SchemeTonalSpot', vibrant: 'SchemeVibrant', expressive: 'SchemeExpressive', fidelity: 'SchemeFidelity', content: 'SchemeContent', neutral: 'SchemeNeutral', mono: 'SchemeMonochrome' };
const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'onSurface', 'onSurfaceVariant', 'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'primaryFixedDim', 'tertiaryFixedDim',
];
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

function accentArgb() {
  try { const h = systemPreferences.getAccentColor(); return (0xff000000 | parseInt(h.slice(0, 6), 16)) >>> 0; } catch { return 0xff6750a4; }
}
function hexArgb(hex) { return (0xff000000 | parseInt(String(hex).replace('#', '').slice(0, 6), 16)) >>> 0; }

async function seedFromImage(dataUrl) {
  const m = await load();
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) return null;
  const bmp = img.resize({ width: 64, quality: 'good' }).toBitmap();   // BGRA
  const pixels = [];
  for (let i = 0; i < bmp.length; i += 4) {
    if (bmp[i + 3] < 255) continue;
    pixels.push(((0xff << 24) | (bmp[i + 2] << 16) | (bmp[i + 1] << 8) | bmp[i]) >>> 0);
  }
  if (!pixels.length) return null;
  const ranked = m.Score.score(m.QuantizerCelebi.quantize(pixels, 128));
  return ranked[0];
}

async function tokensFor(seed, variant) {
  const m = await load();
  const Scheme = m[VARIANTS[variant] || VARIANTS.tonal];
  const scheme = new Scheme(m.Hct.fromInt(seed), true, 0);
  const vars = {};
  for (const r of ROLES) { const dc = m.MaterialDynamicColors[r]; if (dc) vars['--md-' + kebab(r)] = m.hexFromArgb(dc.getArgb(scheme)); }
  vars['--md-seed'] = m.hexFromArgb(seed);
  return vars;
}

let currentArt = null, lastKey = '';
async function apply() {
  const t = core.config.theme || {};
  let seed = null, source = t.source;
  if (t.source === 'art' && currentArt) seed = await seedFromImage(currentArt).catch(() => null);
  if (seed == null) seed = t.source === 'custom' ? hexArgb(t.color) : accentArgb();
  if (seed == null) { seed = accentArgb(); source = 'accent'; }
  const key = seed + '|' + t.variant;
  if (key === lastKey) return;
  lastKey = key;
  core.send('theme', await tokensFor(seed, t.variant), { source });
}

// La pochette change : on recolore si la source est "pochette"
function setArt(dataUrl) { currentArt = dataUrl || null; if ((core.config.theme || {}).source === 'art') apply().catch(() => { }); }
systemPreferences.on?.('accent-color-changed', () => apply().catch(() => { }));
core.events.on('config', (c, before) => { if (JSON.stringify(c.theme) !== JSON.stringify(before.theme)) { lastKey = ''; apply().catch(() => { }); } });

module.exports = { apply: () => { lastKey = ''; return apply(); }, setArt };

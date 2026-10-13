// IA : chaque utilisateur choisit son fournisseur.
//  - Claude Code (CLI, l'abonnement de l'utilisateur)
//  - Claude via l'API Anthropic (SDK officiel)
//  - Tout ce qui parle le format OpenAI : OpenAI, Gemini, Ollama (local), OpenRouter, LM Studio, perso
// Les cles d'API sont chiffrees par Windows (safeStorage / DPAPI) dans %APPDATA%\Follet\secrets.json.
const { ipcMain, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const core = require('./core');

const SYSTEM = "Tu es Follet, un petit feu follet qui vit dans l'encoche en haut de l'écran Windows de l'utilisateur. "
  + "Tu réponds dans la langue de l'utilisateur, de façon chaleureuse, concise et utile. Pas de longs préambules.";

const PROVIDERS = {
  'claude-code': { label: 'Claude Code', hint: 'Ton abonnement Claude, via la CLI', kind: 'cli', key: false },
  anthropic: { label: 'Claude (API)', hint: 'Clé API Anthropic', kind: 'anthropic', key: true, defaultModel: 'claude-opus-5-5' },
  openai: { label: 'OpenAI', hint: 'Clé API OpenAI', kind: 'openai', key: true, base: 'https://api.openai.com/v1' },
  gemini: { label: 'Gemini', hint: 'Clé API Google AI Studio', kind: 'openai', key: true, base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  ollama: { label: 'Ollama', hint: 'Local, gratuit, hors ligne', kind: 'openai', key: false, base: 'http://localhost:11434/v1' },
  openrouter: { label: 'OpenRouter', hint: 'Des centaines de modèles, une clé', kind: 'openai', key: true, base: 'https://openrouter.ai/api/v1' },
  custom: { label: 'Compatible OpenAI', hint: 'LM Studio, Groq, Mistral, serveur perso…', kind: 'openai', key: 'optional', base: '' },
};

// ---------- cles chiffrees ----------
const SECRETS = path.join(core.DATA, 'secrets.json');
const readSecrets = () => { try { return JSON.parse(fs.readFileSync(SECRETS, 'utf8')); } catch { return {}; } };
function getKey(p) {
  const s = readSecrets()[p]; if (!s) return null;
  try { return safeStorage.decryptString(Buffer.from(s, 'base64')); } catch { return null; }
}
function setKey(p, key) {
  const all = readSecrets();
  if (key) all[p] = safeStorage.encryptString(key).toString('base64'); else delete all[p];
  fs.writeFileSync(SECRETS, JSON.stringify(all, null, 2));
}

const cfg = () => core.config.ai || {};
const providerId = () => (PROVIDERS[cfg().provider] ? cfg().provider : 'claude-code');
const modelFor = (p) => (cfg().models || {})[p] || PROVIDERS[p].defaultModel || '';
const baseFor = (p) => (p === 'custom' ? cfg().customBase || '' : PROVIDERS[p].base);

// ---------- requetes ----------
let current = null;   // { abort() }
const send = (type, data) => core.send('ai-event', { type, data });

function askCli(messages) {
  const prompt = messages[messages.length - 1].content;
  const cont = messages.length > 1;
  const dir = path.join(core.DATA, 'claude-chat'); fs.mkdirSync(dir, { recursive: true });
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--append-system-prompt', SYSTEM];
  if (cont) args.push('--continue');
  const model = modelFor('claude-code'); if (model) args.push('--model', model);
  const proc = spawn(core.config.claudePath || 'claude', args, { cwd: dir, windowsHide: true, env: process.env });
  proc.stdin.end(prompt);
  current = { abort: () => proc.kill() };
  let buf = '', err = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') send('delta', m.event.delta.text);
      else if (m.type === 'result') {
        if (m.is_error) send('error', m.result || 'Erreur de Claude Code');
        const u = m.usage || {};
        record({ provider: 'claude-code', model: model || 'défaut', inp: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), out: u.output_tokens || 0, ms: m.duration_ms || 0 });
      }
    }
  });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (d) => (err += d));
  proc.on('error', (e) => { send('error', e.code === 'ENOENT' ? 'La commande « claude » est introuvable : installe Claude Code ou choisis un autre fournisseur.' : e.message); current = null; send('done'); });
  proc.on('close', (code) => { if (code && err) send('error', err.slice(-400)); current = null; send('done'); });
}

async function askAnthropic(messages) {
  const key = getKey('anthropic');
  if (!key) throw new Error('Ajoute ta clé API Anthropic dans Réglages → IA.');
  const Anthropic = require('@anthropic-ai/sdk').default;
  const client = new Anthropic({ apiKey: key });
  const model = modelFor('anthropic');
  // Repli cote serveur si le modele decline (recommande pour Opus 5.5)
  const fallback = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
  const params = {
    model, max_tokens: 16000, system: SYSTEM,
    output_config: { effort: cfg().effort || 'low' },
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const stream = fallback
    ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : client.messages.stream(params);
  current = { abort: () => stream.abort() };
  stream.on('text', (t) => send('delta', t));
  const t0 = Date.now(), final = await stream.finalMessage();
  record({ provider: 'anthropic', model: final.model || model, inp: final.usage?.input_tokens || 0, out: final.usage?.output_tokens || 0, ms: Date.now() - t0 });
  if (final.stop_reason === 'refusal') send('error', 'Claude a décliné cette demande.');
}

async function askOpenAI(p, messages) {
  const base = baseFor(p);
  if (!base) throw new Error('Indique l\'adresse du serveur dans Réglages → IA.');
  const key = getKey(p);
  if (PROVIDERS[p].key === true && !key) throw new Error(`Ajoute ta clé ${PROVIDERS[p].label} dans Réglages → IA.`);
  let model = modelFor(p);
  if (!model) { const list = await listModels(p).catch(() => []); model = list[0]; }
  if (!model) throw new Error('Choisis un modèle dans Réglages → IA.');
  const ctrl = new AbortController();
  current = { abort: () => ctrl.abort() };
  const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(p === 'openrouter' ? { 'X-Title': 'Follet' } : {}) },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages.map((m) => ({ role: m.role, content: m.content }))] }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let msg = t; try { msg = JSON.parse(t).error?.message || t; } catch { }
    throw new Error(`${PROVIDERS[p].label} : ${res.status} ${msg.slice(0, 300)}`);
  }
  const reader = res.body.getReader(), dec = new TextDecoder(), t0 = Date.now();
  let buf = '', chars = 0, usage = null;
  for (; ;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      try { const j = JSON.parse(data); const t = j.choices?.[0]?.delta?.content; if (j.usage) usage = j.usage; if (t) { chars += t.length; send('delta', t); } } catch { }
    }
  }
  // sans compte exact du serveur : ~4 caracteres par jeton
  record({ provider: p, model, inp: usage?.prompt_tokens || 0, out: usage?.completion_tokens || Math.round(chars / 4), ms: Date.now() - t0 });
}

ipcMain.handle('ai-ask', async (_e, messages) => {
  if (current) return false;
  const p = providerId();
  if (PROVIDERS[p].kind === 'cli') { askCli(messages); return true; }
  (async () => {
    try { PROVIDERS[p].kind === 'anthropic' ? await askAnthropic(messages) : await askOpenAI(p, messages); }
    catch (e) { if (e.name !== 'AbortError' && !/abort/i.test(e.message)) send('error', e.message); }
    finally { current = null; send('done'); }
  })();
  return true;
});
ipcMain.handle('ai-stop', () => { if (current) current.abort(); return true; });

// ---------- modeles et etat ----------
async function listModels(p) {
  if (p === 'claude-code') return ['sonnet', 'opus', 'haiku'];
  if (p === 'anthropic') {
    const key = getKey('anthropic'); if (!key) return [];
    const Anthropic = require('@anthropic-ai/sdk').default;
    const out = []; for await (const m of new Anthropic({ apiKey: key }).models.list()) out.push(m.id);
    return out;
  }
  const base = baseFor(p); if (!base) return [];
  const key = getKey(p);
  const res = await fetch(base.replace(/\/$/, '') + '/models', { headers: key ? { Authorization: 'Bearer ' + key } : {}, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return (j.data || j.models || []).map((m) => (m.id || m.name || '').replace(/^models\//, '')).filter(Boolean).sort();
}
ipcMain.handle('ai-models', (_e, p) => listModels(p || providerId()).catch((e) => ({ error: e.message })));
ipcMain.handle('ai-info', () => ({
  provider: providerId(), model: modelFor(providerId()), effort: cfg().effort || 'low', customBase: cfg().customBase || '',
  providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, v]) => [id, { label: v.label, hint: v.hint, key: v.key, hasKey: !!readSecrets()[id] }])),
}));
ipcMain.handle('ai-key-set', (_e, p, key) => { if (!PROVIDERS[p]) return false; setKey(p, (key || '').trim()); return true; });

// ---------- fichiers deposes sur Follet : texte seulement, taille limitee ----------
ipcMain.handle('ai-read-files', async (_e, paths) => Promise.all((paths || []).slice(0, 8).map(async (p) => {
  const name = path.basename(p);
  try {
    const st = await fs.promises.stat(p);
    if (st.isDirectory()) return { name, path: p, skip: 'dossier' };
    if (st.size > 300 * 1024) return { name, path: p, skip: 'trop gros' };
    const buf = await fs.promises.readFile(p);
    if (buf.subarray(0, 8192).includes(0)) return { name, path: p, skip: 'pas du texte' };
    return { name, path: p, text: buf.toString('utf8') };
  } catch (e) { return { name, path: p, skip: 'illisible' }; }
})));

// ---------- consommation Claude Code (journaux locaux ~/.claude/projects/**/*.jsonl) ----------
const fileCache = new Map();
ipcMain.handle('claude-usage', async () => {
  const base = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(base)) return null;
  const since = Date.now() - 7 * 864e5, files = [];
  (function walk(dir) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) { try { const st = fs.statSync(p); if (st.mtimeMs >= since) files.push({ p, mtime: st.mtimeMs }); } catch { } }
    }
  })(base);
  const seen = new Set(), all = [];
  for (const f of files) {
    let c = fileCache.get(f.p);
    if (!c || c.mtime !== f.mtime) {
      const entries = [];
      const text = await fs.promises.readFile(f.p, 'utf8').catch(() => '');
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue;
        try {
          const j = JSON.parse(line), u = j.message?.usage; if (!u || !j.timestamp) continue;
          entries.push({ key: (j.message.id || '') + ':' + (j.requestId || ''), t: Date.parse(j.timestamp), model: j.message.model || '?', out: u.output_tokens || 0, inp: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), cr: u.cache_read_input_tokens || 0, session: j.sessionId, project: j.cwd ? path.basename(j.cwd) : path.basename(path.dirname(f.p)) });
        } catch { }
      }
      c = { mtime: f.mtime, entries }; fileCache.set(f.p, c);
    }
    for (const e of c.entries) if (e.t >= since && !seen.has(e.key) && e.model !== '<synthetic>') { seen.add(e.key); all.push(e); }
  }
  all.sort((a, b) => a.t - b.t);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const T0 = today.getTime(), now = Date.now();
  const sum = (arr) => arr.reduce((a, e) => ({ out: a.out + e.out, inp: a.inp + e.inp, cr: a.cr + e.cr, n: a.n + 1 }), { out: 0, inp: 0, cr: 0, n: 0 });
  const days = [];
  for (let i = 6; i >= 0; i--) { const d0 = T0 - i * 864e5; days.push({ day: d0, ...sum(all.filter((e) => e.t >= d0 && e.t < d0 + 864e5)) }); }
  const todayE = all.filter((e) => e.t >= T0);
  const hours = Array.from({ length: 24 }, (_, h) => todayE.filter((e) => new Date(e.t).getHours() === h).reduce((s, e) => s + e.out, 0));
  // Fenetres de 5 h de l'abonnement : une fenetre commence au premier message apres la fin de la precedente
  let wStart = null;
  for (const e of all) if (wStart === null || e.t >= wStart + 5 * 3600e3) wStart = e.t;
  const inWindow = wStart !== null && now < wStart + 5 * 3600e3;
  const group = (key) => {
    const m = new Map();
    for (const e of all) { const k = e[key]; const g = m.get(k) || { name: k, out: 0, n: 0 }; g.out += e.out; g.n++; m.set(k, g); }
    return [...m.values()].sort((a, b) => b.out - a.out);
  };
  return {
    today: sum(todayE), week: sum(all), days, hours,
    window: inWindow ? { start: wStart, end: wStart + 5 * 3600e3, ...sum(all.filter((e) => e.t >= wStart)) } : null,
    sessionsToday: new Set(todayE.map((e) => e.session)).size, sessionsWeek: new Set(all.map((e) => e.session)).size,
    byModel: group('model').slice(0, 5), byProject: group('project').slice(0, 5),
    last: all.length ? all[all.length - 1].t : null,
  };
});

// ---------- ce que Follet lui-meme a consomme, tous fournisseurs confondus ----------
const USAGE = path.join(core.DATA, 'ai-usage.json');
function record(entry) {
  let list = []; try { list = JSON.parse(fs.readFileSync(USAGE, 'utf8')); } catch { }
  list.push({ t: Date.now(), ...entry });
  list = list.filter((e) => e.t > Date.now() - 30 * 864e5).slice(-2000);
  try { fs.writeFileSync(USAGE, JSON.stringify(list)); } catch { }
}
ipcMain.handle('ai-usage', () => {
  let list = []; try { list = JSON.parse(fs.readFileSync(USAGE, 'utf8')); } catch { }
  const T0 = new Date().setHours(0, 0, 0, 0);
  const pick = (arr) => ({ n: arr.length, inp: arr.reduce((s, e) => s + (e.inp || 0), 0), out: arr.reduce((s, e) => s + (e.out || 0), 0), ms: arr.length ? Math.round(arr.reduce((s, e) => s + (e.ms || 0), 0) / arr.length) : 0 });
  const p = providerId();
  return { provider: p, today: pick(list.filter((e) => e.t >= T0 && e.provider === p)), month: pick(list.filter((e) => e.provider === p)), all: pick(list) };
});
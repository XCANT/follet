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
      else if (m.type === 'result' && m.is_error) send('error', m.result || 'Erreur de Claude Code');
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
  const final = await stream.finalMessage();
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
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (; ;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      try { const j = JSON.parse(data); const t = j.choices?.[0]?.delta?.content; if (t) send('delta', t); } catch { }
    }
  }
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
          entries.push({ key: (j.message.id || '') + ':' + (j.requestId || ''), t: Date.parse(j.timestamp), model: j.message.model || '?', out: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, session: j.sessionId });
        } catch { }
      }
      c = { mtime: f.mtime, entries }; fileCache.set(f.p, c);
    }
    for (const e of c.entries) if (e.t >= since && !seen.has(e.key)) { seen.add(e.key); all.push(e); }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sum = (arr) => arr.reduce((a, e) => ({ out: a.out + e.out, cr: a.cr + e.cr, n: a.n + 1 }), { out: 0, cr: 0, n: 0 });
  const days = [];
  for (let i = 6; i >= 0; i--) { const d0 = today.getTime() - i * 864e5; days.push({ day: d0, ...sum(all.filter((e) => e.t >= d0 && e.t < d0 + 864e5)) }); }
  const todayE = all.filter((e) => e.t >= today.getTime());
  const last5 = all.filter((e) => e.t >= Date.now() - 5 * 3600e3);
  return { today: sum(todayE), last5h: sum(last5), windowStart: last5.length ? Math.min(...last5.map((e) => e.t)) : null, sessionsToday: new Set(todayE.map((e) => e.session)).size, days };
});

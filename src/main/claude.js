// Claude : questions rapides via la CLI Claude Code (`claude -p`, donc l'abonnement de l'utilisateur)
// et consommation lue dans les journaux locaux (~/.claude/projects/**/*.jsonl).
const { ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const core = require('./core');

const CHAT_DIR = path.join(core.DATA, 'claude-chat');
fs.mkdirSync(CHAT_DIR, { recursive: true });

let proc = null;
ipcMain.handle('claude-ask', (_e, prompt, cont) => {
  if (proc) return false;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (cont) args.push('--continue');
  if (core.config.claudeModel) args.push('--model', core.config.claudeModel);
  proc = spawn(core.config.claudePath || 'claude', args, { cwd: CHAT_DIR, windowsHide: true, env: process.env });
  proc.stdin.end(prompt);
  const send = (type, data) => core.send('claude-event', { type, data });
  let buf = '', err = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') send('delta', m.event.delta.text);
      else if (m.type === 'result') send('result', { text: m.result, error: m.is_error });
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => (err += d));
  proc.on('error', (e) => { send('error', e.code === 'ENOENT' ? 'La commande « claude » est introuvable. Installe Claude Code ou règle son chemin dans les réglages.' : e.message); proc = null; send('done'); });
  proc.on('close', (code) => { if (code && err) send('error', err.slice(-500)); send('done'); proc = null; });
  return true;
});
ipcMain.handle('claude-stop', () => { if (proc) proc.kill(); return true; });

const fileCache = new Map();   // chemin -> { mtime, entries }
ipcMain.handle('claude-usage', async () => {
  const base = path.join(os.homedir(), '.claude', 'projects');
  const since = Date.now() - 7 * 864e5;
  const files = [];
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
          const j = JSON.parse(line);
          const u = j.message?.usage; if (!u || !j.timestamp) continue;
          entries.push({ key: (j.message.id || '') + ':' + (j.requestId || ''), t: Date.parse(j.timestamp), model: j.message.model || '?',
            inp: u.input_tokens || 0, out: u.output_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, session: j.sessionId });
        } catch { }
      }
      c = { mtime: f.mtime, entries }; fileCache.set(f.p, c);
    }
    for (const e of c.entries) if (e.t >= since && !seen.has(e.key)) { seen.add(e.key); all.push(e); }
  }
  const now = Date.now(); const today = new Date(); today.setHours(0, 0, 0, 0);
  const sum = (arr) => arr.reduce((a, e) => ({ inp: a.inp + e.inp, out: a.out + e.out, cw: a.cw + e.cw, cr: a.cr + e.cr, n: a.n + 1 }), { inp: 0, out: 0, cw: 0, cr: 0, n: 0 });
  const days = [];
  for (let i = 6; i >= 0; i--) { const d0 = today.getTime() - i * 864e5; days.push({ day: d0, ...sum(all.filter((e) => e.t >= d0 && e.t < d0 + 864e5)) }); }
  const todayEntries = all.filter((e) => e.t >= today.getTime());
  const models = {};
  for (const e of todayEntries) { const m = (models[e.model] ||= { out: 0, n: 0 }); m.out += e.out; m.n++; }
  const last5 = all.filter((e) => e.t >= now - 5 * 3600e3);
  return {
    today: sum(todayEntries), last5h: sum(last5), windowStart: last5.length ? Math.min(...last5.map((e) => e.t)) : null,
    sessionsToday: new Set(todayEntries.map((e) => e.session)).size, days, models,
  };
});

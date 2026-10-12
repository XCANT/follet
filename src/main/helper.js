// Pont vers helper.ps1 : un processus Windows PowerShell 5.1 persistant (WinRT, Core Audio, Win32).
// Une commande JSON par ligne sur stdin, une reponse JSON par ligne sur stdout.
const { app } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let proc = null, buf = '', seq = 0, stopping = false;
const waiting = new Map();

function start() {
  proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'helper.ps1')], { windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); clearTimeout(w.timer); msg.ok ? w.resolve(msg.data) : w.reject(new Error(msg.error)); }
    }
  });
  proc.stderr.on('data', () => { });
  proc.on('exit', () => {
    for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error('helper arrete')); }
    waiting.clear(); proc = null;
    if (!stopping) setTimeout(start, 2000);
  });
}

function call(op, arg, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (!proc) return reject(new Error('helper absent'));
    const id = ++seq;
    const timer = setTimeout(() => { if (waiting.delete(id)) reject(new Error('timeout ' + op)); }, timeout);
    waiting.set(id, { resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ id, op, arg }) + '\n');
  });
}

app.on('before-quit', () => { stopping = true; try { proc && proc.kill(); } catch { } });

module.exports = { start, call, get ready() { return !!proc; } };

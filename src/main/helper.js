// Pont vers le helper : bin/FolletHelper.exe (C#, voir src/helper), ou helper.ps1 (Windows PowerShell 5.1)
// en secours si l'exe manque ou plante au demarrage. Processus persistant : une commande JSON par
// ligne sur stdin, une reponse JSON par ligne sur stdout.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const core = require('./core');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const EXE = unpacked(path.join(__dirname, 'bin', 'FolletHelper.exe'));
const PS1 = unpacked(path.join(__dirname, 'helper.ps1'));

let proc = null, buf = '', seq = 0, stopping = false, kind = null, exeFailures = 0, startedAt = 0;
const waiting = new Map();

function start() {
  // l'exe, sauf s'il est absent ou s'il a deja plante deux fois juste apres son lancement
  kind = fs.existsSync(EXE) && exeFailures < 2 && !process.env.FOLLET_HELPER_PS1 ? 'exe' : 'ps1';
  proc = kind === 'exe'
    ? spawn(EXE, [], { windowsHide: true })
    : spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', PS1], { windowsHide: true });
  startedAt = Date.now(); buf = '';
  core.log('info', 'helper :', kind);
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
  proc.on('error', () => { });          // spawn impossible : 'exit' suit
  proc.on('exit', (code) => {
    if (!stopping) {
      if (kind === 'exe' && Date.now() - startedAt < 10000) exeFailures++;
      core.log('warn', `helper ${kind} arrete (code ${code}), redemarrage`);
    }
    for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error('helper arrete')); }
    waiting.clear(); proc = null;
    if (!stopping) setTimeout(start, exeFailures === 1 ? 300 : 2000);
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

module.exports = { start, call, get ready() { return !!proc; }, get kind() { return kind; } };

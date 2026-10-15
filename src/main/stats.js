// Statistiques systeme : CPU, GPU NVIDIA, RAM, reseau, disques, top des applis, test de vitesse.
const { ipcMain, app } = require('electron');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');
const core = require('./core');
const helper = require('./helper');

let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i].times, t = c.times;
    idle += t.idle - p.idle;
    total += (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + (t.idle - p.idle);
  });
  lastCpu = now;
  return total ? Math.round(100 * (1 - idle / total)) : 0;
}

function nvidia() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.gr', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 3000 }, (err, out) => {
        if (err) return resolve(null);
        const [name, util, temp, used, total, power, clock] = out.trim().split('\n')[0].split(',').map((s) => s.trim());
        resolve({ name, util: +util, temp: +temp, memUsed: +used, memTotal: +total, power: parseFloat(power) || null, clock: +clock || null });
      });
  });
}

// Temperature CPU via Libre Hardware Monitor (serveur web, port 8085), si present
function lhmCpuTemp() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8085/data.json', { timeout: 800 }, (res) => {
      let s = ''; res.on('data', (d) => (s += d));
      res.on('end', () => {
        try {
          const found = [];
          (function walk(n, inCpu) {
            const cpu = inCpu || (n.ImageURL || '').includes('cpu.png');
            if (cpu && /°C/.test(n.Value || '') && /Tctl|Package|Core \(Tctl/i.test(n.Text || '')) found.push(parseFloat(n.Value));
            (n.Children || []).forEach((c) => walk(c, cpu));
          })(JSON.parse(s), false);
          resolve(found.length ? found[0] : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Echantillonnage continu : historique de 5 min pour les courbes (toutes les 2 s quand l'onglet
// est ouvert, toutes les 6 s sinon, pour rester leger)
const HISTORY = 150;
let history = [], latest = null, active = false, sampling = false;
async function sample() {
  if (sampling) return; sampling = true;
  try {
    latest = await snapshot();
    const r = latest;
    history.push({ t: Date.now(), cpu: r.cpu.load, gpu: r.gpu ? r.gpu.util : null, ram: Math.round(100 * (1 - r.ram.free / r.ram.total)),
      down: r.net ? r.net.down : 0, up: r.net ? r.net.up : 0, cpuTemp: r.cpu.temp, gpuTemp: r.gpu ? r.gpu.temp : null });
    if (history.length > HISTORY) history.shift();
  } catch { } finally { sampling = false; }
}
(function loop() { sample().finally(() => setTimeout(loop, active ? 2000 : 6000)); })();
ipcMain.on('stats-active', (_e, on) => { active = !!on; if (on) sample(); });
ipcMain.handle('stats', async () => { if (!latest) await sample(); return { ...latest, history, self: selfUsage() }; });

// Ce que Follet consomme lui-meme (tous ses processus Electron)
function selfUsage() {
  let cpu = 0, mem = 0;
  for (const m of app.getAppMetrics()) { cpu += m.cpu.percentCPUUsage || 0; mem += (m.memory.workingSetSize || 0) * 1024; }
  return { cpu: Math.round((cpu / os.cpus().length) * 10) / 10, mem };
}

let lastNet = null;
async function snapshot() {
  const [gpu, cpuTemp, net, freq] = await Promise.all([
    nvidia(), lhmCpuTemp(), helper.call('net').catch(() => null), helper.call('cpu-freq').catch(() => null),
  ]);
  let netRate = null;
  if (net) {
    const t = Date.now();
    if (lastNet) { const dt = (t - lastNet.t) / 1000; netRate = { down: Math.max(0, (net.rx - lastNet.rx) / dt), up: Math.max(0, (net.tx - lastNet.tx) / dt) }; }
    lastNet = { ...net, t };
  }
  const disks = [];
  for (const d of core.config.disks || ['C:\\']) {
    try { const s = await fs.promises.statfs(d); disks.push({ name: d.slice(0, 2), total: s.blocks * s.bsize, free: s.bavail * s.bsize }); } catch { }
  }
  const cpus = os.cpus();
  return {
    cpu: { load: cpuPercent(), temp: cpuTemp, model: cpus[0].model.trim().replace(/\s+w\/.*$/i, '').replace(/ with .*$/i, ''), threads: cpus.length, mhz: freq },
    ram: { total: os.totalmem(), free: os.freemem() },
    gpu, net: netRate, disks, uptime: os.uptime(),
  };
}

// Fiche systeme facon fastfetch : la partie fixe (materiel, Windows) est lue une fois.
let sysStatic = null;
function readSysStatic() {
  const ps = `$ErrorActionPreference='SilentlyContinue'
$os=Get-CimInstance Win32_OperatingSystem; $cs=Get-CimInstance Win32_ComputerSystem; $bb=Get-CimInstance Win32_BaseBoard
$cv=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
[pscustomobject]@{ os=$os.Caption; ver=$cv.DisplayVersion; build="$($cv.CurrentBuild).$($cv.UBR)"; arch=$os.OSArchitecture
 maker=$cs.Manufacturer; model=$cs.Model; family=$cs.SystemFamily; board=$bb.Product
 gpus=@(Get-CimInstance Win32_VideoController | ForEach-Object Name)
 pwsh=(Get-Command pwsh -EA 0).Version.ToString()
 installed=$os.InstallDate.ToString('yyyy-MM-dd') } | ConvertTo-Json -Compress`;
  const exe = require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve) => execFile(exe, ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15000 }, (err, out) => {
    try { resolve(JSON.parse(out)); } catch { resolve({}); }
  }));
}
setTimeout(() => { if (!sysStatic) readSysStatic().then((r) => { sysStatic = sysStatic || r; }); }, 6000);
ipcMain.handle('sysinfo', async () => {
  if (!sysStatic) sysStatic = await readSysStatic();
  const { screen } = require('electron');
  const cpus = os.cpus();
  return {
    ...sysStatic,
    user: os.userInfo().username, host: os.hostname(),
    kernel: os.release(), uptime: os.uptime(),
    cpu: cpus[0].model.trim(), threads: cpus.length,
    ram: { total: os.totalmem(), free: os.freemem() },
    displays: screen.getAllDisplays().map((d) => ({ w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), hz: d.displayFrequency, primary: d.id === screen.getPrimaryDisplay().id })),
    shell: core.config.shell || 'pwsh', themeSource: (core.config.theme || {}).source,
    locale: app.getLocale(), electron: process.versions.electron, version: app.getVersion(),
    disks: latest ? latest.disks : [],
  };
});

// Top des applis (RAM / CPU), avec icones
const iconCache = new Map();
async function iconFor(p) {
  if (!p) return null;
  if (iconCache.has(p)) return iconCache.get(p);
  let url = null;
  try { url = (await app.getFileIcon(p, { size: 'normal' })).toDataURL(); } catch { }
  iconCache.set(p, url);
  return url;
}
ipcMain.handle('procs', async () => {
  const r = await helper.call('procs', null, 15000);
  const self = (p) => p.path && p.path.toLowerCase() === process.execPath.toLowerCase();
  const withIcons = async (list) => Promise.all((list || []).map(async (p) => ({ ...p, label: self(p) ? 'Follet' : p.label, icon: await iconFor(p.path) })));
  return { byMem: await withIcons(r.byMem), byCpu: await withIcons(r.byCpu), total: r.total };
});

// Test de vitesse via speed.cloudflare.com (latence, reception, envoi)
let speedRunning = false;
ipcMain.handle('speedtest', async () => {
  if (speedRunning) return null;
  speedRunning = true;
  const step = (phase, value) => core.send('speedtest-progress', { phase, value });
  try {
    const pings = [];
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      const res = await core.fetchRaw('https://speed.cloudflare.com/__down?bytes=0', { timeout: 5000 }); res.resume();
      await new Promise((r) => res.on('end', r));
      pings.push(performance.now() - t);
    }
    pings.sort((a, b) => a - b);
    const ping = Math.round(pings[1]);
    step('ping', ping);

    // Reception : plusieurs tranches pour lisser
    let bytes = 0; const t0 = performance.now();
    for (const size of [1e6, 1e7, 2.5e7]) {
      const res = await core.fetchRaw(`https://speed.cloudflare.com/__down?bytes=${size}`, { timeout: 30000 });
      for await (const chunk of res) { bytes += chunk.length; step('down', (bytes * 8) / ((performance.now() - t0) / 1000) / 1e6); }
      if (performance.now() - t0 > 8000) break;
    }
    const down = (bytes * 8) / ((performance.now() - t0) / 1000) / 1e6;
    step('down', down);

    // Envoi
    const payload = Buffer.alloc(5e6, 97); let sent = 0; const t1 = performance.now();
    for (let i = 0; i < 3 && performance.now() - t1 < 8000; i++) {
      const res = await core.fetchRaw('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, timeout: 30000, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length } });
      res.resume(); sent += payload.length;
      step('up', (sent * 8) / ((performance.now() - t1) / 1000) / 1e6);
    }
    const up = (sent * 8) / ((performance.now() - t1) / 1000) / 1e6;
    const result = { ping, down, up, at: Date.now() };
    core.state.lastSpeedtest = result; core.saveState();
    return result;
  } finally { speedRunning = false; }
});
ipcMain.handle('speedtest-last', () => core.state.lastSpeedtest || null);
module.exports = { nvidia, lhmCpuTemp };

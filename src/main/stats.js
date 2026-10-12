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

let lastNet = null;
ipcMain.handle('stats', async () => {
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
  const withIcons = async (list) => Promise.all((list || []).map(async (p) => ({ ...p, icon: await iconFor(p.path) })));
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

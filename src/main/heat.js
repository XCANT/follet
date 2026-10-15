// Alerte de chauffe : carte graphique NVIDIA (nvidia-smi) et processeur (Libre Hardware Monitor, si present)
// verifies toutes les 20 s. Une alerte par surchauffe : elle se rearme quand la temperature redescend.
const core = require('./core');
const helper = require('./helper');
const focus = require('./focus');
const { nvidia, lhmCpuTemp } = require('./stats');

const LIMITS = { gpu: 85, cpu: 95 };      // °C
const armed = { gpu: true, cpu: true };
let busy = false, noGpu = 0;

async function check() {
  if (busy || core.config.activities.heat === false) return;
  busy = true;
  try {
    // pas de carte NVIDIA : on cesse d'appeler nvidia-smi apres quelques essais
    const [gpu, cpuTemp] = await Promise.all([noGpu < 3 ? nvidia() : null, lhmCpuTemp().catch(() => null)]);
    if (!gpu) noGpu++; else noGpu = 0;
    for (const [part, temp] of [['gpu', gpu && gpu.temp], ['cpu', cpuTemp]]) {
      if (!(temp > 0)) continue;
      if (temp < LIMITS[part] - 7) armed[part] = true;
      if (temp >= LIMITS[part] && armed[part]) {
        armed[part] = false;
        if (focus.active()) continue;
        const procs = await helper.call('procs', null, 15000).catch(() => null);
        const top = procs && (procs.byCpu || []).find((p) => p.cpu > 1 && (p.label || p.name));
        core.send('activity', { kind: 'heat', part, temp: Math.round(temp), app: top ? top.label || top.name : null });
      }
    }
  } finally { busy = false; }
}

function start() { setInterval(check, 20000); setTimeout(check, 8000); }
module.exports = { start, check };

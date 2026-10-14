// Checks the helper protocol: sends every read-only command and validates the shape of each answer.
// Usage: node scripts/helper-test.js [ps1|exe]   (default: exe if built, else ps1)
// Used to prove the C# helper answers exactly like the PowerShell one.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXE = path.join(__dirname, '..', 'src', 'main', 'bin', 'FolletHelper.exe');
const PS1 = path.join(__dirname, '..', 'src', 'main', 'helper.ps1');
const which = process.argv[2] || (fs.existsSync(EXE) ? 'exe' : 'ps1');
const proc = which === 'exe'
  ? spawn(EXE, [], { windowsHide: true })
  : spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', PS1], { windowsHide: true });

let buf = '', seq = 0;
const waiting = new Map();
proc.stdout.setEncoding('utf8');
proc.stdout.on('data', (c) => {
  buf += c; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line); const w = waiting.get(msg.id);
    if (w) { waiting.delete(msg.id); w(msg); }
  }
});
const call = (op, arg) => new Promise((resolve) => {
  const id = ++seq, t0 = Date.now();
  const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, error: 'timeout', ms: 15000 }); }, 15000);
  waiting.set(id, (m) => { clearTimeout(timer); resolve({ ...m, ms: Date.now() - t0 }); });
  proc.stdin.write(JSON.stringify({ id, op, arg }) + '\n');
});

const type = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
// expected shape: { key: 'type|type' }; arrays: [shape of first item]
const SHAPES = {
  media: (d) => d.present === false || has(d, { present: 'boolean', title: 'string', artist: 'string', status: 'string', key: 'string', thumbVer: 'number', position: 'number', duration: 'number', canPrev: 'boolean', canNext: 'boolean', repeat: 'string', shuffle: 'boolean', hasThumb: 'boolean', updated: 'number' }),
  volume: (d) => has(d, { level: 'number', muted: 'boolean' }),
  'audio-device': (d) => has(d, { id: 'string', name: 'string|null' }),
  'audio-devices': (d) => type(d) === 'array' && d.every((x) => has(x, { id: 'string', name: 'string|null', isDefault: 'boolean' })),
  radios: (d) => type(d) === 'array' && d.every((x) => has(x, { kind: 'string', on: 'boolean', name: 'string' })),
  quns: (d) => type(d) === 'number',
  fg: (d) => d === null || has(d, { max: 'boolean', l: 'number', t: 'number', r: 'number', b: 'number', pid: 'number', cls: 'string' }),
  at: (d) => d === null || has(d, { max: 'boolean', cls: 'string' }),
  net: (d) => has(d, { rx: 'number', tx: 'number' }),
  battery: (d) => has(d, { present: 'boolean', percent: 'number', plugged: 'boolean', charging: 'boolean' }),
  procs: (d) => has(d, { byMem: 'array', byCpu: 'array', total: 'number' }) && d.byMem.every((x) => has(x, { name: 'string', label: 'string', mem: 'number', cpu: 'number', count: 'number', path: 'string|null' })),
  notifs: (d) => has(d, { access: 'string', ids: 'array', items: 'array' }),
  'cpu-freq': (d) => d === null || type(d) === 'number',
  bt: (d) => type(d) === 'array' && d.every((x) => has(x, { id: 'string', name: 'string', battery: 'number|null' })),
  'mic-users': (d) => type(d) === 'array' && d.every((x) => has(x, { pid: 'number', name: 'string', label: 'string' })),
};
function has(o, shape) {
  if (type(o) !== 'object') return false;
  for (const [k, t] of Object.entries(shape)) if (!t.split('|').includes(type(o[k]))) { console.log(`    ${k}: expected ${t}, got ${type(o[k])}`); return false; }
  return true;
}

(async () => {
  console.log(`helper: ${which}`);
  const t0 = Date.now();
  await call('quns');
  console.log(`  ready in ${Date.now() - t0} ms`);
  let fail = 0;
  const run = async (op, arg) => {
    const r = await call(op, arg);
    const good = r.ok && SHAPES[op](r.data);
    if (!good) fail++;
    console.log(`  ${good ? 'ok  ' : 'FAIL'} ${op.padEnd(14)} ${String(r.ms).padStart(5)} ms${r.ok ? '' : '  ' + r.error}`);
  };
  // CI runners have no audio device, media session or notification center: protocol checks only
  const ops = process.env.CI ? ['quns', 'fg', 'net', 'battery', 'procs', 'procs', 'cpu-freq', 'mic-users']
    : ['media', 'volume', 'audio-device', 'audio-devices', 'radios', 'quns', 'fg', 'net', 'battery', 'procs', 'procs', 'notifs', 'cpu-freq', 'mic-users', 'bt'];
  for (const op of ops) await run(op, op === 'notifs' ? 0 : undefined);
  await run('at', { x: 10, y: 10 });
  const bad = await call('nope');
  console.log(`  ${bad.ok ? 'FAIL' : 'ok  '} unknown op -> error`);
  if (bad.ok) fail++;
  // independent calls must not block each other (procs is slow)
  const t1 = Date.now(); await Promise.all([call('procs'), call('net'), call('battery')]);
  console.log(`  3 parallel calls: ${Date.now() - t1} ms`);
  proc.stdin.end(); proc.kill();
  console.log(fail ? `${fail} failure(s)` : 'all good');
  process.exit(fail ? 1 : 0);
})();

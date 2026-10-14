// Compiles src/helper/FolletHelper.cs into src/main/bin/FolletHelper.exe with the C# compiler that
// ships with .NET Framework 4.8 (present on every Windows 10/11, no SDK needed), against the WinRT
// metadata in System32\WinMetadata. Skipped when the exe is newer than the source.
// Usage: node scripts/build-helper.js [--force]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'helper', 'FolletHelper.cs');
const out = path.join(root, 'src', 'main', 'bin', 'FolletHelper.exe');
const win = process.env.SystemRoot || 'C:\\Windows';
const fx = path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const winmd = path.join(win, 'System32', 'WinMetadata');

if (!process.argv.includes('--force') && fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs) {
  console.log('helper: up to date');
  process.exit(0);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
const refs = [
  ...['System.Runtime.dll', 'System.Runtime.InteropServices.WindowsRuntime.dll', 'System.Web.Extensions.dll', 'System.Core.dll', 'System.Drawing.dll']
    .map((f) => path.join(fx, f)),
  ...['Windows.Foundation', 'Windows.Media', 'Windows.Storage', 'Windows.Devices', 'Windows.Graphics', 'Windows.Globalization', 'Windows.UI', 'Windows.ApplicationModel']
    .map((f) => path.join(winmd, f + '.winmd')),
].filter((f) => fs.existsSync(f));
try {
  const log = execFileSync(path.join(fx, 'csc.exe'), [
    '/nologo', '/optimize+', '/platform:x64', '/target:exe', '/out:' + out,
    ...refs.map((r) => '/r:' + r), src,
  ], { encoding: 'utf8' });
  if (log.trim()) console.log(log.trim());
  console.log('helper: built ' + path.relative(root, out));
} catch (e) {
  console.error((e.stdout || '') + (e.stderr || '') || e.message);
  process.exit(1);
}

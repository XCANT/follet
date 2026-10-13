// Verification rapide avant un commit ou une release (lancee aussi par GitHub Actions) :
//  - chaque fichier .js de src/ se lit sans erreur de syntaxe
//  - helper.ps1 reste en ASCII (Windows PowerShell 5.1 le lit en ANSI : un accent le casserait)
//  - package.json et package-lock.json annoncent la meme version
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(path.join(root, 'src'));

for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`${path.relative(root, f)}\n${r.stderr.trim()}`);
}

const ps = fs.readFileSync(path.join(root, 'src', 'main', 'helper.ps1'));
const bad = ps.findIndex((b) => b > 127);
if (bad >= 0) {
  const line = ps.subarray(0, bad).toString('latin1').split('\n').length;
  errors.push(`src/main/helper.ps1 : caractère non ASCII à la ligne ${line}`);
}

const pkg = require(path.join(root, 'package.json'));
const lock = require(path.join(root, 'package-lock.json'));
if (pkg.version !== lock.version) errors.push(`package-lock.json annonce ${lock.version}, package.json ${pkg.version} : lance npm install`);

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exit(1);
}
console.log(`OK : ${files.length} fichiers JS, helper.ps1 en ASCII, version ${pkg.version}`);

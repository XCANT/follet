// Extracts one version's CHANGELOG section for the GitHub release text.
// Usage: node scripts/release-notes.js 1.3.0 > notes.md
const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || '').replace(/^v/, '');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const start = text.search(new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?`, 'm'));
if (!version || start < 0) {
  console.error(`No "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}
const rest = text.slice(start).split('\n').slice(1).join('\n');
const end = rest.search(/^## /m);
const body = (end < 0 ? rest : rest.slice(0, end)).trim();

console.log(`${body}

## Install

Download **Follet-Setup-${version}.exe** below and run it (per-user install, no admin rights needed).
The installer is not signed: on the SmartScreen warning, click *More info*, then *Run anyway*.
See the [code signing policy](https://github.com/XCANT/follet#code-signing-policy) and [privacy](https://github.com/XCANT/follet#privacy).`);

// Extrait du CHANGELOG la section d'une version, pour le texte de la release GitHub.
// Usage : node scripts/release-notes.js 1.3.0 > notes.md
const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || '').replace(/^v/, '');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const start = text.search(new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?`, 'm'));
if (!version || start < 0) {
  console.error(`Aucune section « ## ${version} » dans CHANGELOG.md`);
  process.exit(1);
}
const rest = text.slice(start).split('\n').slice(1).join('\n');
const end = rest.search(/^## /m);
const body = (end < 0 ? rest : rest.slice(0, end)).trim();

console.log(`${body}

## Installation

Télécharge **Follet-Setup-${version}.exe** ci-dessous et lance-le (installation par utilisateur, sans droits administrateur).
L'installateur n'est pas signé : à l'avertissement SmartScreen, clique *Informations complémentaires* puis *Exécuter quand même*.`);

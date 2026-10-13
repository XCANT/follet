// Liste les textes francais de l'interface qui n'ont pas encore de traduction anglaise.
// node scripts/i18n-extract.js [--all]
const fs = require('fs');
const path = require('path');
const { en } = require('../src/i18n/en.js');

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name !== 'i18n') walk(p); } else if (/\.(js|html)$/.test(f.name) && !/mascot\.js$|preload\.js$/.test(f.name)) files.push(p);
  }
})(path.join(__dirname, '..', 'src'));

const found = new Map();
const french = /[a-zA-ZÀ-ÿ]{2}/;
const skip = /^(?:[\w.-]+\.(?:js|css|png|json|exe|ps1)|[a-z]+(?:-[a-z]+)*|[A-Z_]+|#[0-9a-f]+|https?:.*|\W*)$/;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const add = (s) => {
    s = s.replace(/\$\{[^}]*\}/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    for (const part of s.split(/ {2,}|·/)) {
      const p = part.trim();
      if (p.length > 1 && french.test(p) && !skip.test(p) && !/[{}();=]|=>|\bconst\b|\bms\(/.test(p)) {
        if (!found.has(p)) found.set(p, path.relative(path.join(__dirname, '..'), f));
      }
    }
  };
  // texte entre balises dans les gabarits, et chaines entre quotes contenant une espace ou un accent
  for (const m of src.matchAll(/>([^<>`]+)</g)) add(m[1]);
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (/[ À-ÿ]/.test(m[1]) && !/^\s*$/.test(m[1])) add(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/(?:title|placeholder|aria-label)="([^"$]+)"/g)) add(m[1]);
}
const all = process.argv.includes('--all');
for (const [s, f] of found) if (all || !(s in en)) console.log(JSON.stringify(s) + '  // ' + f);

/* Traduction de l'interface. Le code est ecrit en francais ; en anglais, chaque texte affiche
   (noeuds texte + title/placeholder/aria-label) passe par le dictionnaire de src/i18n/en.js :
   correspondance exacte d'abord, puis motifs (textes avec des nombres). Un MutationObserver
   traduit ce qui apparait ensuite. Le contenu des utilisateurs (chansons, messages, fichiers...)
   n'est jamais touche : voir SKIP. */
(function () {
  const SKIP = 'style, script, .ms, .xterm, .msg, .np-title, .np-artist, [data-noi18n], textarea, code, pre';
  const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip'];
  const dict = window.FOLLET_EN || { en: {}, patterns: [] };
  const exact = new Map(Object.entries(dict.en));
  const patterns = dict.patterns.map(([re, to]) => [new RegExp(re), to]);
  const UNITS = [[/(\d)\s?Go\b/g, '$1 GB'], [/(\d)\s?Mo\b/g, '$1 MB'], [/(\d)\s?Ko\b/g, '$1 KB'], [/(\d)\s?To\b/g, '$1 TB'], [/(\d)\s?Gio\b/g, '$1 GiB'], [/(\d) o\b/g, '$1 B']];
  const done = new WeakMap();          // noeud -> texte deja traduit (evite les boucles)
  const missing = new Set();

  I.lang = 'fr'; I.locale = 'fr-CA';
  function tr(s) {
    if (I.lang !== 'en' || !s) return s;
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2].replace(/\s+/g, ' ');
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return s;
    let out = null;
    if (out == null) out = one(core);
    if (out == null && / (·|—) /.test(core)) {           // "A · B" : chaque morceau separement
      const parts = core.split(/( · | — )/), tr2 = parts.map((p, i) => (i % 2 ? p : one(p) ?? p));
      if (tr2.some((p, i) => p !== parts[i])) out = tr2.join('');
    }
    if (out == null) { out = core; if (/[a-zà-ÿ]{3}/i.test(core) && !/^[\d\s.,:%°×/()GBMKio@Hz-]+$/.test(core)) missing.add(core); }
    for (const [re, to] of UNITS) out = out.replace(re, to);
    return m[1] + out + m[3];
  }
  function one(s) {
    const e = exact.get(s); if (e != null) return e;
    for (const [re, to] of patterns) if (re.test(s)) return s.replace(re, to);
    return null;
  }
  I.t = tr;

  function node(n) {
    if (n.nodeType === 3) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP) || done.get(n) === n.data) return;
      const t = tr(n.data);
      if (t !== n.data) n.data = t;
      done.set(n, n.data);
    } else if (n.nodeType === 1) {
      if (n.closest(SKIP)) return;
      for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
      if (n.tagName === 'INPUT' && (n.type === 'button' || n.type === 'submit')) n.value = tr(n.value);
      for (const c of n.childNodes) node(c);
    }
  }
  const obs = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'childList') r.addedNodes.forEach(node);
      else if (r.type === 'characterData') node(r.target);
      else if (r.type === 'attributes') { const v = r.target.getAttribute(r.attributeName); const t = v && !r.target.closest(SKIP) ? tr(v) : v; if (t !== v) r.target.setAttribute(r.attributeName, t); }
    }
  });

  I.setLang = (lang) => {
    I.lang = lang === 'en' || (lang !== 'fr' && !/^fr/i.test(navigator.language)) ? 'en' : 'fr';
    I.locale = I.lang === 'en' ? 'en-CA' : 'fr-CA';
    document.documentElement.lang = I.lang;
    if (I.lang !== 'en') return;
    node(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  // Dev : FOLLET_EVAL="I.i18nMissing()" liste les textes affiches sans traduction
  I.i18nMissing = () => [...missing].sort();
})();

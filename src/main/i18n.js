// Traduction cote processus principal (menu de l'icone, notifications systeme).
// L'interface, elle, est traduite dans le renderer (js/i18n.js) avec le meme dictionnaire.
const { app } = require('electron');
const core = require('./core');
const { en } = require('../i18n/en.js');

function lang() {
  const l = core.config.language || 'auto';
  return l === 'en' || (l === 'auto' && !/^fr/i.test(app.getLocale())) ? 'en' : 'fr';
}
const t = (s) => (lang() === 'en' && en[s] != null ? en[s] : s);

module.exports = { t, lang };

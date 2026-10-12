/* Alimentation : verrouiller, veille, deconnexion, redemarrer, eteindre (maintenir pour les actions risquees). */
I.view('power', {
  label: 'Alim.', icon: 'power_settings_new',
  html: `<div class="power-grid"></div><div class="hint">Déconnexion, redémarrer et éteindre : maintiens le bouton enfoncé une seconde.</div>`,
  init(el) {
    const P = [['lock', 'Verrouiller', 'lock', false], ['sleep', 'Veille', 'bedtime', false], ['signout', 'Déconnexion', 'logout', true], ['restart', 'Redémarrer', 'restart_alt', true], ['shutdown', 'Éteindre', 'power_settings_new', true]];
    $('.power-grid', el).innerHTML = P.map(([a, l, i, hold]) => `<button class="pw state ${hold ? 'danger' : ''}" data-a="${a}" data-hold="${hold}"><span class="fill"></span>${ms(i)}<span>${l}</span></button>`).join('');
    $$('.pw', el).forEach((b) => {
      const fire = () => { I.setMode('collapsed'); island.power(b.dataset.a); };
      if (b.dataset.hold === 'false') { b.addEventListener('click', fire); return; }
      let t = null;
      const cancel = () => { clearTimeout(t); b.classList.remove('holding'); };
      b.addEventListener('pointerdown', () => { b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); fire(); }, 1000); });
      b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel);
    });
  },
});

# Journal des versions

Les versions suivent [SemVer](https://semver.org/lang/fr/). Pour publier : ajouter une section ici, monter la version dans `package.json` (`npm version x.y.z --no-git-tag-version`), committer, puis pousser un tag `vx.y.z`. GitHub Actions construit l'installateur et crée la release avec le texte de cette section.

## [Non publié]

### Corrigé
- Glisser-déposer : l'encoche restait en aperçu sous les cibles de dépôt. Elle passe maintenant en mode dépôt pendant tout le geste, puis confirme le dépôt.

### Ajouté
- Build et release automatiques avec GitHub Actions ; vérification du code à chaque push.

## [1.2.0] - 2026-10-13

### Ajouté
- Nouvelle mascotte, dessinée d'après le croquis de XCANT : petite flamme corail lumineuse, grands yeux brillants, bouche « :3 », joues roses et flammèche.
- Humeurs : écouteurs quand la musique joue, auréole et points pendant que l'IA réfléchit, clin d'œil et étincelles quand la réponse arrive, bonnet de nuit après 5 min d'inactivité, grands yeux et « ! » pour les alertes.
- Réglage Apparence → Couleur de Follet : corail ou couleurs de l'appli.

### Corrigé
- Le sélecteur de sortie audio ne s'ouvrait pas.
- Des icônes d'applis ne se chargeaient pas ; les raccourcis morts sont retirés.
- La pochette restait parfois celle de la chanson précédente.

## [1.1.0] - 2026-10-13

### Ajouté
- Onglet Follet : vues Discussion et Utilisation (fenêtre de 5 h de Claude Code, jetons, messages, sessions, heure par heure, par modèle, par projet).
- Dépôt de fichiers avec deux cibles : Étagère et Demander à Follet (lecture des fichiers texte).
- Navigation au clavier (1 à 9, flèches) et à la molette sur les onglets.

### Modifié
- Panneau à taille fixe : plus de recalcul de mise en page pendant l'ouverture.
- Luminosité : un seul curseur, l'icône choisit l'écran.

## [1.0.0] - 2026-10-13

### Ajouté
- Première version installable : encoche Material You avec musique, agenda et météo, stats, étagère, presse-papiers, lanceur, terminal, IA au choix et alimentation.
- Journal dans `%APPDATA%\Follet\logs`, écran de bienvenue, démarrage avec Windows.

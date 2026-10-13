# Follet

*Un feu follet : la petite flamme du folklore québécois, cousine du hitodama japonais.*

Une encoche façon *Dynamic Island* pour Windows. Elle vit en haut de l'écran, se déroule au survol et regroupe ce qu'on va chercher dix fois par jour : la musique, l'agenda, la météo, les stats du PC, une étagère de fichiers, le presse-papiers, un terminal et Claude.

Interface en **Material 3 (Material You)** : tout le thème est généré à partir de la pochette en cours, de la couleur d'accent de Windows ou d'une couleur choisie.

Gratuit, local, sans abonnement ni clé d'API.

## Ce qu'elle fait

| Onglet | Contenu |
|---|---|
| **Accueil** | Lecture en cours (pochette, barre ondulée, avance au clic) pour toute appli qui parle à Windows (Spotify, YouTube Music, navigateur…), volume, luminosité de chaque écran (DDC/CI et écran intégré), raccourcis système, état (batterie, météo, prochain événement) |
| **Aujourd'hui** | Horloge, météo heure par heure et sur 4 jours (position par IP), agenda de la semaine (iCal), minuteur affiché dans l'encoche, tâches |
| **Stats** | Courbes CPU (fréquence réelle), GPU NVIDIA et RAM sur 5 min ; top des applis par RAM ou CPU ; disques ; débit réseau et test de vitesse |
| **Étagère** | Glisse des fichiers sur l'encoche (même repliée) puis sur la cible « Étagère » pour les garder sous la main, et fais-les glisser vers n'importe quelle appli |
| **Copié** | Historique des 50 derniers textes copiés, en mémoire seulement |
| **Apps** | Lanceur avec recherche et favoris, basé sur le menu Démarrer |
| **Terminal** | Shell complet (PowerShell 7 par défaut) via xterm.js + node-pty |
| **Follet** | La mascotte et ton IA au choix (Claude Code, API Claude, OpenAI, Gemini, Ollama, OpenRouter, serveur compatible) ; dépose un fichier texte sur la cible « Demander à Follet » pour qu'il le lise ; tableau de bord d'utilisation (fenêtre de 5 h, jetons, messages, heure par heure, par modèle, par projet) |
| **Alim.** | Verrouiller, veille, déconnexion, redémarrer, éteindre |
| **Réglages** | Tout se règle dans l'appli : couleurs, écran, raccourci, activités, onglets visibles, météo, agendas, disques, shell, modèle Claude |

### Activités en direct

Repliée, l'encoche s'élargit quelques secondes quand quelque chose se passe : volume changé, nouvelle chanson, casque ou haut-parleurs connectés, chargeur branché ou débranché, batterie faible, minuteur terminé.

### Comportement

- **Survol** : aperçu (pochette, titre, contrôles ; sinon date, prochain événement et météo).
- **Molette vers le bas ou clic** : panneau complet. **Échap** ou sortir la souris : refermer.
- **Ctrl+Alt+Espace** (modifiable) : ouvrir / fermer de n'importe où.
- Encoche ouverte : **1 à 9** pour choisir un onglet, **← / →** ou la molette sur les onglets pour passer au voisin.
- Devant une fenêtre **maximisée**, l'encoche se range au-dessus de l'écran ; elle ressort quand la souris touche le haut, au milieu.
- Masquée complètement pendant un jeu en plein écran.

## Installation

**Le plus simple :** lancer `Follet-Setup-x.y.z.exe` (installation par utilisateur, sans droits administrateur). L'installateur n'est pas signé : Windows SmartScreen affiche « Windows a protégé votre ordinateur » → **Informations complémentaires → Exécuter quand même**.

Pour générer l'installateur soi-même : `npm run dist` → `dist\Follet-Setup-<version>.exe`.

En cas de pépin, le journal est dans `%APPDATA%\Follet\logs\follet.log`.

### Depuis le code

Prérequis : Windows 10/11, [Node.js](https://nodejs.org) 20+. Optionnel : PowerShell 7 (`pwsh`) pour le terminal, [Claude Code](https://claude.com/claude-code) pour l'onglet Claude, [Libre Hardware Monitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) (serveur web activé, port 8085) pour la température du CPU, une carte NVIDIA pour les stats GPU.

```bash
npm install
npm start
```

Avec npm 12+, autoriser le script d'installation d'Electron si npm le bloque : `npm install-scripts approve electron`.

Le démarrage avec Windows se règle dans **Réglages → Comportement** ou dans le menu de l'icône (zone de notification).

## Vie privée

- Toutes les données personnelles (config, tâches, étagère, favoris, conversations Claude) restent dans `%APPDATA%\Follet`, jamais dans le dossier du projet.
- Le presse-papiers n'est jamais écrit sur le disque.
- Services externes : [ipwho.is](https://ipwho.is) / [geojs.io](https://www.geojs.io) (position approximative par IP, désactivable), [Open-Meteo](https://open-meteo.com) (météo et recherche de ville), [speed.cloudflare.com](https://speed.cloudflare.com) (test de vitesse, seulement sur demande) et les adresses iCal que tu ajoutes.

## Structure

```
src/main/
  main.js        démarrage, icône de notification, raccourci global
  core.js        chemins, config, état, utilitaires réseau
  window.js      fenêtre, capture de la souris, rangement, plein écran
  helper.js      pont vers helper.ps1
  helper.ps1     Windows PowerShell 5.1 : média WinRT, volume, sortie audio, batterie,
                 luminosité DDC/CI, processus, fenêtres
  theme.js       couleurs Material You (material-color-utilities)
  monitors.js    musique, volume, sortie audio, batterie -> activités
  stats.js  today.js  tools.js  terminal.js  claude.js  settings.js
  preload.js     pont sécurisé vers l'interface
src/renderer/
  css/m3.css     jetons et composants Material 3
  css/notch.css  encoche et onglets
  js/            core.js (états, activités), views/*.js (un fichier par onglet), boot.js
```

### Tests

- `FOLLET_DEMO=<onglet>` ouvre Follet déployée sur un onglet (`home`, `today`, `stats`, `shelf`, `clip`, `apps`, `term`, `claude`, `power`, `settings`) ; `FOLLET_DEMO=1` les fait défiler.
- `FOLLET_EVAL="<expression JS>"` écrit le résultat de l'expression dans la sortie standard, par exemple `I.activity({kind:'volume', level:42})` pour voir une activité.

## Inspiration

Le look s'inspire de [Hitodama](https://hitodama.in) et des encoches macOS ([boring.notch](https://github.com/TheBoredTeam/boring.notch), NotchNook, Alcove). Follet n'est affilié à aucun de ces projets.

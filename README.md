# Island

Une encoche façon *Dynamic Island* pour Windows. Elle vit en haut de l'écran, se déroule au survol et regroupe ce qu'on va chercher dix fois par jour : la musique, l'agenda, la météo, les stats du PC, le presse-papiers, un terminal et Claude.

Gratuit, local, sans abonnement ni clé d'API.

## Ce qu'elle fait

| Onglet | Contenu |
|---|---|
| **Contrôles** | Musique en cours (pochette, progression, précédent / lecture / suivant) pour n'importe quelle appli qui parle à Windows (Spotify, YouTube Music, navigateur…), volume, raccourcis système |
| **Aujourd'hui** | Date, météo (position estimée par l'adresse IP), agenda de la semaine (iCal), liste de tâches |
| **Stats** | CPU, GPU NVIDIA (charge, température, puissance, VRAM), RAM, réseau, disques |
| **Presse-papiers** | Historique des 40 derniers textes copiés, en mémoire seulement |
| **Apps** | Lanceur avec recherche et favoris, basé sur le menu Démarrer |
| **Terminal** | PowerShell complet (xterm.js + node-pty) |
| **Claude** | Questions rapides via [Claude Code](https://claude.com/claude-code) (`claude -p`) et suivi de la consommation locale |
| **Alim.** | Verrouiller, veille, déconnexion, redémarrer, éteindre |

### Comportement

- **Survol** : aperçu (titre, artiste, lecture/pause).
- **Molette vers le bas ou clic** : panneau complet. **Échap** ou sortir la souris : refermer.
- **Ctrl+Alt+Espace** : ouvrir / fermer de n'importe où.
- Quand une fenêtre **maximisée** occupe l'écran, l'encoche se range au-dessus ; elle ressort quand la souris touche le haut de l'écran, au milieu.
- Masquée complètement pendant un jeu en plein écran.

## Installation

Prérequis : Windows 10/11, [Node.js](https://nodejs.org) 20+, PowerShell 7 (`pwsh`) pour le terminal. Optionnel : [Claude Code](https://claude.com/claude-code) pour l'onglet Claude, [Libre Hardware Monitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) (serveur web activé, port 8085) pour la température du CPU.

```bash
npm install
npm start
```

Avec npm 12+, autoriser le script d'installation d'Electron si npm le bloque : `npm install-scripts approve electron`.

Le démarrage avec Windows se règle dans le menu de l'icône (zone de notification).

## Configuration

Au premier lancement, `config.example.json` est copié dans `%APPDATA%\Island\config.json`. L'icône de la zone de notification → **Ouvrir config.json**, puis **Recharger**.

| Clé | Rôle |
|---|---|
| `display` | `"primary"` ou une résolution (`"1920x1080"`) pour choisir l'écran |
| `shortcut` | Raccourci global ([format Electron](https://www.electronjs.org/docs/latest/api/accelerator)) |
| `shell` | Shell du terminal (`pwsh.exe` par défaut) |
| `disks` | Disques affichés dans Stats |
| `calendars` | Adresses iCal (Google Agenda : Paramètres → ton agenda → *Adresse secrète au format iCal*). Chaîne, ou `{ "url": "...", "color": "#hex" }` |
| `weather.mode` | `"ip"` (position par adresse IP) ou `"fixed"` (utilise `weather.lat` / `weather.lon` / `weather.city`) |
| `weather.fallback` | `{ "city", "lat", "lon" }` utilisé si la géolocalisation IP échoue |

## Vie privée

- Toutes les données personnelles (config, tâches, favoris, conversations Claude) restent dans `%APPDATA%\Island`, jamais dans le dossier du projet.
- Le presse-papiers n'est jamais écrit sur le disque.
- Services externes contactés : [ipwho.is](https://ipwho.is) / [geojs.io](https://www.geojs.io) (position approximative par IP, si `weather.mode` vaut `"ip"`), [Open-Meteo](https://open-meteo.com) (météo), et les adresses iCal que tu configures.

## Structure

```
src/main/main.js      processus principal : fenêtre, données, IPC
src/main/preload.js   pont sécurisé vers l'interface
src/main/helper.ps1   assistant Windows PowerShell 5.1 (média WinRT, volume, fenêtres)
src/renderer/         interface (HTML / CSS / JS sans framework)
```

### Tests

`ISLAND_DEMO=<onglet>` ouvre l'island déployée sur un onglet (`home`, `today`, `stats`, `clip`, `apps`, `term`, `claude`, `power`) ; `ISLAND_DEMO=1` les fait défiler. `ISLAND_EVAL="<expression JS>"` écrit le résultat de l'expression dans la sortie standard.

## Inspiration

Le look s'inspire de [Hitodama](https://hitodama.in). Island n'est pas affilié à ce projet.

// Pont securise entre l'interface et le processus principal : l'interface n'a acces qu'a ces fonctions.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const sendTo = (ch) => (...a) => ipcRenderer.send(ch, ...a);
const on = (ch) => (cb) => { const f = (_e, ...a) => cb(...a); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };

contextBridge.exposeInMainWorld('follet', {
  // fenetre / etats
  setRect: sendTo('notch-rect'),
  collapsed: sendTo('collapsed'),
  focusWindow: sendTo('focus-window'),
  onPointer: on('pointer'), onTuck: on('tuck'), onReveal: on('reveal'), onToggle: on('toggle'), onOpenTab: on('open-tab'),
  onTheme: on('theme'), onActivity: on('activity'),

  // media / son / ecrans
  media: invoke('media-get'), onMedia: on('media'),
  mediaCmd: invoke('media-cmd'), mediaSeek: invoke('media-seek'),
  mediaShuffle: invoke('media-shuffle'), mediaRepeat: invoke('media-repeat'),
  audioDevices: invoke('audio-devices'), setAudioDevice: invoke('audio-set'),
  radios: invoke('radios'), setRadio: invoke('radio-set'),
  volume: invoke('volume-get'), onVolume: on('volume'), setVolume: invoke('volume-set'), mute: invoke('mute'),
  battery: invoke('battery-get'), onBattery: on('battery'),
  brightness: invoke('brightness-get'), setBrightness: invoke('brightness-set'),

  // stats
  stats: invoke('stats'), procs: invoke('procs'),
  speedtest: invoke('speedtest'), speedtestLast: invoke('speedtest-last'), onSpeedtest: on('speedtest-progress'),

  // aujourd'hui
  todos: invoke('todos'), todosSave: invoke('todos-save'),
  calendar: invoke('calendar'), weather: invoke('weather'), geocode: invoke('geocode'), notify: invoke('notify'),

  // outils
  clipList: invoke('clip-list'), clipCopy: invoke('clip-copy'), clipRemove: invoke('clip-remove'), clipClear: invoke('clip-clear'), onClip: on('clip-update'),
  appsList: invoke('apps-list'), appIcon: invoke('app-icon'), appLaunch: invoke('app-launch'), appFav: invoke('app-fav'),
  shelfList: invoke('shelf-list'), shelfAdd: invoke('shelf-add'), shelfRemove: invoke('shelf-remove'), shelfClear: invoke('shelf-clear'),
  shelfIcon: invoke('shelf-icon'), shelfOpen: invoke('shelf-open'), shelfReveal: invoke('shelf-reveal'), shelfDrag: sendTo('shelf-drag'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  openUri: invoke('open-uri'), openDataFolder: invoke('open-data-folder'), power: invoke('power'),

  // terminal
  ptyStart: invoke('pty-start'), ptyWrite: sendTo('pty-write'), ptyResize: sendTo('pty-resize'),
  onPtyData: on('pty-data'), onPtyExit: on('pty-exit'),

  // Claude
  claudeAsk: invoke('claude-ask'), claudeStop: invoke('claude-stop'), claudeUsage: invoke('claude-usage'), onClaude: on('claude-event'),

  // reglages
  configGet: invoke('config-get'), configSet: invoke('config-set'), loginSet: invoke('login-set'),
});

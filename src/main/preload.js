const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => { const f = (_e, ...a) => cb(...a); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };

contextBridge.exposeInMainWorld('island', {
  captureMouse: (v) => ipcRenderer.send('capture-mouse', v),
  collapsed: () => ipcRenderer.send('collapsed'),
  focusWindow: () => ipcRenderer.send('focus-window'),
  onToggle: on('toggle'),
  onTuck: on('tuck'),
  onReveal: on('reveal'),

  helper: (op, arg) => ipcRenderer.invoke('helper', op, arg),
  stats: () => ipcRenderer.invoke('stats'),

  clipList: () => ipcRenderer.invoke('clip-list'),
  clipCopy: (t) => ipcRenderer.invoke('clip-copy', t),
  clipRemove: (at) => ipcRenderer.invoke('clip-remove', at),
  clipClear: () => ipcRenderer.invoke('clip-clear'),
  onClip: on('clip-update'),

  appsList: () => ipcRenderer.invoke('apps-list'),
  appIcon: (p) => ipcRenderer.invoke('app-icon', p),
  appLaunch: (p) => ipcRenderer.invoke('app-launch', p),
  appFav: (p, v) => ipcRenderer.invoke('app-fav', p, v),
  openUri: (u) => ipcRenderer.invoke('open-uri', u),
  power: (a) => ipcRenderer.invoke('power', a),

  todos: () => ipcRenderer.invoke('todos'),
  todosSave: (t) => ipcRenderer.invoke('todos-save', t),
  calendar: (force) => ipcRenderer.invoke('calendar', force),
  weather: () => ipcRenderer.invoke('weather'),

  ptyStart: (c, r) => ipcRenderer.invoke('pty-start', c, r),
  ptyWrite: (d) => ipcRenderer.send('pty-write', d),
  ptyResize: (c, r) => ipcRenderer.send('pty-resize', c, r),
  onPtyData: on('pty-data'),
  onPtyExit: on('pty-exit'),

  claudeAsk: (p, cont) => ipcRenderer.invoke('claude-ask', p, cont),
  claudeStop: () => ipcRenderer.invoke('claude-stop'),
  claudeUsage: () => ipcRenderer.invoke('claude-usage'),
  onClaude: on('claude-event'),
});

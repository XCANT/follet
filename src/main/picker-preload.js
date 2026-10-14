// Pont de la fenetre de selection (OCR, pipette) : recoit l'ecran fige, renvoie la zone ou la couleur.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  onInit: (cb) => ipcRenderer.once('picker-init', (_e, d) => cb(d)),
  ready: () => ipcRenderer.send('picker-ready'),
  done: (res) => ipcRenderer.send('picker-done', res),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  startDrag: (offset) => ipcRenderer.send('drag-start', offset),
  endDrag: () => ipcRenderer.send('drag-end'),
  showMenu: () => ipcRenderer.send('show-menu'),
  feed: () => ipcRenderer.send('feed-pet'),
  animationComplete: (state) => ipcRenderer.send('animation-complete', state),
  onState: (callback) => ipcRenderer.on('pet-state', (_event, value) => callback(value))
});

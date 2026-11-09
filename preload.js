const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openAudio: () => ipcRenderer.invoke('audio:open'),
  openText: () => ipcRenderer.invoke('text:open'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (data, filePath) => ipcRenderer.invoke('project:save', { data, path: filePath }),
  saveProjectAs: (data) => ipcRenderer.invoke('project:saveAs', { data }),
  setFullscreen: (flag) => ipcRenderer.invoke('app:setFullscreen', flag),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggleFullscreen'),
  audioURL: (filePath) => ipcRenderer.invoke('audio:url', filePath),
  alignAudio: (payload) => ipcRenderer.invoke('alignment:start', payload),
  cancelAlignment: () => ipcRenderer.invoke('alignment:cancel')
});

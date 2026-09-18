const { contextBridge, ipcRenderer } = require('electron');

// レンダラー（画面側）から安全に使えるAPIだけを公開する
contextBridge.exposeInMainWorld('api', {
  getStore: () => ipcRenderer.invoke('store:get'),
  setStore: (data) => ipcRenderer.invoke('store:set', data),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  fetchText: (url) => ipcRenderer.invoke('net:fetchText', url),
});

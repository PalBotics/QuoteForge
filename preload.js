const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quoteForgeApi', {
  getInitialState: () => ipcRenderer.invoke('app:get-initial-state'),
  generateQuoteNumber: () => ipcRenderer.invoke('app:generate-quote-number'),
  chatTurn: (payload) => ipcRenderer.invoke('ai:chat-turn', payload),
  savePdf: (payload) => ipcRenderer.invoke('pdf:save', payload),
  saveQuoteHistory: (payload) => ipcRenderer.invoke('quotes:save-history', payload),
  updateQuoteStatus: (payload) => ipcRenderer.invoke('quotes:update-status', payload),
  addClient: (payload) => ipcRenderer.invoke('clients:add', payload),
  updateClient: (payload) => ipcRenderer.invoke('clients:update', payload),
  deleteClient: (id) => ipcRenderer.invoke('clients:delete', id),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  updateApiKey: (apiKey) => ipcRenderer.invoke('settings:update-api-key', apiKey),
  pickLogo: () => ipcRenderer.invoke('logos:pick')
});

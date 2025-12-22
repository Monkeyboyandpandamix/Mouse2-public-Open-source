const { contextBridge, ipcRenderer } = require('electron');

const validDialogProperties = ['openFile', 'openDirectory', 'multiSelections', 'showHiddenFiles'];
const validFilterKeys = ['name', 'extensions'];

function sanitizeDialogOptions(options) {
  if (!options || typeof options !== 'object') {
    return {};
  }
  
  const sanitized = {};
  
  if (typeof options.title === 'string') {
    sanitized.title = options.title.substring(0, 100);
  }
  
  if (typeof options.defaultPath === 'string') {
    sanitized.defaultPath = options.defaultPath;
  }
  
  if (Array.isArray(options.properties)) {
    sanitized.properties = options.properties.filter(p => validDialogProperties.includes(p));
  }
  
  if (Array.isArray(options.filters)) {
    sanitized.filters = options.filters
      .filter(f => f && typeof f === 'object')
      .map(f => ({
        name: typeof f.name === 'string' ? f.name.substring(0, 50) : 'Files',
        extensions: Array.isArray(f.extensions) ? f.extensions.filter(e => typeof e === 'string').slice(0, 20) : []
      }))
      .slice(0, 10);
  }
  
  return sanitized;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', sanitizeDialogOptions(options)),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', sanitizeDialogOptions(options)),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isElectron: true,
  platform: process.platform
});

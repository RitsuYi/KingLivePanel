import { contextBridge, ipcRenderer } from 'electron';
import type { PanelAPI, Snapshot } from '../shared/model';

const api: PanelAPI = {
  snapshot: () => ipcRenderer.invoke('panel:snapshot'),
  subscribe: fn => {
    const handler = (_event: Electron.IpcRendererEvent, value: Snapshot) => fn(value);
    ipcRenderer.on('panel:changed', handler);
    return () => ipcRenderer.removeListener('panel:changed', handler);
  },
  setSlot: (id, status) => ipcRenderer.invoke('panel:set-slot', id, status),
  applyLayout: layout => ipcRenderer.invoke('panel:layout', layout),
  setHeart: settings => ipcRenderer.invoke('panel:heart', settings),
  refreshHeart: () => ipcRenderer.invoke('panel:heart-refresh'),
  display: action => ipcRenderer.invoke('panel:display', action),
  openHelp: target => ipcRenderer.invoke('panel:help', target),
};
contextBridge.exposeInMainWorld('panel', api);

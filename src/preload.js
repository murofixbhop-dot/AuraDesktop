'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((arg) => arg.startsWith('--aura-version='));
const appVersion = versionArg ? versionArg.slice('--aura-version='.length) : '1.0.0';

contextBridge.exposeInMainWorld('auraDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: appVersion,
  reload: () => ipcRenderer.invoke('aura:reload'),
  openExternal: (url) => ipcRenderer.invoke('aura:open-external', url)
});

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'aura-desktop-media') return;
  ipcRenderer.send('aura:media-state', {
    type: data.type,
    streamId: data.streamId,
    kind: data.kind
  });
});

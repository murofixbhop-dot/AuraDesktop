'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  dialog,
  desktopCapturer,
  ipcMain,
  nativeImage,
  powerSaveBlocker,
  session,
  shell
} = require('electron');
const { autoUpdater } = require('electron-updater');

const APP_ID = 'com.aura.messenger.desktop';
const DEFAULT_SERVER_URL = 'https://chat-9l7f.onrender.com';
const UPDATE_REPO = process.env.AURA_UPDATE_REPO || 'AuraDesktop';
const UPDATE_OWNER = process.env.AURA_UPDATE_OWNER || process.env.GITHUB_REPOSITORY_OWNER || '';
const IS_DEV = !app.isPackaged || process.env.AURA_ELECTRON_DEV === '1';

let mainWindow = null;
let tray = null;
let isQuitting = false;
let powerBlockerId = null;
const activeMediaStreams = new Set();

app.setName('Aura Messenger');
app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const sourceServer = normalizeServerUrl(process.env.AURA_SERVER_URL || DEFAULT_SERVER_URL);
const appUrl = buildAppUrl(sourceServer);
const serverOrigin = new URL(sourceServer).origin;

function normalizeServerUrl(value) {
  const raw = String(value || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

function buildAppUrl(base) {
  const url = new URL('/app.html', base);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('platform', process.platform);
  return url.toString();
}

function isAuraUrl(value) {
  try {
    return new URL(value).origin === serverOrigin;
  } catch {
    return false;
  }
}

function withDesktopParams(value) {
  try {
    const url = new URL(value, sourceServer);
    if (url.origin !== serverOrigin) return value;
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/app.html';
    if (url.pathname === '/app.html') {
      url.searchParams.set('desktop', '1');
      url.searchParams.set('platform', process.platform);
    }
    return url.toString();
  } catch {
    return appUrl;
  }
}

function getAssetPath(fileName) {
  const unpacked = path.join(process.resourcesPath || '', fileName);
  if (app.isPackaged && fs.existsSync(unpacked)) return unpacked;
  return path.join(__dirname, '..', 'build', fileName);
}

function getStatePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(next) {
  const current = readState();
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getStatePath(), JSON.stringify({ ...current, ...next }, null, 2));
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({
    title,
    body,
    icon: getAssetPath('icon.png')
  }).show();
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function startPowerBlocker() {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) return;
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
}

function stopPowerBlockerIfIdle() {
  if (activeMediaStreams.size > 0) return;
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  powerBlockerId = null;
}

function setupSession() {
  const ses = session.fromPartition('persist:aura-desktop');
  const allowedPermissions = new Set([
    'media',
    'display-capture',
    'notifications',
    'fullscreen',
    'clipboard-read',
    'speaker-selection'
  ]);

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const allowed = isAuraUrl(requestingUrl) && allowedPermissions.has(permission);
    callback(allowed);
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return isAuraUrl(requestingOrigin || webContents.getURL()) && allowedPermissions.has(permission);
  });

  if (typeof ses.setDisplayMediaRequestHandler === 'function') {
    ses.setDisplayMediaRequestHandler(async (_request, callback) => {
      startPowerBlocker();
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        fetchWindowIcons: true,
        thumbnailSize: { width: 280, height: 180 }
      });
      if (!sources.length) {
        callback({});
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    }, { useSystemPicker: true });
  }

  ses.on('will-download', (_event, item) => {
    const downloadDir = path.join(app.getPath('downloads'), 'Aura Messenger');
    fs.mkdirSync(downloadDir, { recursive: true });
    const fileName = sanitizeFileName(item.getFilename() || 'aura-download');
    item.setSavePath(path.join(downloadDir, fileName));

    item.once('done', (_downloadEvent, state) => {
      if (state === 'completed') {
        notify('Aura Messenger', `Файл сохранен: ${fileName}`);
      } else if (state !== 'cancelled') {
        notify('Aura Messenger', 'Не удалось скачать файл.');
      }
    });
  });
}

function sanitizeFileName(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180);
}

async function createWindow() {
  const state = readState();
  const icon = getAssetPath('icon.ico');
  const windowOptions = {
    width: state.width || 1280,
    height: state.height || 820,
    minWidth: 960,
    minHeight: 640,
    x: state.x,
    y: state.y,
    show: false,
    title: 'Aura Messenger',
    backgroundColor: '#101320',
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      spellcheck: true,
      partition: 'persist:aura-desktop',
      additionalArguments: [`--aura-version=${app.getVersion()}`]
    }
  };

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setUserAgent(`${mainWindow.webContents.getUserAgent()} AuraDesktop/${app.getVersion()}`);

  mainWindow.on('close', (event) => {
    writeState(mainWindow.getBounds());
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    const stateNow = readState();
    if (!stateNow.trayHintShown) {
      writeState({ trayHintShown: true });
      notify('Aura Messenger', 'Приложение продолжает работать в трее.');
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuraUrl(url)) {
      mainWindow.loadURL(withDesktopParams(url));
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAuraUrl(url)) {
      const nextUrl = withDesktopParams(url);
      if (nextUrl !== url) {
        event.preventDefault();
        mainWindow.loadURL(nextUrl);
      }
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const currentUrl = mainWindow.webContents.getURL();
    if (isAuraUrl(currentUrl)) injectDesktopRuntime();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    showOffline(errorDescription || validatedURL || 'network error');
  });

  if (IS_DEV) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  await mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.show();
  setTimeout(() => loadMessenger(), 350);
}

function injectDesktopRuntime() {
  const script = `
    (() => {
      if (window.__auraDesktopMediaPatch) return;
      window.__auraDesktopMediaPatch = true;
      let nextStreamId = 1;
      const post = (payload) => window.postMessage({ source: 'aura-desktop-media', ...payload }, '*');
      const watchStream = (stream, kind) => {
        const streamId = String(nextStreamId++);
        post({ type: 'start', streamId, kind });
        const stop = () => {
          if ([...stream.getTracks()].every((track) => track.readyState === 'ended')) {
            post({ type: 'stop', streamId, kind });
          }
        };
        stream.getTracks().forEach((track) => track.addEventListener('ended', stop, { once: true }));
        return stream;
      };
      if (navigator.mediaDevices?.getUserMedia) {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => {
          const stream = await original(...args);
          return watchStream(stream, 'media');
        };
      }
      if (navigator.mediaDevices?.getDisplayMedia) {
        const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getDisplayMedia = async (...args) => {
          const stream = await original(...args);
          return watchStream(stream, 'display');
        };
      }
      window.auraDesktopReady = true;
    })();
  `;
  mainWindow.webContents.executeJavaScript(script, true).catch(() => {});
}

function loadMessenger() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(appUrl).catch((error) => showOffline(error.message));
}

function showOffline(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const offlinePath = path.join(__dirname, 'offline.html');
  const query = new URLSearchParams({
    server: sourceServer,
    message: String(message || '')
  });
  mainWindow.loadFile(offlinePath, { query: Object.fromEntries(query.entries()) }).catch(() => {});
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(getAssetPath('icon.png')).resize({ width: 18, height: 18 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Aura Messenger');
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showMainWindow();
  });
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const autoLaunchEnabled = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Aura', click: showMainWindow },
    { label: 'Перезагрузить', click: loadMessenger },
    { label: 'Проверить обновления', click: () => checkForUpdates(true) },
    {
      label: 'Запускать с Windows',
      type: 'checkbox',
      checked: autoLaunchEnabled,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath
        });
        rebuildTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Выйти',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createMenu() {
  const template = [
    {
      label: 'Aura',
      submenu: [
        { label: 'Открыть Aura', click: showMainWindow },
        { label: 'Перезагрузить', accelerator: 'CmdOrCtrl+R', click: loadMessenger },
        { label: 'Проверить обновления', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: 'Выйти', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'togglefullscreen', label: 'Полный экран' },
        ...(IS_DEV ? [{ role: 'toggleDevTools', label: 'DevTools' }] : [])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  if (UPDATE_OWNER) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: UPDATE_OWNER,
      repo: UPDATE_REPO
    });
  }

  autoUpdater.on('update-available', async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Скачать', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Обновление Aura',
      message: `Доступна версия ${info.version}.`,
      detail: 'Aura скачает обновление в фоне и предложит перезапуск.'
    });
    if (result.response === 0) autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', () => {
    notify('Aura Messenger', 'Установлена последняя версия.');
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Перезапустить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Обновление готово',
      message: `Aura ${info.version} скачана.`,
      detail: 'Перезапустите приложение, чтобы установить обновление.'
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', (error) => {
    console.warn('[autoUpdater]', error?.message || error);
  });
}

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Обновления',
        message: 'Автообновления проверяются только в собранном приложении.'
      });
    }
    return;
  }

  if (!UPDATE_OWNER) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'GitHub Releases не настроен',
        message: 'Укажите AURA_UPDATE_OWNER перед сборкой или запуском релизной версии.',
        detail: `Репозиторий по умолчанию: ${UPDATE_REPO}`
      });
    }
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Ошибка обновления',
        message: error?.message || 'Не удалось проверить обновления.'
      });
    }
  }
}

ipcMain.handle('aura:reload', () => {
  loadMessenger();
});

ipcMain.handle('aura:open-external', (_event, url) => {
  const target = String(url || appUrl);
  shell.openExternal(target);
});

ipcMain.on('aura:media-state', (_event, payload) => {
  if (!payload?.streamId) return;
  if (payload.type === 'start') {
    activeMediaStreams.add(payload.streamId);
    startPowerBlocker();
    return;
  }
  if (payload.type === 'stop') {
    activeMediaStreams.delete(payload.streamId);
    stopPowerBlockerIfIdle();
  }
});

app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find((item) => String(item).startsWith('aura://'));
  showMainWindow();
  if (deepLink) loadMessenger();
});

app.on('open-url', (event) => {
  event.preventDefault();
  showMainWindow();
  loadMessenger();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient('aura');
  setupSession();
  createMenu();
  setupAutoUpdates();
  createTray();
  await createWindow();
  setTimeout(() => checkForUpdates(false), 4500);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep tray session alive on Windows.
  }
});

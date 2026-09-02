import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applyMetrics, capture, type DeviceMetrics } from './emulation';
import { loadState, saveState, type PersistedState } from './store';
import { parseCli, userArgs } from './cli';
import { runSmokeTest } from './smoke';

const GUEST_PARTITION = 'persist:frame-guests';
const isDev = !app.isPackaged;
const cli = parseCli(userArgs(process.argv, Boolean(process.defaultApp)));

let mainWindow: BrowserWindow | null = null;

function guestPreloadPath(): string {
  return join(app.getAppPath(), 'dist', 'preload', 'guest.js');
}

function createWindow(): void {
  const state = loadState();
  mainWindow = new BrowserWindow({
    width: state.window?.width ?? 1440,
    height: state.window?.height ?? 900,
    x: state.window?.x,
    y: state.window?.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: state.theme === 'light' ? '#f4f5f7' : '#16181d',
    title: 'Frame',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist', 'preload', 'host.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  if (isDev && !cli.smoke) mainWindow.webContents.openDevTools({ mode: 'detach' });
  if (cli.smoke) runSmokeTest(mainWindow);

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    saveState({ window: { width, height, x, y } });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Une vue invitée ne doit jamais ouvrir de fenêtre Electron : on renvoie vers le navigateur.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

function hardenGuestSession(): void {
  const guests = session.fromPartition(GUEST_PARTITION);
  // Les sites testés sont du contenu tiers arbitraire : aucune permission n'est accordée.
  guests.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  guests.setPermissionCheckHandler(() => false);
}

function buildMenu(): void {
  const send = (channel: string) => () => mainWindow?.webContents.send(channel);
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Capturer tous les appareils', accelerator: 'CmdOrCtrl+Shift+S', click: send('menu:capture-all') },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Recharger les appareils', accelerator: 'CmdOrCtrl+R', click: send('menu:reload-all') },
        { label: 'Pivoter', accelerator: 'CmdOrCtrl+Alt+R', click: send('menu:rotate') },
        { type: 'separator' },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', click: send('menu:zoom-in') },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: send('menu:zoom-out') },
        { label: 'Zoom 100 %', accelerator: 'CmdOrCtrl+0', click: send('menu:zoom-reset') },
        { type: 'separator' },
        { label: 'Thème clair / sombre', accelerator: 'CmdOrCtrl+Shift+T', click: send('menu:toggle-theme') },
        { role: 'toggleDevTools', label: 'Outils de développement' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', () => ({
    state: { ...loadState(), ...(cli.url !== null ? { url: cli.url } : {}) },
    guestPreload: `file://${guestPreloadPath()}`,
    partition: GUEST_PARTITION,
    version: app.getVersion(),
  }));

  ipcMain.handle('app:save-state', (_e, patch: Partial<PersistedState>) => {
    saveState(patch);
  });

  ipcMain.handle('device:apply-metrics', async (_e, id: number, metrics: DeviceMetrics) => {
    await applyMetrics(id, metrics);
  });

  ipcMain.handle('device:open-external', async (_e, url: string) => {
    if (/^https?:/i.test(url)) await shell.openExternal(url);
  });

  ipcMain.handle(
    'device:capture',
    async (_e, shots: Array<{ id: number; label: string }>, fullPage: boolean) => {
      if (shots.length === 0) return { saved: 0, directory: '' };
      const picked = await dialog.showOpenDialog({
        title: 'Dossier de destination des captures',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: app.getPath('pictures'),
      });
      if (picked.canceled || picked.filePaths[0] === undefined) return { saved: 0, directory: '' };

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const directory = join(picked.filePaths[0], `frame-${stamp}`);
      await mkdir(directory, { recursive: true });

      let saved = 0;
      for (const shot of shots) {
        try {
          const png = await capture(shot.id, fullPage);
          const safe = shot.label.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
          await writeFile(join(directory, `${safe || 'device'}.png`), png);
          saved += 1;
        } catch {
          // Un appareil qui échoue (page non chargée) ne doit pas annuler les autres captures.
        }
      }
      return { saved, directory };
    },
  );
}

app.whenReady().then(() => {
  hardenGuestSession();
  registerIpc();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

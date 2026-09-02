import { contextBridge, ipcRenderer } from 'electron';

export interface Bootstrap {
  state: {
    url: string;
    selection: string[];
    landscape: boolean;
    zoom: number;
    theme: 'dark' | 'light';
    syncScroll: boolean;
  };
  guestPreload: string;
  partition: string;
  version: string;
}

const MENU_CHANNELS = [
  'menu:capture-all',
  'menu:reload-all',
  'menu:rotate',
  'menu:zoom-in',
  'menu:zoom-out',
  'menu:zoom-reset',
  'menu:toggle-theme',
] as const;

export type MenuChannel = (typeof MENU_CHANNELS)[number];

const api = {
  bootstrap: (): Promise<Bootstrap> => ipcRenderer.invoke('app:bootstrap'),
  saveState: (patch: Record<string, unknown>): Promise<void> => ipcRenderer.invoke('app:save-state', patch),
  applyMetrics: (id: number, metrics: unknown): Promise<void> =>
    ipcRenderer.invoke('device:apply-metrics', id, metrics),
  capture: (
    shots: Array<{ id: number; label: string }>,
    fullPage: boolean,
  ): Promise<{ saved: number; directory: string }> => ipcRenderer.invoke('device:capture', shots, fullPage),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('device:open-external', url),
  onMenu: (handler: (channel: MenuChannel) => void): void => {
    for (const channel of MENU_CHANNELS) {
      ipcRenderer.on(channel, () => handler(channel));
    }
  },
};

contextBridge.exposeInMainWorld('frame', api);

export type FrameApi = typeof api;

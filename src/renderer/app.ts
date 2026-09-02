import {
  CATEGORY_LABELS,
  DEFAULT_SELECTION,
  DEVICES,
  devicesByCategory,
  findDevice,
  normalizeUrl,
  orientedSize,
  type Device,
} from '../shared/devices';

interface FrameApi {
  bootstrap(): Promise<{
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
  }>;
  saveState(patch: Record<string, unknown>): Promise<void>;
  applyMetrics(id: number, metrics: Record<string, unknown>): Promise<void>;
  capture(
    shots: Array<{ id: number; label: string }>,
    fullPage: boolean,
  ): Promise<{ saved: number; directory: string }>;
  openExternal(url: string): Promise<void>;
  onMenu(handler: (channel: string) => void): void;
}

declare global {
  interface Window {
    frame: FrameApi;
  }
}

interface FrameView {
  device: Device;
  section: HTMLElement;
  scale: HTMLElement;
  viewport: HTMLElement;
  size: HTMLElement;
  webview: Electron.WebviewTag;
  ready: boolean;
  /** Dernières métriques réellement transmises au moteur, relues par le mode --smoke. */
  applied: { width: number; height: number; dpr: number; touch: boolean } | null;
}

const api = window.frame;
const views = new Map<string, FrameView>();

// Point d'observation utilisé par le mode --smoke (src/main/smoke.ts).
(window as unknown as Record<string, unknown>)['__frameViews'] = views;

const state = {
  url: 'https://example.com',
  selection: [] as string[],
  landscape: false,
  zoom: 0.5,
  theme: 'dark' as 'dark' | 'light',
  syncScroll: true,
};

let guestPreload = '';
let partition = '';
/** Empêche une navigation propagée de se re-propager en boucle. */
let navigating = false;
let scrollLeader: string | null = null;

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`élément #${id} absent du document`);
  return node as T;
};

const stage = el('stage');
const deviceList = el('device-list');
const urlInput = el<HTMLInputElement>('url-input');
const zoomInput = el<HTMLInputElement>('zoom');
const zoomValue = el('zoom-value');
const syncScrollInput = el<HTMLInputElement>('sync-scroll');
const statusText = el('status-text');
const statusMeta = el('status-meta');
const template = el<HTMLTemplateElement>('frame-template');

function status(message: string): void {
  statusText.textContent = message;
}

function refreshMeta(): void {
  const count = views.size;
  statusMeta.textContent = `${count} appareil${count > 1 ? 's' : ''} · zoom ${Math.round(state.zoom * 100)} % · ${
    state.landscape ? 'paysage' : 'portrait'
  }`;
}

function persist(): void {
  void api.saveState({
    url: state.url,
    selection: state.selection,
    landscape: state.landscape,
    zoom: state.zoom,
    theme: state.theme,
    syncScroll: state.syncScroll,
  });
}

/* ---------------------------------------------------------------- appareils */

function buildDeviceList(): void {
  deviceList.replaceChildren();
  for (const [category, devices] of devicesByCategory()) {
    const group = document.createElement('div');
    group.className = 'group';
    const heading = document.createElement('h3');
    heading.textContent = CATEGORY_LABELS[category];
    group.append(heading);

    for (const device of devices) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = device.id;
      box.checked = state.selection.includes(device.id);
      box.addEventListener('change', () => toggleDevice(device.id, box.checked));

      const name = document.createElement('span');
      name.textContent = device.name;
      const dims = document.createElement('span');
      dims.className = 'dims';
      dims.textContent = `${device.width}×${device.height}`;

      label.append(box, name, dims);
      group.append(label);
    }
    deviceList.append(group);
  }
}

function toggleDevice(id: string, on: boolean): void {
  const next = new Set(state.selection);
  if (on) next.add(id);
  else next.delete(id);
  state.selection = DEVICES.filter((d) => next.has(d.id)).map((d) => d.id);
  syncStage();
  persist();
}

/* ------------------------------------------------------------------ cadres */

function createView(device: Device): FrameView {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const section = fragment.querySelector('.frame') as HTMLElement;
  const scale = section.querySelector('.frame-scale') as HTMLElement;
  const viewport = section.querySelector('.frame-viewport') as HTMLElement;
  const size = section.querySelector('.frame-size') as HTMLElement;
  (section.querySelector('.frame-name') as HTMLElement).textContent = device.name;

  const webview = document.createElement('webview') as Electron.WebviewTag;
  // On démarre sur une page vide : les overrides d'émulation doivent être en place
  // avant que le site ne s'exécute, sinon ses scripts lisent un viewport de 0×0.
  webview.setAttribute('src', 'about:blank');
  webview.setAttribute('preload', guestPreload);
  webview.setAttribute('partition', partition);
  webview.setAttribute('useragent', device.userAgent);
  scale.append(webview);

  const view: FrameView = { device, section, scale, viewport, size, webview, ready: false, applied: null };

  webview.addEventListener('dom-ready', () => {
    const first = !view.ready;
    view.ready = true;
    void applyMetrics(view).then(() => {
      if (first) view.webview.loadURL(state.url).catch(() => status(`URL refusée : ${state.url}`));
    });
  });
  webview.addEventListener('did-start-loading', () => status(`Chargement — ${device.name}…`));
  webview.addEventListener('did-stop-loading', () => status(`${device.name} : chargé.`));
  webview.addEventListener('did-fail-load', (event) => {
    // -3 = chargement interrompu par une navigation volontaire, sans intérêt pour l'utilisateur.
    if (event.errorCode !== -3) status(`${device.name} : échec (${event.errorDescription}).`);
  });
  webview.addEventListener('did-navigate', (event) => propagate(event.url));
  webview.addEventListener('did-navigate-in-page', (event) => {
    if (event.isMainFrame) propagate(event.url);
  });
  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'guest:scroll') onGuestScroll(device.id, event.args[0] as number);
  });

  section.querySelector('.act-reload')?.addEventListener('click', () => view.webview.reload());
  section.querySelector('.act-external')?.addEventListener('click', () => {
    void api.openExternal(view.webview.getURL());
  });
  section.querySelector('.act-shot')?.addEventListener('click', () => {
    void captureViews([view]);
  });

  return view;
}

function layout(view: FrameView): void {
  const { width, height } = orientedSize(view.device, state.landscape);
  view.webview.style.width = `${width}px`;
  view.webview.style.height = `${height}px`;
  view.scale.style.transform = `scale(${state.zoom})`;
  const scaledWidth = Math.round(width * state.zoom);
  view.viewport.style.width = `${scaledWidth}px`;
  view.viewport.style.height = `${Math.round(height * state.zoom)}px`;
  // Sans largeur imposée, l'en-tête (titre + boutons) élargirait le cadre au-delà de l'écran simulé.
  view.section.style.width = `${Math.max(scaledWidth, 190)}px`;
  view.size.textContent = `${width}×${height} · DPR ${view.device.dpr} · ${
    view.device.touch ? 'tactile' : 'souris'
  }`;
}

async function applyMetrics(view: FrameView): Promise<void> {
  if (!view.ready) return;
  const { width, height } = orientedSize(view.device, state.landscape);
  const mobile = view.device.category === 'phone' || view.device.category === 'tablet';
  try {
    await api.applyMetrics(view.webview.getWebContentsId(), {
      width,
      height,
      dpr: view.device.dpr,
      mobile,
      touch: view.device.touch,
      landscape: state.landscape && mobile,
      userAgent: view.device.userAgent,
    });
    view.applied = { width, height, dpr: view.device.dpr, touch: view.device.touch };
  } catch (error) {
    view.applied = null;
    status(`${view.device.name} : émulation indisponible (${(error as Error).message}).`);
  }
}

function syncStage(): void {
  for (const [id, view] of views) {
    if (!state.selection.includes(id)) {
      view.section.remove();
      views.delete(id);
    }
  }
  for (const id of state.selection) {
    if (views.has(id)) continue;
    const device = findDevice(id);
    if (!device) continue;
    const view = createView(device);
    views.set(id, view);
    layout(view);
  }
  // Réordonne le DOM selon l'ordre du catalogue, indépendamment de l'ordre de cochage.
  stage.replaceChildren(
    ...state.selection.map((id) => views.get(id)?.section).filter((n): n is HTMLElement => Boolean(n)),
  );
  if (views.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Sélectionnez au moins un appareil dans le panneau de gauche.';
    stage.append(empty);
  }
  refreshMeta();
}

function relayoutAll(): void {
  for (const view of views.values()) {
    layout(view);
    void applyMetrics(view);
  }
  refreshMeta();
}

/* -------------------------------------------------------------- navigation */

function loadUrl(raw: string): void {
  const url = normalizeUrl(raw);
  state.url = url;
  urlInput.value = url;
  navigating = true;
  for (const view of views.values()) {
    view.webview.loadURL(url).catch(() => status(`URL refusée : ${url}`));
  }
  navigating = false;
  persist();
}

function propagate(url: string): void {
  if (navigating || url === state.url || url === 'about:blank') return;
  state.url = url;
  urlInput.value = url;
  navigating = true;
  for (const view of views.values()) {
    if (view.webview.getURL() !== url) view.webview.loadURL(url).catch(() => undefined);
  }
  navigating = false;
  persist();
}

/* ------------------------------------------------------------ défilement */

let scrollFrame = 0;
let pendingScroll: { id: string; value: number } | null = null;

function onGuestScroll(id: string, value: number): void {
  if (!state.syncScroll) return;
  // Le premier appareil qui défile mène la danse jusqu'à ce qu'il s'arrête,
  // sinon les vues se renvoient leur position mutuellement.
  if (scrollLeader !== null && scrollLeader !== id) return;
  scrollLeader = id;
  pendingScroll = { id, value };
  if (scrollFrame !== 0) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const job = pendingScroll;
    pendingScroll = null;
    if (!job) return;
    for (const [otherId, view] of views) {
      if (otherId !== job.id && view.ready) view.webview.send('guest:apply-scroll', job.value);
    }
    window.setTimeout(() => {
      if (scrollLeader === job.id) scrollLeader = null;
    }, 120);
  });
}

/* ---------------------------------------------------------------- captures */

async function captureViews(targets: FrameView[]): Promise<void> {
  const shots = targets
    .filter((view) => view.ready)
    .map((view) => ({
      id: view.webview.getWebContentsId(),
      label: `${view.device.name}-${orientedSize(view.device, state.landscape).width}`,
    }));
  if (shots.length === 0) {
    status('Aucun appareil prêt à être capturé.');
    return;
  }
  status('Capture en cours…');
  const result = await api.capture(shots, true);
  status(
    result.saved > 0
      ? `${result.saved} capture(s) enregistrée(s) dans ${result.directory}`
      : 'Capture annulée.',
  );
}

/* ------------------------------------------------------------------ thème */

function applyTheme(): void {
  document.body.dataset['theme'] = state.theme;
}

function setZoom(value: number): void {
  state.zoom = Math.min(1, Math.max(0.2, Math.round(value * 20) / 20));
  zoomInput.value = String(Math.round(state.zoom * 100));
  zoomValue.textContent = `${Math.round(state.zoom * 100)} %`;
  for (const view of views.values()) layout(view);
  refreshMeta();
  persist();
}

/* ------------------------------------------------------------- évènements */

function wireUi(): void {
  el('url-form').addEventListener('submit', (event) => {
    event.preventDefault();
    loadUrl(urlInput.value);
  });
  el('reload').addEventListener('click', () => {
    for (const view of views.values()) view.webview.reload();
  });
  el('back').addEventListener('click', () => {
    for (const view of views.values()) if (view.webview.canGoBack()) view.webview.goBack();
  });
  el('forward').addEventListener('click', () => {
    for (const view of views.values()) if (view.webview.canGoForward()) view.webview.goForward();
  });
  el('rotate').addEventListener('click', rotate);
  el('capture').addEventListener('click', () => void captureViews([...views.values()]));
  el('theme').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persist();
  });
  zoomInput.addEventListener('input', () => setZoom(Number(zoomInput.value) / 100));
  syncScrollInput.addEventListener('change', () => {
    state.syncScroll = syncScrollInput.checked;
    persist();
  });

  api.onMenu((channel) => {
    switch (channel) {
      case 'menu:capture-all':
        void captureViews([...views.values()]);
        break;
      case 'menu:reload-all':
        for (const view of views.values()) view.webview.reload();
        break;
      case 'menu:rotate':
        rotate();
        break;
      case 'menu:zoom-in':
        setZoom(state.zoom + 0.05);
        break;
      case 'menu:zoom-out':
        setZoom(state.zoom - 0.05);
        break;
      case 'menu:zoom-reset':
        setZoom(1);
        break;
      case 'menu:toggle-theme':
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
        persist();
        break;
    }
  });
}

function rotate(): void {
  state.landscape = !state.landscape;
  relayoutAll();
  persist();
}

async function main(): Promise<void> {
  const boot = await api.bootstrap();
  guestPreload = boot.guestPreload;
  partition = boot.partition;
  Object.assign(state, boot.state);
  if (state.selection.length === 0) state.selection = [...DEFAULT_SELECTION];

  applyTheme();
  urlInput.value = state.url;
  syncScrollInput.checked = state.syncScroll;
  zoomInput.value = String(Math.round(state.zoom * 100));
  zoomValue.textContent = `${Math.round(state.zoom * 100)} %`;

  buildDeviceList();
  wireUi();
  syncStage();
  status(`Frame ${boot.version} — prêt.`);
}

void main();

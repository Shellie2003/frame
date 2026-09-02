import { webContents } from 'electron';
import type { WebContents } from 'electron';

export interface DeviceMetrics {
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  touch: boolean;
  landscape: boolean;
  userAgent: string;
}

const attached = new WeakSet<WebContents>();

function ensureAttached(wc: WebContents): void {
  if (attached.has(wc) || wc.debugger.isAttached()) {
    attached.add(wc);
    return;
  }
  wc.debugger.attach('1.3');
  attached.add(wc);
  wc.once('destroyed', () => attached.delete(wc));
}

function target(id: number): WebContents {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) throw new Error(`webContents ${id} introuvable`);
  return wc;
}

/**
 * Applique les métriques d'un appareil à une vue invitée via le protocole DevTools.
 * `setDeviceMetricsOverride` est ce qui fait réellement basculer les media queries et
 * le viewport meta : redimensionner l'élément <webview> ne suffit pas.
 */
export async function applyMetrics(id: number, m: DeviceMetrics): Promise<void> {
  const wc = target(id);
  ensureAttached(wc);
  await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: Math.round(m.width),
    height: Math.round(m.height),
    deviceScaleFactor: m.dpr,
    mobile: m.mobile,
    screenOrientation: m.landscape
      ? { type: 'landscapePrimary', angle: 90 }
      : { type: 'portraitPrimary', angle: 0 },
  });
  await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
    enabled: m.touch,
    maxTouchPoints: m.touch ? 5 : 1,
  });
  await wc.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', {
    enabled: m.touch,
    configuration: m.touch ? 'mobile' : 'desktop',
  });
  await wc.debugger.sendCommand('Emulation.setUserAgentOverride', {
    userAgent: m.userAgent,
    acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
    platform: m.mobile ? 'Linux armv8l' : 'Win32',
  });
}

/** Capture PNG de la page invitée, page entière plutôt que zone visible. */
export async function capture(id: number, fullPage: boolean): Promise<Buffer> {
  const wc = target(id);
  ensureAttached(wc);
  const result = (await wc.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
    fromSurface: true,
  })) as { data: string };
  return Buffer.from(result.data, 'base64');
}

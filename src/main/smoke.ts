import { app } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * Vérification automatisée exécutée par `npm run smoke` et par la CI.
 * Elle contrôle que chaque vue appareil est réellement émulée : le viewport vu par
 * la page invitée doit correspondre aux dimensions de l'appareil, pas à celles de la fenêtre.
 */
const CHECK_SCRIPT = `(async () => {
  const frames = [...document.querySelectorAll('.frame')];
  const views = window.__frameViews ? [...window.__frameViews.values()] : [];
  const results = [];
  for (const view of views) {
    try {
      const probe = await view.webview.executeJavaScript(
        'JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, coarse: matchMedia("(pointer: coarse)").matches })'
      );
      results.push({ id: view.device.id, expected: view.applied, actual: JSON.parse(probe) });
    } catch (error) {
      results.push({ id: view.device.id, error: String(error) });
    }
  }
  return JSON.stringify({ frames: frames.length, results });
})()`;

interface Probe {
  frames: number;
  results: Array<{
    id: string;
    error?: string;
    expected?: { width: number; height: number; dpr: number; touch: boolean } | null;
    actual?: { w: number; h: number; dpr: number; coarse: boolean };
  }>;
}

export function runSmokeTest(window: BrowserWindow, delayMs = 6000): void {
  window.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void (async () => {
        const failures: string[] = [];
        try {
          const raw = (await window.webContents.executeJavaScript(CHECK_SCRIPT)) as string;
          const probe = JSON.parse(raw) as Probe;
          if (probe.frames === 0) failures.push('aucun cadre appareil rendu');
          if (probe.results.length === 0) failures.push('aucune vue appareil exposée');

          for (const entry of probe.results) {
            if (entry.error !== undefined || !entry.actual || !entry.expected) {
              failures.push(`${entry.id} : sonde impossible (${entry.error ?? 'sans détail'})`);
              continue;
            }
            const { expected, actual } = entry;
            if (actual.w !== expected.width) {
              failures.push(`${entry.id} : viewport ${actual.w}px au lieu de ${expected.width}px`);
            }
            if (Math.abs(actual.dpr - expected.dpr) > 0.01) {
              failures.push(`${entry.id} : DPR ${actual.dpr} au lieu de ${expected.dpr}`);
            }
            if (actual.coarse !== expected.touch) {
              failures.push(`${entry.id} : pointer coarse=${actual.coarse}, attendu ${expected.touch}`);
            }
            console.log(
              `smoke: ${entry.id} → ${actual.w}×${actual.h} @${actual.dpr} ${
                actual.coarse ? 'tactile' : 'souris'
              }`,
            );
          }
        } catch (error) {
          failures.push(`sonde du renderer en échec : ${(error as Error).message}`);
        }

        if (failures.length > 0) {
          console.error('smoke: ÉCHEC\n  - ' + failures.join('\n  - '));
          app.exit(1);
        } else {
          console.log('smoke: OK');
          app.exit(0);
        }
      })();
    }, delayMs);
  });
}

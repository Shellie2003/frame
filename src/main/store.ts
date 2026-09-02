import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface PersistedState {
  url: string;
  selection: string[];
  landscape: boolean;
  zoom: number;
  theme: 'dark' | 'light';
  syncScroll: boolean;
  window?: { width: number; height: number; x?: number; y?: number };
}

const DEFAULTS: PersistedState = {
  url: 'https://example.com',
  selection: [],
  landscape: false,
  zoom: 0.5,
  theme: 'dark',
  syncScroll: true,
};

function file(): string {
  return join(app.getPath('userData'), 'frame-state.json');
}

export function loadState(): PersistedState {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<PersistedState>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveState(patch: Partial<PersistedState>): void {
  const next = { ...loadState(), ...patch };
  try {
    mkdirSync(dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // L'échec d'écriture des préférences ne doit jamais interrompre l'application.
  }
}

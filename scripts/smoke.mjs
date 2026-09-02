/**
 * Lance l'application empaquetée en mode vérification sur une page témoin locale.
 * Sur Linux sans serveur X (CI), on passe par xvfb-run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electron = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
if (!existsSync(electron)) {
  console.error('electron introuvable : lancez d’abord `npm install`.');
  process.exit(1);
}

const fixture = pathToFileURL(join(root, 'test', 'fixture', 'page.html')).href;
const args = ['.', fixture, '--smoke', '--no-sandbox'];
const headless = process.platform === 'linux' && !process.env['DISPLAY'];
const command = headless ? 'xvfb-run' : electron;
const argv = headless ? ['-a', electron, ...args] : args;

const result = spawnSync(command, argv, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  timeout: 120_000,
});

if (result.error) {
  console.error(`smoke: impossible de lancer ${command} :`, result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);

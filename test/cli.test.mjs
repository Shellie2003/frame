import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const js = transformSync(readFileSync(join(root, 'src/main/cli.ts'), 'utf8'), {
  loader: 'ts',
  format: 'esm',
}).code;
const { parseCli, userArgs } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

test('userArgs retire le binaire et le chemin du projet en développement', () => {
  assert.deepEqual(userArgs(['/usr/bin/electron', '/projet', 'https://a.test'], true), ['https://a.test']);
  assert.deepEqual(userArgs(['/apps/Frame', 'https://a.test'], false), ['https://a.test']);
});

test('userArgs ignore les drapeaux Chromium injectés par l’environnement', () => {
  assert.deepEqual(userArgs(['bin', 'app', '--no-sandbox', '--enable-logging'], true), []);
});

test('parseCli retient la première URL et le mode smoke', () => {
  assert.deepEqual(parseCli(['https://a.test', '--smoke', 'https://b.test']), {
    url: 'https://a.test',
    smoke: true,
  });
  assert.deepEqual(parseCli(['file:///tmp/page.html']), { url: 'file:///tmp/page.html', smoke: false });
  assert.deepEqual(parseCli([]), { url: null, smoke: false });
});

test('parseCli ignore une valeur qui n’est pas une URL', () => {
  assert.deepEqual(parseCli(['pas-une-url']), { url: null, smoke: false });
});

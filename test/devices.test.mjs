import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, 'src/shared/devices.ts'), 'utf8');
const js = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const { DEVICES, DEFAULT_SELECTION, findDevice, normalizeUrl, orientedSize, devicesByCategory } = mod;

test('les identifiants du catalogue sont uniques', () => {
  const ids = DEVICES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('chaque appareil a des dimensions et un user-agent plausibles', () => {
  for (const device of DEVICES) {
    assert.ok(device.width >= 320 && device.width <= 3840, `largeur ${device.name}`);
    assert.ok(device.height >= 480 && device.height <= 2160, `hauteur ${device.name}`);
    assert.ok(device.dpr >= 1 && device.dpr <= 4, `dpr ${device.name}`);
    assert.match(device.userAgent, /^Mozilla\/5\.0 /, `user-agent ${device.name}`);
  }
});

test('la sélection par défaut pointe vers des appareils existants', () => {
  for (const id of DEFAULT_SELECTION) assert.ok(findDevice(id), `${id} introuvable`);
});

test('chaque catégorie du catalogue est représentée', () => {
  for (const [category, devices] of devicesByCategory()) {
    assert.ok(devices.length > 0, `catégorie ${category} vide`);
  }
});

test('normalizeUrl complète les domaines et les adresses locales', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('  example.com/a?b=1 '), 'https://example.com/a?b=1');
  assert.equal(normalizeUrl('localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeUrl('127.0.0.1:8080/app'), 'http://127.0.0.1:8080/app');
  assert.equal(normalizeUrl('http://deja.complet'), 'http://deja.complet');
  assert.equal(normalizeUrl('about:blank'), 'about:blank');
  assert.equal(normalizeUrl(''), 'about:blank');
});

test('normalizeUrl bascule en recherche pour une saisie non-URL', () => {
  assert.match(normalizeUrl('responsive design'), /^https:\/\/duckduckgo\.com\/\?q=/);
});

test('orientedSize ne pivote que les mobiles et tablettes', () => {
  const phone = findDevice('iphone-15');
  assert.deepEqual(orientedSize(phone, false), { width: 393, height: 852 });
  assert.deepEqual(orientedSize(phone, true), { width: 852, height: 393 });

  const desktop = findDevice('desktop-1080p');
  assert.deepEqual(orientedSize(desktop, true), { width: 1920, height: 1080 });
});

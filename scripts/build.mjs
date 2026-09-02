import { build, context } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const dev = watch || process.env['NODE_ENV'] === 'development';

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  logLevel: 'info',
  target: 'chrome128',
};

const bundles = [
  {
    ...common,
    entryPoints: [join(root, 'src/main/main.ts')],
    outfile: join(root, 'dist/main/main.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
  },
  {
    ...common,
    entryPoints: [join(root, 'src/preload/host.ts')],
    outfile: join(root, 'dist/preload/host.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...common,
    entryPoints: [join(root, 'src/preload/guest.ts')],
    outfile: join(root, 'dist/preload/guest.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...common,
    entryPoints: [join(root, 'src/renderer/app.ts')],
    outfile: join(root, 'dist/renderer/app.js'),
    platform: 'browser',
    format: 'iife',
  },
];

function copyStatic() {
  mkdirSync(join(root, 'dist/renderer'), { recursive: true });
  for (const file of ['index.html', 'styles.css']) {
    cpSync(join(root, 'src/renderer', file), join(root, 'dist/renderer', file));
  }
}

if (watch) {
  const contexts = await Promise.all(bundles.map((options) => context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  copyStatic();
  console.log('esbuild: surveillance active.');
} else {
  await Promise.all(bundles.map((options) => build(options)));
  copyStatic();
  console.log('esbuild: build terminé.');
}

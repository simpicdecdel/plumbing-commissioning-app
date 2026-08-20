import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

await build({
  entryPoints: [`${root}scripts/remote-client-entry.js`],
  outfile: `${root}vendor/remote-client.min.js`,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['safari15'],
  legalComments: 'linked'
});

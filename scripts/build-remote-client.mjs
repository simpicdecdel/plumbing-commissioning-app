import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outfile = `${root}vendor/remote-client.min.js`;

await build({
  entryPoints: [`${root}scripts/remote-client-entry.js`],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['safari15'],
  legalComments: 'linked'
});

const bundle = await readFile(outfile, 'utf8');
const normalisedBundle = bundle
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .join('\n')
  .trimEnd();

await writeFile(outfile, `${normalisedBundle}\n`);

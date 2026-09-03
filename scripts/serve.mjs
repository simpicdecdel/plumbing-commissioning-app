import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const liveTestBrowserConfig = process.env.PLUMBING_LIVE_TESTS === '1'
  && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(process.env.PLUMBING_TEST_SUPABASE_URL || '')
  && (process.env.PLUMBING_TEST_SUPABASE_PUBLISHABLE_KEY || '').startsWith('sb_publishable_')
  ? Object.freeze({
    supabaseUrl: process.env.PLUMBING_TEST_SUPABASE_URL,
    supabasePublishableKey: process.env.PLUMBING_TEST_SUPABASE_PUBLISHABLE_KEY
  })
  : null;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};
const publicPaths = new Set([
  'app.js',
  'config.js',
  'icons/app-icon.svg',
  'icons/app-icon-192.png',
  'icons/app-icon-512.png',
  'index.html',
  'manifest.webmanifest',
  'remote-config.js',
  'service-worker.js',
  'storage.js',
  'styles.css',
  'sync.js',
  'vendor/dexie.min.js',
  'vendor/remote-client.min.js'
]);

function resolveRequestPath(requestUrl = '/') {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!publicPaths.has(relativePath)) return null;
  const requestedPath = path.resolve(root, relativePath);
  return requestedPath === root || requestedPath.startsWith(`${root}${path.sep}`) ? requestedPath : null;
}

export const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const requestedPath = resolveRequestPath(request.url);
  if (!requestedPath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (path.basename(requestedPath) === 'config.js'
    && (process.env.PLUMBING_REMOTE_DISABLED === '1' || liveTestBrowserConfig)) {
    const browserConfig = process.env.PLUMBING_REMOTE_DISABLED === '1' ? {} : liveTestBrowserConfig;
    const source = `window.PLUMBING_APP_CONFIG = Object.freeze(${JSON.stringify(browserConfig)});\n`;
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': Buffer.byteLength(source),
      'Content-Type': 'text/javascript; charset=utf-8'
    });
    response.end(source);
    return;
  }

  try {
    const fileStats = await stat(requestedPath);
    if (!fileStats.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': fileStats.size,
      'Content-Type': contentTypes[path.extname(requestedPath)] || 'application/octet-stream'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Plumbing Commissioning available at http://${host}:${port}`);
});

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function resolveRequestPath(requestUrl = '/') {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
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

  if (path.basename(requestedPath) === 'config.js' && process.env.PLUMBING_REMOTE_DISABLED === '1') {
    const source = 'window.PLUMBING_APP_CONFIG = Object.freeze({});\n';
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

// A static file server with no dependencies, for the browser gates.
//
// The gates need a real origin: the lab is ES modules, and a file:// page cannot import them. Until
// now that origin came from `npx http-server`, which is a package this repo does not declare and a
// network fetch in the middle of a verification run. Thirty lines of node removes both.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}));

export function startStaticServer({ root, port = 0 } = {}) {
  const base = resolve(root || process.cwd());
  const server = createServer((request, response) => {
    const requested = decodeURIComponent((request.url || '/').split('?')[0]);
    // normalize() collapses any ../ before the prefix check, so a request cannot walk out of root.
    const target = normalize(join(base, requested));
    if (target !== base && !target.startsWith(base + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    let file = target;
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      statSync(file);
    } catch {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES.get(extname(file)) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[3] || process.env.PORT || 8899);
  const served = await startStaticServer({ root: process.argv[2] || process.cwd(), port });
  console.log(`serving ${resolve(process.argv[2] || process.cwd())} at ${served.url}`);
}

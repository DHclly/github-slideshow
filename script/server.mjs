import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, '_site');
const PORT = Number(process.env.PORT || 4000);

const CONFIG = yaml.load(fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8')) || {};
const BASEURL = CONFIG.baseurl ? String(CONFIG.baseurl).replace(/\/$/, '') : '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

export function createStaticServer(root = SRC) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    // When the site is built with a baseurl, its links include that prefix.
    if (BASEURL && pathname.startsWith(BASEURL)) pathname = pathname.slice(BASEURL.length) || '/';
    let filePath = path.join(root, pathname);

    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }

    const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

export function startServer(port = PORT) {
  if (!fs.existsSync(SRC)) {
    console.error(`Build output not found: ${SRC}. Run "npm run build" first.`);
    process.exit(1);
  }
  const server = createStaticServer();
  server.listen(port, () => {
    console.log(`Preview server running at http://localhost:${port}/`);
  });
  return server;
}

export { ROOT, PORT, pathToFileURL };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  startServer();
}

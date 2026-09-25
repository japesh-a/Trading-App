import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const files = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'],
  ['/lesson-visuals.js', 'lesson-visuals.js'],
  ['/style.css', 'style.css'], ['/pages-adapter.js', 'pages-adapter.js'],
  ['/site-data.json', 'site-data.json']
]);
http.createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html';
  response.writeHead(200, { 'Content-Type': type });
  response.end(readFileSync(path.join(root, file)));
}).listen(5188, '127.0.0.1', () => console.log('Static preview: http://127.0.0.1:5188'));

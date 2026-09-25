import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const files = new Map([['/', 'index.html'], ...readdirSync(root)
  .filter(file => /\.(html|js|css|json)$/.test(file))
  .map(file => ['/' + file, file])]);
http.createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html';
  response.writeHead(200, { 'Content-Type': type });
  response.end(readFileSync(path.join(root, file)));
}).listen(5188, '127.0.0.1', () => console.log('Static preview: http://127.0.0.1:5188'));

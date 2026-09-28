// Раздача собранной игры (nuxt generate → .output/public) тем же процессом, что и сетевой сервер:
// один контейнер, один порт, один домен — WebSocket на /ws. Маршруты SPA (/play, /room/x…) отдают 200.html.
import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

export function staticHandler(root: string) {
  const fallback = ['200.html', 'index.html'].map((f) => join(root, f)).find((f) => existsSync(f));
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (path === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; } // ../ за пределы папки — нельзя
    let st = safeStat(file);
    if (st?.isDirectory()) { file = join(file, 'index.html'); st = safeStat(file); }
    if (!st?.isFile()) {
      if (extname(path) || !fallback) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Не найдено'); return; }
      file = fallback; st = safeStat(file)!; // маршрут SPA — отдаём приложение, дальше разберётся роутер
    }
    const hashed = path.startsWith('/_nuxt/'); // файлы сборки с хешем в имени — кэшировать навсегда
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': st.size,
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
}
const safeStat = (f: string) => { try { return statSync(f); } catch { return null; } };

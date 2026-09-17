import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
function pokerRoute(request: IncomingMessage, _response: ServerResponse, next: () => void) {
  if (/^\/poker\/(?:\?|$)/u.test(request.url ?? '')) { _response.writeHead(302, { Location: '/poker' }); _response.end(); return; }
  if (/^\/poker\/?(?:\?|$)/u.test(request.url ?? '')) request.url = '/poker.html';
  next();
}
/** Cache only Poker's dependency closure and its explicitly licensed offline data. */
export function pokerOfflinePlugin(): Plugin {
  return { name: 'poker-offline',
    configureServer(server: ViteDevServer) { server.middlewares.use(pokerRoute); },
    configurePreviewServer(server: PreviewServer) { server.middlewares.use(pokerRoute); },
    async generateBundle(_options, bundle) {
      const paths = new Set<string>(['poker.html', 'poker.webmanifest', 'poker/data.json.gz', 'poker/source.json', 'app-icon-180.png', 'app-icon-512.png']);
      const visit = (name: string) => {
        if (paths.has(name)) return;
        paths.add(name);
        const chunk = bundle[name];
        if (chunk?.type === 'chunk') {
          for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) visit(dependency);
          const metadata = (chunk as unknown as { viteMetadata?: { importedCss: Set<string>; importedAssets: Set<string> } }).viteMetadata;
          for (const dependency of [...metadata?.importedCss ?? [], ...metadata?.importedAssets ?? []]) visit(dependency);
        }
      };
      const entry = Object.values(bundle).find(chunk => chunk.type === 'chunk' && chunk.isEntry && chunk.facadeModuleId?.endsWith('/poker.html'));
      if (!entry) throw Error('Missing Poker entry');
      visit(entry.fileName);
      const data = await readFile(resolve('public/poker/data.json.gz'));
      const receipt = JSON.parse(await readFile(resolve('public/poker/source.json'), 'utf8'));
      if (createHash('sha256').update(data).digest('hex') !== receipt.sha256) throw Error('Poker offline data does not match its receipt');
      const revision = createHash('sha256').update([...paths].sort().join('\n')).update(await readFile(resolve('poker.html'))).update(await readFile(resolve('public/poker.webmanifest'))).update(await readFile(resolve('scripts/pokerOfflinePlugin.ts'))).update(data).update(await readFile(resolve('public/poker/source.json'))).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'poker-sw.js', source: `
const CACHE = 'ns-poker-${revision}';
const URLS = ${JSON.stringify([...paths])}.map(path => new URL(path, self.location.href).href);
const SHELL = new URL('poker.html', self.location.href).href;
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try { await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' }))); }
  catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('ns-poker-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE') event.waitUntil(self.skipWaiting());
  if (event.data === 'SAVE_OFFLINE') event.waitUntil((async () => {
    try { const cache = await caches.open(CACHE); await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' }))); event.ports[0]?.postMessage(true); }
    catch { event.ports[0]?.postMessage(false); }
  })());
  if (event.data === 'CHECK_OFFLINE') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const ready = (await Promise.all(URLS.map(url => cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage(ready);
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate' && /^\\/poker\\/?$/.test(url.pathname);
  if (!navigation && !URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(navigation ? SHELL : url.href);
    if (cached && navigation) {
      const html = (await cached.text()).replace('<base href="./" />', '<base href="' + new URL('./', self.location.href).href + '" />');
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return cached || fetch(event.request);
  })());
});\n` });
    },
  };
}

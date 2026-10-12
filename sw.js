const CACHE = 'zhic-shell-__BUILD_ID__';
const ASSETS = ['./', './index.html', './styles.css', './app.mjs', './domain.mjs', './storage.mjs', './learning.mjs', './development.mjs', './fitness.mjs', './diet.mjs', './gaming.mjs', './settings.mjs', './runtime.mjs', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('zhic-shell-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  url.hash = '';
  const allowed = new Set(ASSETS.map(name => new URL(name, self.registration.scope).href));
  if (event.request.method !== 'GET' || !allowed.has(url.href)) return;
  // Keep the entire installed shell on one version; updates activate after all app windows close.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});

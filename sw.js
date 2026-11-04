/* Сначала сеть, поэтому обновления видны сразу. Без интернета отдаём последнюю копию.
   no-cache сверяет файлы с сервером: иначе браузер смешает новую страницу со старыми скриптами. */
const CACHE = 'lunajour-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

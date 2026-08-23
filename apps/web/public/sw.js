const CACHE = 'formforge-shell-v1'
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/']))))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).then((response) => {
    const clone = response.clone()
    caches.open(CACHE).then((cache) => cache.put(event.request, clone))
    return response
  }).catch(() => caches.match(event.request)))
})

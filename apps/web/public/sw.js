const CACHE = 'formforge-public-shell-v2'
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/'])).then(()=>self.skipWaiting())))
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('formforge-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())))
self.addEventListener('fetch', (event) => {
  const url=new URL(event.request.url)
  if (event.request.method !== 'GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname)) return
  event.respondWith(fetch(event.request).then((response) => {
    if(response.ok&&!/private|no-store/.test(response.headers.get('Cache-Control')??'')){
      const clone = response.clone()
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, clone)))
    }
    return response
  }).catch(async () => (await caches.match(event.request))??new Response('Offline. Reconnect to load this resource.',{status:503})))
})

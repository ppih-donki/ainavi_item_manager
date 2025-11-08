/* Minimal SW to discourage caching */
self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Bypass for chrome-extension etc.
  if (!req || !req.url || !req.url.startsWith('http')) return;

  event.respondWith((async () => {
    try {
      // Clone request with no-cache/no-store semantics where possible
      const headers = new Headers(req.headers);
      headers.set('Cache-Control', 'no-store, no-cache, max-age=0');
      const init = {
        method: req.method,
        headers,
        mode: req.mode,
        credentials: req.credentials,
        redirect: req.redirect,
        referrer: req.referrer,
        referrerPolicy: req.referrerPolicy,
        cache: 'reload', // or 'no-store' in some browsers
        integrity: req.integrity
      };
      if (req.method !== 'GET') return fetch(req);
      const newReq = new Request(req.url, init);
      const res = await fetch(newReq);
      // Ensure response isn't cached
      const resHeaders = new Headers(res.headers);
      resHeaders.set('Cache-Control', 'no-store, no-cache, max-age=0');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: resHeaders });
    } catch (e) {
      // Fallback: just fetch
      return fetch(req);
    }
  })());
});
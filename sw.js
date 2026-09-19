// Service worker: precache the shell, serve cache-first, fall back to the cached
// index.html for navigations. Everything is relative so the app still works from
// a subfolder, and no absolute origin is baked in -- the dev tunnel URL changes
// on every run.

const VERSION = 'v25';
const CACHE = `shs-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './app.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/ui.js',
  './js/editor.js',
  './js/store.js',
  './js/codec.js',
  './js/rows.js',
  './js/vcard.js',
  './js/qr.js',
  './js/countries.js',
  './js/timezones.js',
  './js/install.js',
  './js/icons.js',
  './js/qrview.js',
  './js/dom.js',
  './vendor/qrcodegen.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Individually, so one 404 cannot fail the whole install.
      Promise.all(SHELL.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      ))
    )
  );
  // Deliberately NOT skipWaiting: a new worker waits until the page says so, so
  // the app never reloads itself out from under someone mid-handover.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((hit) => {
        if (hit) {
          // Refresh behind the scenes; never make a launch wait on the network.
          fetch(req).then((res) => {
            if (res && res.ok && res.type === 'basic') {
              caches.open(CACHE).then((c) => c.put('./index.html', res.clone()));
            }
          }).catch(() => {});
          return hit;
        }
        return fetch(req);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      if (hit) {
        // Refresh in the background so the next launch is current, without
        // making this one wait on the network.
        fetch(req).then((res) => {
          // Same check as the miss path below: a same-origin request that
          // redirects off-origin must not be written into the shell cache.
          if (res && res.ok && res.type === 'basic') {
            caches.open(CACHE).then((c) => c.put(req, res.clone()));
          }
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => new Response(null, { status: 504, statusText: 'Offline' }));
    })
  );
});

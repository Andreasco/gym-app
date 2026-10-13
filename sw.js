// Offline support: app shell is precached, exercise images are cached on first view.
const VERSION = 'v8';
const SHELL = `gym-shell-${VERSION}`;
const IMAGES = 'gym-images';
const SHELL_FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/core/config.js',
  'js/core/exercises.js',
  'js/core/i18n.js',
  'js/core/queries.js',
  'js/core/store.js',
  'js/core/sync-service.js',
  'js/core/sync.js',
  'js/core/validate.js',
  'js/main.js',
  'js/ui/components.js',
  'js/ui/dom.js',
  'js/ui/router.js',
  'js/ui/shell.js',
  'js/ui/timer.js',
  'js/ui/views/day.js',
  'js/ui/views/editor.js',
  'js/ui/views/exercise.js',
  'js/ui/views/history.js',
  'js/ui/views/home.js',
  'js/ui/views/import.js',
  'js/ui/views/library.js',
  'js/ui/views/program.js',
  'js/ui/views/settings.js',
  'js/ui/views/workout.js',
  'data/exercises.json', 'programs/starter.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gym-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Exercise images: cache-first (they never change).
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(caches.open(IMAGES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // App shell: network-first so updates land, cache as offline fallback.
  // cache: 'no-cache' revalidates with the server, bypassing GitHub Pages' 10-minute HTTP cache.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(res => {
          if (res.ok) caches.open(SHELL).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
  }
});

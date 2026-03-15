const CACHE_NAME = 'rolezinho-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Em desenvolvimento (localhost / 127.0.0.1), o SW se desregistra
// e limpa todos os caches para não interferir com o Vite dev server.
const IS_DEV =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname.startsWith('192.168.');

if (IS_DEV) {
  // Limpa qualquer cache existente e se desregistra imediatamente
  self.addEventListener('install', () => {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    self.skipWaiting();
  });
  self.addEventListener('activate', () => {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    self.clients.claim();
    // Desregistra o próprio SW em dev — ele não deve existir aqui
    self.registration.unregister();
  });
  // Não intercepta nenhum fetch em dev
} else {
  // ── Produção ──────────────────────────────────────────────────

  // Install — cache shell assets
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
  });

  // Activate — limpa caches antigos (versões anteriores)
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
    );
    self.clients.claim();
  });

  // Fetch — network first, fallback to cache
  self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // Nunca cacheia chamadas de API externas
    const url = event.request.url;
    if (
      url.includes('supabase.co') ||
      url.includes('api.themoviedb.org') ||
      url.includes('googleapis.com') ||
      url.includes('spotify.com') ||
      url.includes('youtube.com/oembed')
    ) return;

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  });
}
// BUILD_ID e PRECACHE_URLS são preenchidos no build por scripts/inject-precache.mjs
// (todos os arquivos de /assets/, para o app abrir offline em qualquer tela).
const BUILD_ID = '__BUILD_ID__';
const PRECACHE_URLS = /*__PRECACHE__*/ [];
const CACHE_NAME = 'rolezinho-' + BUILD_ID;
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
      caches.open(CACHE_NAME).then(async (cache) => {
        // Um arquivo que falhe não impede o resto de ser guardado nem a instalação
        await Promise.allSettled([...ASSETS_TO_CACHE, ...PRECACHE_URLS].map((u) => cache.add(u)));
      })
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

  // Fetch
  //  • /assets/ (nome com hash, nunca muda): cache primeiro
  //  • páginas (navegação): rede primeiro; sem rede, a página guardada ou o index.html (SPA)
  //  • demais: rede primeiro, cache como reserva
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

    const store = (response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    };

    const { pathname } = new URL(url);
    if (pathname.startsWith('/assets/')) {
      event.respondWith(
        caches.match(event.request).then((hit) => hit || fetch(event.request).then(store))
      );
      return;
    }

    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request)
          .then(store)
          .catch(() =>
            caches.match(event.request).then((hit) => hit || caches.match('/index.html'))
          )
      );
      return;
    }

    event.respondWith(
      fetch(event.request).then(store).catch(() => caches.match(event.request))
    );
  });
}

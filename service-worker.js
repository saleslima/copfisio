const CACHE_NAME = 'fmu-cache-v20260603-listview-final-v4';
const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './firebase.js',
    './state.js',
    './calendar.js',
    './booking.js',
    './admin.js',
    './modals.js',
    './script.js',
    './emailjs-service.js',
    './appearance.js',
    './pwa-install.js',
    './notice.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './logo2.png',
    './COPOM-NOVO (1).png',
    './FMU-logo-alt.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const accept = event.request.headers.get('accept') || '';
    const isNavigation = event.request.mode === 'navigate' || accept.includes('text/html');

    if (isNavigation) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return networkResponse;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const networkFetch = fetch(event.request).then((networkResponse) => {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return networkResponse;
            }).catch(() => cachedResponse);
            return cachedResponse || networkFetch;
        })
    );
});

const CACHE_NAME = 'fmu-cache-v20260603-listview-atom-logo-v3';
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
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                return networkResponse;
            }).catch(() => caches.match('./index.html'));
        })
    );
});

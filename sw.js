const CACHE_NAME = 'jules-pwa-v3';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'app.js',
    'manifest.json',
    'icons/icon-192x192.png',
    'icons/icon-512x512.png'
];

// Installation: mise en cache des assets statiques
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// Activation: nettoyage des anciens caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interception des requêtes: Stratégie Cache First, fallback sur réseau (pour les assets locaux)
// Pour l'API Jules (googleapis), stratégie Réseau uniquement.
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Ne pas mettre en cache les requêtes vers l'API
    if (url.hostname.includes('googleapis.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(networkResponse => {
                    // Mettre en cache la nouvelle réponse (facultatif, pour robustesse offline)
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                });
            })
    );
});

// Écouteur pour interagir avec les notifications
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si l'application est déjà ouverte, la mettre au premier plan
            for (let client of windowClients) {
                if ((client.url.endsWith('/') || client.url.endsWith('index.html')) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Sinon, ouvrir une nouvelle fenêtre
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});

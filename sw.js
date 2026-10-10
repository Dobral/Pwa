// Service Worker для MineCoder PWA
const CACHE_NAME = 'minecoder-v1';
const CACHE_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json'
];

// Установка: кэшируем базовые файлы
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Кэшируем файлы по одному, чтобы один отсутствующий файл не ломал весь кэш
      return Promise.all(
        CACHE_FILES.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('Не удалось закэшировать: ' + url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// Активация: удаляем старый кэш
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Стратегия: cache-first, при промахе — network, при неудаче — fallback на index.html
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).catch(function() {
        return caches.match('index.html');
      });
    })
  );
});

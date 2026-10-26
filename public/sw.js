/* Sunday Table: keeps a copy of the app on this phone so it opens instantly and works without a connection.
   Your recipes themselves live in the app's own storage (and your Google Sheet); this only keeps the app, fonts, photos and readers. */
var BUILD = '2.10-f9931ad1';
var SHELL = 'st-shell-' + BUILD;          // the app itself, replaced with each update
var LIBS = 'st-libs-1';                   // fonts and the photo/PDF/Word readers (their links never change)
var PHOTOS = 'st-photos-1';               // recipe photos
var MAX_PHOTOS = 400;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return fetch('./', { cache: 'reload' }).then(function (res) {
      if (!res.ok) throw new Error('index ' + res.status);
      return c.put('./', res);
    });
  }));
  // the first time, take over straight away; after that, wait until the app says "update now"
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('st-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'update-now') self.skipWaiting();
  if (e.data === 'build?' && e.source) e.source.postMessage({ build: BUILD });
});

function isLib(u) {
  return /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u) ||
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data)@/.test(u) ||
    /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/(pdf\.js|jszip)\//.test(u);
}
function isPhoto(req) {
  var u = req.url;
  return req.destination === 'image' && (/^https:\/\/(drive\.google\.com\/thumbnail|lh\d\.googleusercontent\.com\/|drive\.usercontent\.google\.com\/)/.test(u) || /^https:\/\/[^/]+\/.+\.(jpe?g|png|webp|gif)(\?|$)/i.test(u));
}
function trim(cache, max) {
  return cache.keys().then(function (keys) { if (keys.length > max) return Promise.all(keys.slice(0, keys.length - max).map(function (k) { return cache.delete(k); })); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = req.url, same = new URL(u).origin === self.location.origin;

  // the app: from this phone straight away (whatever ?icon=… it was opened with)
  if (same && (req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(u).pathname))) {
    e.respondWith(caches.open(SHELL).then(function (c) {
      return c.match('./', { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) { if (res.ok && req.mode === 'navigate') c.put('./', res.clone()); return res; });
      });
    }));
    return;
  }

  // fonts and readers: their addresses include the version, so a saved copy is always right
  if (isLib(u)) {
    e.respondWith(caches.open(LIBS).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }

  // recipe photos: the saved copy if there is one, so the list looks right with no signal
  if (isPhoto(req)) {
    e.respondWith(caches.open(PHOTOS).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') { c.put(req, res.clone()).then(function () { return trim(c, MAX_PHOTOS); }); }
          return res;
        });
      });
    }));
  }
  // everything else (your Google Sheet, imports) always goes to the internet
});

/* finnstergram.com/sw.js — a SELF-REMOVING service worker. Keep this file; never put a real one here.

   The old GoDaddy Website Builder site installed a Workbox service worker at this address. A browser that ever
   visited it keeps that worker, and the worker answers EVERY visit to finnstergram.com from its own cache — so
   those visitors kept seeing the old GoDaddy pages after the new site went live (found 2026-10-18). While this
   file 404'd, the browser's update check failed and the old worker stayed in charge, forever.

   Browsers re-fetch this file (bypassing the HTTP cache) on every visit. This version replaces the old worker,
   deletes every cache it made, unregisters itself, and reloads any open page so it comes from the real site.
   After that, no service worker runs on finnstergram.com. */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) { /* nothing cached */ }
    await self.registration.unregister();
    var pages = await self.clients.matchAll({ type: 'window' });
    pages.forEach(function (c) { try { c.navigate(c.url); } catch (e) { /* the next visit is clean anyway */ } });
  })());
});

/* until it is gone, never answer from a cache: every request goes to the network */
self.addEventListener('fetch', function () {});

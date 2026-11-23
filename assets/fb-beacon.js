/* Cloudflare Web Analytics for finnstergram.com — loaded ONLY on a device that is not marked as the team's own (fb-me=1,
   set at /me/; Founder 2026-11-23). The token rides on this script's own tag (data-token). Gate: factory/check-me.js. */
(function () {
  try { if (/(?:^|;\s*)fb-me=1(?:;|$)/.test(document.cookie || '')) return; } catch (e) { /* no cookies: count */ }
  var me = document.currentScript, tok = me && me.getAttribute('data-token');
  if (!tok) return;
  var s = document.createElement('script');
  s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', '{"token": "' + tok + '"}');
  document.body.appendChild(s);
})();

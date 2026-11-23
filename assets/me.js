/* finnstergram.com/me/ — mark this browser as the team's own, so nothing it does is counted (Founder 2026-11-23: "the
   founder visits need to be removed as they are founder check and updateds"). The mark is ONE cookie, fb-me=1, on
   Domain=finnstergram.com so every game subdomain sees it: the play counter (fb-analytics) sends nothing and the
   Cloudflare beacon is not loaded. Gate: factory/check-me.js. */
(function () {
  'use strict';
  var KEY = 'fb-me', state = document.getElementById('me-state');
  var domain = /(^|\.)finnstergram\.com$/.test(location.hostname) ? '; Domain=finnstergram.com' : '';
  var secure = location.protocol === 'https:' ? '; Secure' : '';
  var marked = function () { return /(?:^|;\s*)fb-me=1(?:;|$)/.test(document.cookie || ''); };
  var paint = function () {
    if (!state) return;
    state.textContent = marked() ? '✓ This device is NOT counted.' : 'This device IS counted, like any visitor.';
  };
  var set = function (on) {
    document.cookie = KEY + '=' + (on ? '1; Max-Age=315360000' : '; Max-Age=0') + '; Path=/; SameSite=Lax' + domain + secure;
    paint();
  };
  var off = document.getElementById('me-off'), on = document.getElementById('me-on');
  if (off) off.addEventListener('click', function () { set(true); });
  if (on) on.addEventListener('click', function () { set(false); });
  paint();
})();

/* finnstergram.com — the one script. No framework, no tracking, nothing third-party:
   the only other host it touches is the collection's own Arweave archive, for Bot pictures.
   Every feature below switches itself on only if its element is on the page, and the site
   reads and works without any of it (content is never hidden behind the script). */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, el) { return (el || d).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || d).querySelectorAll(s)); };

  /* ---- night mode -------------------------------------------------------------- */
  /* SHARED with every game (2026-10-17): one cookie on .finnstergram.com, so night mode set here carries
     into the games and back — the same rule as factory/templates/theme-switch.js. localStorage is the fallback. */
  var KEY = 'fb-theme', sys = window.matchMedia('(prefers-color-scheme: dark)');
  function savedTheme() {
    var m = /(?:^|;\s*)fb-theme=(light|dark)(?:;|$)/.exec(d.cookie || ''); if (m) return m[1];
    try { var t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch (e) {}
    return null;
  }
  function saveTheme(v) {
    var dom = /(^|\.)finnstergram\.com$/.test(location.hostname) ? '; Domain=finnstergram.com' : '';
    d.cookie = KEY + '=' + v + '; Path=/; Max-Age=31536000; SameSite=Lax' + dom + (location.protocol === 'https:' ? '; Secure' : '');
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the cookie still carries it */ }
  }
  var effective = function () { return root.dataset.theme || (sys.matches ? 'dark' : 'light'); };
  function paintTheme() {
    var dark = effective() === 'dark';
    $$('.theme-switch').forEach(function (b) {
      b.setAttribute('aria-checked', String(dark));
      b.title = dark ? 'Switch to day mode' : 'Switch to night mode';
    });
    var m = $('meta[name="theme-color"]'); if (m) m.content = dark ? '#17121a' : '#5f4c57';
  }
  $$('.theme-switch').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      saveTheme(next);
      paintTheme();
    });
  });
  (sys.addEventListener ? sys.addEventListener('change', paintTheme) : sys.addListener(paintTheme));
  function resyncTheme() { var t = savedTheme(); if (t) root.dataset.theme = t; paintTheme(); }   // changed in a game tab
  d.addEventListener('visibilitychange', function () { if (!d.hidden) resyncTheme(); });
  window.addEventListener('pageshow', resyncTheme);
  paintTheme();

  /* ---- the Bot index: only Bots that are on-chain AND pictured on Arweave -------- */
  /* Arweave answers every path — a number it does not hold comes back as Bot #12 — so a
     picture is shown only for a number in this list (built by scripts/make-bot-index.py). */
  var indexP = null;
  function botIndex() {
    return indexP || (indexP = fetch('/assets/bot-index.json').then(function (r) {
      if (!r.ok) throw new Error('bot index ' + r.status);
      return r.json();
    }).then(function (j) {
      return { base: j.base, list: j.image, set: new Set(j.image), noImage: new Set(j.noImage) };
    }));
  }
  var mintsP = null;
  function botMints() { return mintsP || (mintsP = fetch('/assets/bot-mints.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })); }
  var EDITIONS = { crypto: [1, 1000, 'CryptoBot'], drink: [1001, 2000, 'DrinkBot'], finn: [2001, 3000, 'FinnBot'] };
  function editionOf(n) { return n <= 1000 ? 'crypto' : n <= 2000 ? 'drink' : 'finn'; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function inEdition(list, ed) { if (!ed || ed === 'all') return list; var r = EDITIONS[ed]; return list.filter(function (n) { return n >= r[0] && n <= r[1]; }); }
  function fmt(n) { return Number(n).toLocaleString('en-GB'); }

  /* swap a picture on a CRT screen: preload, then cut over with a burst of static */
  function swap(screen, img, src, alt) {
    return new Promise(function (resolve, reject) {
      var pre = new Image();
      pre.onload = function () {
        img.src = src; img.alt = alt;
        screen.classList.remove('nosignal');
        if (!reduce) { screen.classList.remove('zap'); void screen.offsetWidth; screen.classList.add('zap'); }
        resolve();
      };
      pre.onerror = reject;
      pre.src = src;
    });
  }
  function ensureNoise(screen) { if (screen && !$('.noise', screen)) { var n = d.createElement('i'); n.className = 'noise'; n.setAttribute('aria-hidden', 'true'); screen.appendChild(n); } }
  $$('.screen').forEach(ensureNoise);

  /* ---- hero: typed tagline, a Bot that talks back, and a shuffle ------------------ */
  var hero = $('[data-hero]');
  if (hero) {
    var tag = $('.tag', hero);
    if (tag && !reduce) {
      var full = tag.textContent; tag.textContent = ''; tag.classList.add('typing');
      var i = 0, t = setInterval(function () {
        tag.textContent = full.slice(0, ++i);
        if (i >= full.length) { clearInterval(t); setTimeout(function () { tag.classList.remove('typing'); }, 1600); }
      }, 75);
    }
    var screen = $('.screen', hero), img = $('.screen img', hero), badge = $('.badge', hero),
        bubble = $('.bubble', hero), botBtn = $('.bot-btn', hero), meet = $('[data-meet-link]', hero);
    var LINES = ['Beep boop!', 'Built for fun.', 'Hello, human!', 'Pick a game!', 'Play a game with me!', 'Boop!', 'Hi Finn!'];
    var bubbleTimer;
    function say(text) {
      if (!bubble) return;
      bubble.textContent = text; bubble.classList.add('show');
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(function () { bubble.classList.remove('show'); }, 2200);
    }
    if (botBtn) botBtn.addEventListener('click', function () {
      botBtn.classList.remove('boing'); void botBtn.offsetWidth; botBtn.classList.add('boing');
      say(pick(LINES));
    });
    var shuffle = $('[data-shuffle]', hero);
    if (shuffle) shuffle.addEventListener('click', function () {
      shuffle.disabled = true;
      botIndex().then(function (ix) {
        var n = pick(ix.list), ed = EDITIONS[editionOf(n)][2];
        return swap(screen, img, ix.base + '/' + n + '.png', 'Bot #' + n + ', a ' + ed).then(function () {
          if (badge) badge.textContent = '#' + n;
          if (meet) { meet.href = '/showcase/?bot=' + n + '#finder'; meet.textContent = 'Meet #' + n; }
          say("I'm #" + n + ' — a ' + ed + '!');
        });
      }).catch(function () { say('No signal… try again!'); })
        .then(function () { shuffle.disabled = false; });
    });
  }

  /* ---- the parade: a marquee of real Bots ------------------------------------------ */
  var parade = $('[data-parade]');
  if (parade) botIndex().then(function (ix) {
    var track = $('.parade-track', parade), chosen = [], pool = ix.list.slice();
    for (var k = 0; k < 18 && pool.length; k++) chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    [false, true].forEach(function (copy) {          // two copies make the loop seamless; the second is decoration
      chosen.forEach(function (n) {
        var a = d.createElement('a');
        a.href = '/showcase/?bot=' + n + '#finder';
        if (copy) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
        else a.setAttribute('aria-label', 'Meet Bot #' + n);
        a.innerHTML = '<img class="px" loading="lazy" width="92" height="92" alt="" src="' + ix.base + '/' + n + '.png"><span>#' + n + '</span>';
        track.appendChild(a);
      });
    });
  }).catch(function () { parade.hidden = true; });

  /* ---- reveal on scroll, count-ups, the roadmap meter ------------------------------ */
  function countUp(el) {
    var target = +el.dataset.count, suffix = el.dataset.suffix || '', show = el.hasAttribute('data-plain') ? String : fmt;
    if (reduce) { el.textContent = show(target) + suffix; return; }
    var t0 = null;
    (function step(ts) {
      t0 = t0 || ts;
      var p = Math.min(1, (ts - t0) / 1100), e = 1 - Math.pow(1 - p, 3);
      el.textContent = show(Math.round(target * e)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  var watched = $$('[data-reveal], .meter, [data-count]');
  if (watched.length) {
    var done = function (el) { el.classList.add('in'); if (el.dataset.count && !el.dataset.counted) { el.dataset.counted = '1'; countUp(el); } };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { done(e.target); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
      watched.forEach(function (el) { io.observe(el); });
    } else watched.forEach(done);
    setTimeout(function () { watched.forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight) done(el); }); }, 2500);  // never leave content invisible
  }

  /* ---- tilt the cards toward the pointer (mouse and trackpad only) ------------------ */
  if (!reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.tilt').forEach(function (el) {
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
      });
      el.addEventListener('pointerleave', function () { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); });
    });
  }

  /* ---- roadmap: the timeline lights up as you scroll, up to where we are now -------- */
  var tl = $('.timeline');
  if (tl) {
    var now = $('.phase.now .num', tl) || $$('.phase .num', tl).pop(), ticking = false;
    var paintFill = function () {
      ticking = false;
      var r = tl.getBoundingClientRect(), cap = now.getBoundingClientRect().top + now.offsetHeight / 2 - r.top;
      var reach = Math.max(0, Math.min(cap, innerHeight * 0.6 - r.top));
      tl.style.setProperty('--fill', (reach / Math.max(1, r.height - 16)).toFixed(4));
    };
    if (reduce) { tl.style.setProperty('--fill', '1'); }
    else { addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(paintFill); } }, { passive: true }); paintFill(); }
  }

  /* ---- the Bot Finder ------------------------------------------------------------- */
  var finder = $('[data-finder]');
  if (finder) botIndex().then(function (ix) {
    var fScreen = $('.screen', finder), fImg = $('.screen img', finder), fBadge = $('.badge', finder),
        title = $('[data-f-title]', finder), edTag = $('[data-f-ed]', finder), msg = $('[data-f-msg]', finder),
        input = $('input', finder), me = $('[data-f-me]', finder), filter = 'all', current = null;
    function list() { return inEdition(ix.list, filter); }
    function say(text, warn) { msg.innerHTML = text; msg.classList.toggle('warn', !!warn); }
    function nearest(n) {
      var lo = null, hi = null;
      for (var k = 0; k < ix.list.length; k++) { var v = ix.list[k]; if (v < n) lo = v; else if (v > n) { hi = v; break; } }
      return [lo, hi].filter(function (v) { return v != null; });
    }
    function setMeta(n) {
      var ed = editionOf(n);
      title.textContent = 'Bot #' + n; fBadge.textContent = '#' + n; input.value = n;
      edTag.hidden = false; edTag.dataset.ed = ed; edTag.textContent = EDITIONS[ed][2];
    }
    function go(n, push) {
      n = Math.round(+n);
      if (!(n >= 1 && n <= 3000)) { say('Bot numbers run from 1 to 3,000.', true); return; }
      current = n; setMeta(n); me.hidden = true;
      var dl0 = $('[data-f-props]', finder), rk0 = $('[data-f-rank]', finder); if (dl0) dl0.textContent = ''; if (rk0) rk0.hidden = true;
      if (push !== false) history.replaceState(null, '', '?bot=' + n + '#finder');
      if (ix.set.has(n)) {
        say('');
        swap(fScreen, fImg, ix.base + '/' + n + '.png', 'Bot #' + n + ', a ' + EDITIONS[editionOf(n)][2])
          .catch(function () { fScreen.classList.add('nosignal'); say('The picture did not load — check your connection and try again.', true); });
        botMints().then(function (m) { if (m[n] && current === n) { me.href = 'https://magiceden.io/item-details/' + m[n]; me.hidden = false; } });
        var dl = $('[data-f-props]', finder), rk = $('[data-f-rank]', finder);
        if (dl) botTraits().then(function (T) { if (current !== n) return; var p = renderProps(dl, T, n, null);
          if (rk) { rk.hidden = !p; if (p) rk.textContent = 'Rarity rank ' + fmt(p.rank) + ' of ' + fmt(T.total); } }).catch(function () {});
      } else {
        fScreen.classList.add('nosignal');
        var near = nearest(n).map(function (v) { return '<a href="?bot=' + v + '#finder" data-go="' + v + '">#' + v + '</a>'; }).join(' or ');
        if (ix.noImage.has(n)) say('Bot #' + n + ' is in the collection, but its picture isn’t archived on Arweave yet.', true);
        else say('There’s no Bot #' + n + ' in the collection.' + (near ? ' Try ' + near + '.' : ''), true);
      }
    }
    function step(dir) {
      var l = list(); if (!l.length) return;
      var c = current || l[0], idx = -1;
      for (var k = 0; k < l.length; k++) { if (dir > 0 ? l[k] > c : l[k] >= c) { idx = k; break; } }
      if (dir > 0) go(idx === -1 ? l[0] : l[idx]);
      else go(idx <= 0 ? l[l.length - 1] : l[idx - 1]);
    }
    $('[data-f-prev]', finder).addEventListener('click', function () { step(-1); });
    $('[data-f-next]', finder).addEventListener('click', function () { step(1); });
    $('[data-f-random]', finder).addEventListener('click', function () { go(pick(list())); });
    $('form', finder).addEventListener('submit', function (e) { e.preventDefault(); go(input.value); });
    msg.addEventListener('click', function (e) { var a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go); } });
    $$('.chip', finder).forEach(function (c) {
      c.addEventListener('click', function () {
        filter = c.dataset.ed;
        $$('.chip', finder).forEach(function (o) { o.setAttribute('aria-pressed', String(o === c)); });
        if (!current || (filter !== 'all' && editionOf(current) !== filter)) go(pick(list()));
      });
    });
    $$('[data-meet]').forEach(function (b) {
      b.addEventListener('click', function () {
        var chip = $('.chip[data-ed="' + b.dataset.meet + '"]', finder); if (chip) chip.click();
        go(pick(list()));
        finder.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    });
    finder.addEventListener('keydown', function (e) {
      if (e.target === input) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    d.addEventListener('fb:finder', function (e) { go(e.detail); finder.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); });
    var q = new URLSearchParams(location.search).get('bot') || (location.hash.match(/^#bot-(\d+)$/) || [])[1];
    go(q || 2969, !!q);
    if (q) setTimeout(function () { finder.scrollIntoView({ block: 'start' }); }, 60);
  }).catch(function (err) {
    if (window.console) console.error('Bot Finder:', err);
    var m = $('[data-f-msg]', finder); if (m) { m.textContent = 'The Bot Finder could not load its list — check your connection and reload.'; m.classList.add('warn'); }
  });

  /* ---- properties (traits): shared by the home search and the Showcase Finder ------ */
  var traitsP = null;
  function botTraits() {
    return traitsP || (traitsP = fetch('/assets/bot-traits.json').then(function (r) {
      if (!r.ok) throw new Error('properties ' + r.status); return r.json();
    }).then(function (T) { T.by = new Map(); T.bots.forEach(function (row) { T.by.set(row[0], row); }); return T; }));
  }
  function propsOf(T, n) {
    var row = T.by.get(n); if (!row) return null;
    var out = [];
    T.types.forEach(function (t, k) { var i = row[2 + k]; if (i >= 0) out.push({ type: t, value: T.values[k][i], count: T.counts[k][i], k: k, i: i }); });
    return { rank: row[1], props: out };
  }
  function pctText(count, total) { var p = count / total * 100; return (p < 1 ? p.toFixed(1) : String(Math.round(p))) + '% have this'; }
  /* fill a <dl> with a Bot's properties; text only, never HTML */
  function renderProps(dl, T, n, onPick) {
    dl.textContent = '';
    var p = propsOf(T, n); if (!p) return null;
    p.props.forEach(function (x) {
      var row = document.createElement('div'); row.className = 'prop';
      var dt = document.createElement('dt'); dt.textContent = x.type;
      var dd = document.createElement('dd');
      if (onPick) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x.value; b.title = 'Show every Bot with ' + x.value; b.addEventListener('click', function () { onPick(x.k, x.i); }); dd.appendChild(b); }
      else dd.textContent = x.value;
      var pc = document.createElement('span'); pc.className = 'pct'; pc.textContent = pctText(x.count, T.total);
      row.appendChild(dt); row.appendChild(dd); row.appendChild(pc); dl.appendChild(row);
    });
    return p;
  }

  /* ---- Find a Bot: search the collection by number or property (home) ------------- */
  var ex = $('[data-explorer]');
  if (ex) {
    var exStarted = false;
    var startExplorer = function () {
      if (exStarted) return; exStarted = true;
      Promise.all([botTraits(), botIndex()]).then(function (res) {
        var T = res[0], ix = res[1];
        var grid = $('[data-ex-grid]', ex), countEl = $('[data-ex-count]', ex), more = $('[data-ex-more]', ex),
            input = $('input[type=search]', ex), sortSel = $('[data-ex-sort]', ex), filtersEl = $('[data-ex-filters]', ex),
            dialog = $('[data-ex-detail]', ex);
        var EDN = { crypto: 'cryptobot', drink: 'drinkbot', finn: 'finnbot' };
        var state = { ed: 'all', f: T.types.map(function () { return -1; }), q: [], sort: 'num', limit: 48 };
        // one lowercase haystack per Bot: its values, its edition, the names of its trait types
        var hay = new Map();
        T.bots.forEach(function (row) {
          var words = [EDN[editionOf(row[0])]];
          T.types.forEach(function (t, k) { var i = row[2 + k]; if (i >= 0) { words.push(T.values[k][i].toLowerCase()); words.push(t.toLowerCase()); } });
          hay.set(row[0], words.join(' | '));
        });
        // a select per property type, its options counted
        var selects = T.types.map(function (t, k) {
          var lab = document.createElement('label'); lab.textContent = t;
          var sel = document.createElement('select'); sel.dataset.k = k;
          var any = document.createElement('option'); any.value = '-1'; any.textContent = 'Any'; sel.appendChild(any);
          T.values[k].map(function (v, i) { return { v: v, i: i, c: T.counts[k][i] }; })
            .sort(function (a, b) { return a.v.localeCompare(b.v); })
            .forEach(function (o) { var op = document.createElement('option'); op.value = String(o.i); op.textContent = o.v + ' (' + fmt(o.c) + ')'; sel.appendChild(op); });
          sel.addEventListener('change', function () { state.f[k] = +sel.value; state.limit = 48; sel.classList.toggle('on', sel.value !== '-1'); run(); });
          lab.appendChild(sel); filtersEl.appendChild(lab); return sel;
        });
        function matches(row) {
          var n = row[0];
          if (state.ed !== 'all' && editionOf(n) !== state.ed) return false;
          for (var k = 0; k < state.f.length; k++) if (state.f[k] >= 0 && row[2 + k] !== state.f[k]) return false;
          var h = hay.get(n);
          for (var j = 0; j < state.q.length; j++) {
            var w = state.q[j], num = /^#?(\d+)$/.exec(w);
            if (num) { if (n !== +num[1]) return false; } else if (h.indexOf(w) < 0) return false;
          }
          return true;
        }
        function run() {
          var list = T.bots.filter(matches);
          if (state.sort === 'rare') list.sort(function (a, b) { return a[1] - b[1]; });
          else if (state.sort === 'common') list.sort(function (a, b) { return b[1] - a[1]; });
          else list.sort(function (a, b) { return a[0] - b[0]; });
          var filtered = state.ed !== 'all' || state.q.length || state.f.some(function (x) { return x >= 0; });
          countEl.textContent = list.length ? (fmt(list.length) + (filtered ? ' Bot' + (list.length === 1 ? '' : 's') + ' match'
                                            : ' Bots on-chain today (of the original 3,000 — some were burned). Search or filter to narrow it down.'))
                                            : 'No Bot matches that — try fewer words or clear a filter.';
          grid.textContent = '';
          list.slice(0, state.limit).forEach(function (row) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'ex-bot';
            b.setAttribute('aria-label', 'Bot #' + row[0] + ', rarity rank ' + row[1]);
            var img = document.createElement('img'); img.className = 'px'; img.loading = 'lazy'; img.width = 236; img.height = 236; img.alt = '';
            img.src = ix.base + '/' + row[0] + '.png';
            var lab = document.createElement('span'); lab.textContent = '#' + row[0];
            var sm = document.createElement('small'); sm.textContent = 'rank ' + fmt(row[1]); lab.appendChild(sm);
            b.appendChild(img); b.appendChild(lab);
            b.addEventListener('click', function () { open(row[0]); });
            grid.appendChild(b);
          });
          more.hidden = list.length <= state.limit;
        }
        function open(n) {
          var p = propsOf(T, n); if (!p) return;
          var ed = editionOf(n);
          $('[data-ex-d-title]', dialog).textContent = 'Bot #' + n;
          $('[data-ex-d-badge]', dialog).textContent = '#' + n;
          var tag = $('[data-ex-d-ed]', dialog); tag.dataset.ed = ed; tag.textContent = EDITIONS[ed][2];
          $('[data-ex-d-rank]', dialog).textContent = 'Rarity rank ' + fmt(p.rank) + ' of ' + fmt(T.total);
          renderProps($('[data-ex-d-props]', dialog), T, n, function (k, i) {
            close(); state.q = []; input.value = ''; state.f = state.f.map(function () { return -1; }); state.f[k] = i;
            selects.forEach(function (sel, kk) { sel.value = String(state.f[kk]); sel.classList.toggle('on', state.f[kk] >= 0); });
            state.limit = 48; run(); ex.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          });
          var big = $('[data-ex-d-big]', dialog); big.href = '/showcase/?bot=' + n + '#finder';
          big.onclick = $('[data-finder]') ? function (e) { e.preventDefault(); close(); d.dispatchEvent(new CustomEvent('fb:finder', { detail: n })); } : null;
          var me = $('[data-ex-d-me]', dialog); me.hidden = true;
          botMints().then(function (m) { if (m[n]) { me.href = 'https://magiceden.io/item-details/' + m[n]; me.hidden = false; } });
          var scr = $('.screen', dialog), img = $('[data-ex-d-img]', dialog);
          if (dialog.showModal && !dialog.open) dialog.showModal(); else dialog.setAttribute('open', '');
          swap(scr, img, ix.base + '/' + n + '.png', 'Bot #' + n + ', a ' + EDITIONS[ed][2]).catch(function () { scr.classList.add('nosignal'); });
        }
        function close() { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); }
        $('[data-ex-close]', dialog).addEventListener('click', close);
        dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });     // click the backdrop
        $('form', ex).addEventListener('submit', function (e) {
          e.preventDefault();
          state.q = input.value.toLowerCase().split(/[\s,]+/).filter(Boolean); state.limit = 48; run();
          if (state.q.length === 1 && /^#?\d+$/.test(state.q[0]) && T.by.has(+state.q[0].replace('#', ''))) open(+state.q[0].replace('#', ''));
        });
        input.addEventListener('input', function () { if (!input.value) { state.q = []; run(); } });
        $$('[data-ex-ed]', ex).forEach(function (c) {
          c.addEventListener('click', function () {
            state.ed = c.dataset.exEd; state.limit = 48;
            $$('[data-ex-ed]', ex).forEach(function (o) { o.setAttribute('aria-pressed', String(o === c)); }); run();
          });
        });
        sortSel.addEventListener('change', function () { state.sort = sortSel.value; run(); });
        more.addEventListener('click', function () { state.limit += 48; run(); });
        $('[data-ex-reset]', ex).addEventListener('click', function () {
          state = { ed: 'all', f: state.f.map(function () { return -1; }), q: [], sort: 'num', limit: 48 };
          input.value = ''; sortSel.value = 'num';
          selects.forEach(function (sel) { sel.value = '-1'; sel.classList.remove('on'); });
          $$('[data-ex-ed]', ex).forEach(function (o) { o.setAttribute('aria-pressed', String(o.dataset.exEd === 'all')); }); run();
        });
        var q0 = new URLSearchParams(location.search).get('q');
        if (q0) { input.value = q0; state.q = q0.toLowerCase().split(/[\s,]+/).filter(Boolean); }
        run();
        if (q0) setTimeout(function () { ex.scrollIntoView({ block: 'start' }); }, 60);
      }).catch(function (err) {
        if (window.console) console.error('Bot search:', err);
        var c = $('[data-ex-count]', ex); if (c) c.textContent = 'The Bot search could not load — check your connection and reload.';
      });
    };
    if (new URLSearchParams(location.search).get('q')) startExplorer();
    else if ('IntersectionObserver' in window) {
      var exio = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { exio.disconnect(); startExplorer(); } }, { rootMargin: '600px 0px' });
      exio.observe(ex);
    } else startExplorer();
    $('input[type=search]', ex).addEventListener('focus', startExplorer);
  }

  /* ---- Games: the Game of the day and "New" badges ------------------------------ */
  /* Every card is in the page without the script. The page carries a fixed Featured pick; this turns it
     into today's Game of the day — the same game for everyone on a UTC day, from /assets/games.json. */
  var gotd = $('[data-gotd]');
  if (gotd) fetch('/assets/games.json').then(function (r) { if (!r.ok) throw new Error('games ' + r.status); return r.json(); }).then(function (list) {
    if (!list.length) return;
    var g = list[Math.floor(Date.now() / 864e5) % list.length], art = $('.game-art', gotd);
    gotd.href = g.url;
    $('[data-gotd-label]', gotd).textContent = 'Game of the day';
    $('[data-gotd-name]', gotd).textContent = g.name;
    $('[data-gotd-desc]', gotd).textContent = g.desc;
    $('[data-gotd-genre]', gotd).textContent = g.genre;
    art.textContent = '';
    var main = d.createElement('img');
    if (g.shot) { main.className = 'shot'; main.src = g.shot; main.width = 640; main.height = 480; main.alt = g.name + ' gameplay'; }
    else { main.className = 'px'; main.src = '/assets/bots/' + g.bot + '.png'; main.width = 512; main.height = 512; main.alt = 'Bot #' + g.bot + ', the star of ' + g.name; }
    art.appendChild(main);                     // one picture per card: the game, no Bot badge (Founder, 2026-10-17)
  }).catch(function () { /* the Featured pick stays */ });
  $$('.game[data-added]').forEach(function (el) {
    var t0 = Date.parse(el.dataset.added);
    if (t0 && Date.now() - t0 < 14 * 864e5) { var s = d.createElement('span'); s.className = 'new-tag'; s.textContent = 'New'; $('.game-art', el).appendChild(s); }
  });

  /* ---- copy buttons (the $OIL mint) ----------------------------------------------- */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = $(b.dataset.copy), text = el ? el.textContent.trim() : '', label = b.textContent;
      var done = function (ok) { b.textContent = ok ? 'Copied ✓' : 'Select and copy'; setTimeout(function () { b.textContent = label; }, 1800); };
      if (navigator.clipboard && text) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });

  /* ---- 404: one of the real Bots got lost ----------------------------------------- */
  var lost = $('[data-lost]');
  if (lost) botIndex().then(function (ix) {
    var n = pick(ix.list);
    return swap($('.screen', lost), $('.screen img', lost), ix.base + '/' + n + '.png', 'Bot #' + n + ', looking a little lost')
      .then(function () { var b = $('.badge', lost); if (b) b.textContent = '#' + n; });
  }).catch(function () { /* keep the local picture */ });
})();

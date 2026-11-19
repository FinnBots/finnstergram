/* ==========================================================================
   FinnBots FAMILY CODEC — the one on-device play record, read and written.
   PARENTS-AND-OIL-BRIEF.md, Phase 1 (P1 + P2).

   SOURCE OF TRUTH. apply-family.js puts this text in TWO places, byte for byte:
     - every game, ahead of templates/family-layer.js, in <script id="fb-family">
     - the site, ahead of templates/family-report.js, in /assets/family.js
   verify-family.js round-trips a record from the first to the second, so the
   game that WRITES and the page that READS can never disagree on the format.

   WHY A COOKIE. Each game is its own subdomain, so one game's localStorage is
   invisible to every other game and to finnstergram.com/parents/. A cookie on
   .finnstergram.com is the one store they all share (fb-theme already works
   this way). It is a functional record the family asked for by playing: no
   identifier, no name, nothing FinnBots ever reads on a server. It is capped
   at MAX bytes and sheds the least recently played games first.

   FORMAT (v1): parts joined by "!", fields by "~", numbers in base 36.
     1                                 version
     t~<day>~<quarter-minutes>         active play time on a UTC day
     g~<sub>~<best>~<runs>~<days>~<first>~<last>~<best0>
                                       one game: best score, finished runs,
                                       distinct days played, first and last
                                       day played, best score on the first day
     c~<NS>~<day>                      E1: that game's daily challenge was
                                       CLEARED on that day (kept 7 days, the
                                       window a parent has to collect it)
   <day> counts UTC days from 2026-01-01. UTC, to match the daily challenge.
   ========================================================================== */
var FB_FAMILY_CODEC = (function(){
  var NAME = 'fb-family', V = '1', MAX = 3600, KEEP_DAYS = 35;
  var EPOCH = Date.UTC(2026, 0, 1), DAY = 86400000;
  var SUB = /^[a-z0-9-]{1,40}$/, NS = /^[A-Z0-9]{2,6}$/, CLEAR_DAYS = 7;

  function dayIdx(ms){ return Math.floor(((ms == null ? Date.now() : ms) - EPOCH) / DAY); }
  function dayDate(i){ return new Date(EPOCH + i * DAY); }
  function n36(x){ x = Math.max(0, Math.floor(+x || 0)); return x.toString(36); }
  function p36(s){ if(!/^[0-9a-z]{1,9}$/.test(s || '')) return null; return parseInt(s, 36); }
  function empty(){ return { games: {}, time: {}, cleared: {} }; }

  function encode(rec){
    var g = (rec && rec.games) || {}, t = (rec && rec.time) || {}, today = dayIdx();
    var tparts = Object.keys(t).map(Number)
      .filter(function(d){ return d > today - KEEP_DAYS && d <= today && t[d] > 0; })
      .sort(function(a, b){ return a - b; })
      .map(function(d){ return 't~' + n36(d) + '~' + n36(t[d]); });
    var gparts = Object.keys(g).filter(function(s){ return SUB.test(s); })
      .sort(function(a, b){ return ((g[b].l || 0) - (g[a].l || 0)) || (a < b ? -1 : 1); })
      .map(function(s){ var e = g[s];
        return ['g', s, n36(e.b), n36(e.r), n36(e.d), n36(e.f), n36(e.l), n36(e.b0)].join('~'); });
    var c = (rec && rec.cleared) || {};
    var cparts = Object.keys(c).filter(function(k){
        var p = k.split('.'), d = +p[1];
        return c[k] && NS.test(p[0]) && d > today - CLEAR_DAYS && d <= today;
      }).sort().map(function(k){ var p = k.split('.'); return 'c~' + p[0] + '~' + n36(+p[1]); });
    function all(){ return [V].concat(cparts, tparts, gparts).join('!'); }
    /* over budget: forget the game played longest ago, then the oldest day.
       A cleared challenge is shed LAST: it is the one entry worth $OIL. */
    while(all().length > MAX && gparts.length) gparts.pop();
    while(all().length > MAX && tparts.length) tparts.shift();
    return all();
  }

  function decode(str){
    var rec = empty();
    if(typeof str !== 'string') return rec;
    var parts = str.split('!');
    if(parts[0] !== V) return rec;
    for(var i = 1; i < parts.length; i++){
      var f = parts[i].split('~');
      if(f[0] === 't' && f.length === 3){
        var d = p36(f[1]), q = p36(f[2]);
        if(d != null && q != null) rec.time[d] = q;
      } else if(f[0] === 'c' && f.length === 3 && NS.test(f[1])){
        var cd = p36(f[2]);
        if(cd != null) rec.cleared[f[1] + '.' + cd] = 1;
      } else if(f[0] === 'g' && f.length === 8 && SUB.test(f[1])){
        var v = f.slice(2).map(p36);
        if(v.indexOf(null) >= 0) continue;
        rec.games[f[1]] = { b: v[0], r: v[1], d: v[2], f: v[3], l: v[4], b0: v[5] };
      }
    }
    return rec;
  }

  function attrs(loc){
    var h = (loc && loc.hostname) || '';
    var dom = /(^|\.)finnstergram\.com$/.test(h) ? '; Domain=finnstergram.com' : '';
    var sec = (loc && loc.protocol === 'https:') ? '; Secure' : '';
    return '; Path=/' + dom + '; SameSite=Lax' + sec;
  }
  function read(doc){
    var m = /(?:^|;\s*)fb-family=([^;]*)/.exec((doc && doc.cookie) || '');
    return decode(m ? m[1] : '');
  }
  function write(rec, doc, loc){
    doc.cookie = NAME + '=' + encode(rec) + '; Max-Age=31536000' + attrs(loc);
  }
  function clear(doc, loc){
    doc.cookie = NAME + '=; Max-Age=0' + attrs(loc);
  }

  return { NAME: NAME, MAX: MAX, dayIdx: dayIdx, dayDate: dayDate, encode: encode, decode: decode,
           read: read, write: write, clear: clear, empty: empty };
})();
/* ==========================================================================
   FinnBots QR — a small, self-contained QR Code encoder (ISO/IEC 18004).
   PARENTS-AND-OIL-BRIEF.md section 6: /parents/ shows a parent a QR code to open
   the collect page on their own phone. Written here rather than downloaded:
   it ships on a page that leads to signing, so no third-party code rides along.

   Scope, deliberately small: BYTE mode, error-correction level M, versions
   1-10 (up to 213 bytes, ample for a collect link), all eight masks scored by
   the standard's penalty rules. qrSvg() returns an SVG string built only from
   numbers, never from the text, so it is safe to insert.

   Proven by verify-qr.js: the Reed-Solomon codewords and the format and
   version bits equal the standard's published worked examples, every version
   round-trips through a browser's own barcode reader, and sabotaged copies
   fail.
   ========================================================================== */
var FB_QR = (function(){
  /* [ec codewords per block, [blocks, data codewords], [blocks, data codewords]] — level M */
  var M = [null,
    [10, [1,16]], [16, [1,28]], [26, [1,44]], [18, [2,32]], [24, [2,43]],
    [16, [4,27]], [18, [4,31]], [22, [2,38], [2,39]], [22, [3,36], [2,37]], [26, [4,43], [1,44]]];
  var ALIGN = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];

  /* GF(256), primitive polynomial 0x11D */
  var EXP = new Array(512), LOG = new Array(256);
  (function(){ var x = 1; for(var i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 256) x ^= 0x11D; }
    for(i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function gmul(a, b){ return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }
  function rsGen(n){ var g = [1]; for(var i = 0; i < n; i++){ var ng = new Array(g.length + 1).fill(0);
      for(var j = 0; j < g.length; j++){ ng[j] ^= g[j]; ng[j + 1] ^= gmul(g[j], EXP[i]); } g = ng; } return g; }
  function rsEc(data, n){ var g = rsGen(n), r = data.concat(new Array(n).fill(0));
    for(var i = 0; i < data.length; i++){ var c = r[i]; if(c) for(var j = 0; j < g.length; j++) r[i + j] ^= gmul(g[j], c); }
    return r.slice(data.length); }

  function dataCount(v){ var t = M[v]; return t[1][0] * t[1][1] + (t[2] ? t[2][0] * t[2][1] : 0); }
  function utf8(s){ var b = []; s = unescape(encodeURIComponent(s)); for(var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return b; }

  function codewords(bytes, v){
    var bits = [], push = function(val, n){ for(var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function(b){ push(b, 8); });
    var cap = dataCount(v) * 8;
    for(var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while(bits.length % 8) bits.push(0);
    var data = []; for(var i = 0; i < bits.length; i += 8){ var x = 0; for(var k = 0; k < 8; k++) x = (x << 1) | bits[i + k]; data.push(x); }
    for(var p = 0; data.length < dataCount(v); p++) data.push(p % 2 ? 17 : 236);
    /* split into blocks, add EC per block, interleave */
    var t = M[v], blocks = [], at = 0;
    [t[1], t[2]].forEach(function(gr){ if(!gr) return; for(var b = 0; b < gr[0]; b++){ blocks.push(data.slice(at, at + gr[1])); at += gr[1]; } });
    var ecs = blocks.map(function(bl){ return rsEc(bl, t[0]); }), out = [], maxd = Math.max.apply(null, blocks.map(function(b){ return b.length; }));
    for(i = 0; i < maxd; i++) blocks.forEach(function(bl){ if(i < bl.length) out.push(bl[i]); });
    for(i = 0; i < t[0]; i++) ecs.forEach(function(ec){ out.push(ec[i]); });
    return out;
  }

  function bch(val, poly, polyBits){ var v = val << (polyBits - 1);
    for(var i = 31; i >= polyBits - 1; i--) if((v >>> i) & 1) v ^= poly << (i - (polyBits - 1)); return v; }
  function formatBits(mask){ var d = (0 << 3) | mask;   /* level M = 00 */
    return ((d << 10) | bch(d, 0x537, 11)) ^ 0x5412; }
  function versionBits(v){ return (v << 12) | bch(v, 0x1F25, 13); }

  function build(bytes, v, mask){
    var n = 17 + 4 * v, m = [], fn = [];
    for(var i = 0; i < n; i++){ m.push(new Array(n).fill(0)); fn.push(new Array(n).fill(false)); }
    function set(r, c, val){ m[r][c] = val ? 1 : 0; fn[r][c] = true; }
    function finder(r, c){ for(var dr = -1; dr <= 7; dr++) for(var dc = -1; dc <= 7; dc++){
        var rr = r + dr, cc = c + dc; if(rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        var on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(rr, cc, on); } }
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for(i = 8; i < n - 8; i++){ set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    var al = ALIGN[v];
    /* skip ONLY the three that would sit on a finder; the ones centred on the timing lines (row or column 6,
       from version 7) are drawn over them, as the standard does */
    var last = al.length - 1;
    al.forEach(function(r, ri){ al.forEach(function(c, ci){
      if((ri === 0 && ci === 0) || (ri === 0 && ci === last) || (ri === last && ci === 0)) return;
      for(var dr = -2; dr <= 2; dr++) for(var dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }); });
    set(n - 8, 8, 1);                                  /* the dark module */
    /* reserve format + version areas (filled after masking) */
    for(i = 0; i < 9; i++){ if(!fn[8][i]) set(8, i, 0); if(!fn[i][8]) set(i, 8, 0); }
    for(i = 0; i < 8; i++) set(8, n - 1 - i, 0);      /* 8 along the top right ... */
    for(i = 0; i < 7; i++) set(n - 1 - i, 8, 0);      /* ... 7 down the bottom left: (n-8, 8) is the dark module */
    if(v >= 7) for(i = 0; i < 6; i++) for(var j = 0; j < 3; j++){ set(n - 11 + j, i, 0); set(i, n - 11 + j, 0); }
    /* data, zig-zag from the bottom right */
    var cw = codewords(bytes, v), bits = [];
    cw.forEach(function(b){ for(var k = 7; k >= 0; k--) bits.push((b >>> k) & 1); });
    var bi = 0, up = true;
    for(var col = n - 1; col > 0; col -= 2){
      if(col === 6) col--;
      for(var t = 0; t < n; t++){ var r = up ? n - 1 - t : t;
        for(var k = 0; k < 2; k++){ var c = col - k; if(fn[r][c]) continue;
          var bit = bi < bits.length ? bits[bi++] : 0;
          var inv = [ (r + c) % 2 === 0, r % 2 === 0, c % 3 === 0, (r + c) % 3 === 0,
                      (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r * c) % 2 + (r * c) % 3 === 0,
                      ((r * c) % 2 + (r * c) % 3) % 2 === 0, ((r + c) % 2 + (r * c) % 3) % 2 === 0 ][mask];
          m[r][c] = bit ^ (inv ? 1 : 0); } }
      up = !up;
    }
    /* format bits: 15, most significant first */
    var f = formatBits(mask);
    for(i = 0; i < 15; i++){ var b = (f >>> (14 - i)) & 1;
      if(i < 6) m[8][i] = b; else if(i < 8) m[8][i + 1] = b; else if(i === 8) m[7][8] = b; else m[14 - i][8] = b;
      if(i < 7) m[n - 1 - i][8] = b; else m[8][n - 15 + i] = b; }
    if(v >= 7){ var vb = versionBits(v);
      for(i = 0; i < 18; i++){ var bit2 = (vb >>> i) & 1, a = Math.floor(i / 3), cc2 = n - 11 + (i % 3);
        m[a][cc2] = bit2; m[cc2][a] = bit2; } }
    return m;
  }

  function penalty(m){
    var n = m.length, p = 0, r, c, k;
    for(var pass = 0; pass < 2; pass++) for(r = 0; r < n; r++){ var run = 1;
      for(c = 1; c < n; c++){ var a = pass ? m[c][r] : m[r][c], b = pass ? m[c - 1][r] : m[r][c - 1];
        if(a === b){ run++; if(c === n - 1 && run >= 5) p += run - 2; } else { if(run >= 5) p += run - 2; run = 1; } } }
    for(r = 0; r < n - 1; r++) for(c = 0; c < n - 1; c++){ var s = m[r][c] + m[r + 1][c] + m[r][c + 1] + m[r + 1][c + 1]; if(s === 0 || s === 4) p += 3; }
    var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
    for(r = 0; r < n; r++) for(c = 0; c <= n - 11; c++) for(var pass2 = 0; pass2 < 2; pass2++){
      var h1 = true, h2 = true;
      for(k = 0; k < 11; k++){ var x = pass2 ? m[c + k][r] : m[r][c + k]; if(x !== pat1[k]) h1 = false; if(x !== pat2[k]) h2 = false; }
      if(h1) p += 40; if(h2) p += 40; }
    var dark = 0; for(r = 0; r < n; r++) for(c = 0; c < n; c++) dark += m[r][c];
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  }

  function encode(text){
    var bytes = utf8(String(text));
    for(var v = 1; v <= 10; v++){
      if(bytes.length * 8 + 4 + (v < 10 ? 8 : 16) > dataCount(v) * 8) continue;
      var best = null, bestP = Infinity;
      for(var mask = 0; mask < 8; mask++){ var mm = build(bytes, v, mask), pp = penalty(mm); if(pp < bestP){ bestP = pp; best = mm; } }
      return best;
    }
    throw new Error('too long for a version-10 QR code');
  }

  function svg(text, px){
    var m = encode(text), n = m.length, q = 4, size = (n + 2 * q), d = '';
    for(var r = 0; r < n; r++) for(var c = 0; c < n; c++) if(m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    /* no xmlns: this markup is only ever inserted into an HTML page, where <svg> takes the SVG namespace by itself
       (and check-site.js rightly flags any URL in served script that is not a declared host) */
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + (px | 0 || 240) +
           '" height="' + (px | 0 || 240) + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
           '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }

  return { encode: encode, svg: svg, _rsEc: rsEc, _formatBits: formatBits, _versionBits: versionBits, _codewords: codewords };
})();
var FB_E1_GAMES = {"BWRD":"BOTWORD","CN4B":"CONNECTBOT","SUDO":"SUDOBOT"};
var FB_E1_TERMS = {"lamports":2500000,"reward":5,"window_days":7};
/* ==========================================================================
   FinnBots FAMILY REPORT — the grown-ups' view on finnstergram.com/parents/.
   PARENTS-AND-OIL-BRIEF.md Phase 1 (P1).

   SOURCE OF TRUTH. apply-family.js --site writes templates/family-codec.js +
   this file to site/assets/family.js. It reads the record that the games' fb-family
   layer keeps in this browser and renders it into #fb-family-report. It sends
   nothing anywhere: the one request it makes is for the site's own games list,
   which turns "botman" into "BOTMAN" and a link.

   Every value goes into the page with textContent, never innerHTML (F19: the
   cookie is writable by anything on *.finnstergram.com, so treat it as input).
   ========================================================================== */
(function(){
  var C = window.FB_FAMILY_CODEC, root = document.getElementById('fb-family-report');
  if(!C || !root) return;

  var css = document.createElement('style');
  css.textContent =
    '.fam-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 20px}' +
    '.fam-tile{padding:14px 16px}.fam-tile b{display:block;font-family:var(--font-display);font-size:40px;line-height:1;color:var(--heading)}' +
    '.fam-tile span{color:var(--muted);font-size:14px}' +
    '.fam-week{display:flex;gap:8px;align-items:flex-end;height:96px;padding:14px 16px;margin:0 0 20px}' +
    '.fam-day{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;font-size:12px;color:var(--muted)}' +
    '.fam-bar{width:100%;max-width:36px;background:var(--amber);border:2px solid var(--edge);border-radius:4px;min-height:2px}' +
    '.fam-table{width:100%;border-collapse:collapse;font-size:15px}.fam-wrap{overflow-x:auto;padding:4px 8px;margin:0 0 16px}' +
    '.fam-table th,.fam-table td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);white-space:nowrap}' +
    '.fam-table th{color:var(--muted);font-weight:600;font-size:13px}.fam-table td.n,.fam-table th.n{text-align:right}' +
    '.fam-up{color:var(--ok);font-weight:700}' +
    '.fam-actions{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 24px}.fam-empty{padding:18px 20px}' +
    '@media print{.site-head,.site-foot,.fam-actions,.page-head,.section:not(.fam-section){display:none!important}}';
  document.head.appendChild(css);

  var fmt = function(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  function el(tag, cls, text){
    var e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  }
  function ago(d, today){
    var n = today - d;
    if(n <= 0) return 'Today';
    if(n === 1) return 'Yesterday';
    return n + ' days ago';
  }
  function mins(q){
    var m = Math.round(q / 4);
    if(m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  function render(list){
    var byGame = {};
    (Array.isArray(list) ? list : []).forEach(function(g){
      try{ var sub = new URL(g.url).hostname.split('.')[0]; byGame[sub] = g; }catch(e){}
    });
    var rec = C.read(document), today = C.dayIdx();
    var subs = Object.keys(rec.games).sort(function(a, b){
      return (rec.games[b].l - rec.games[a].l) || (rec.games[b].r - rec.games[a].r);
    });
    root.textContent = '';

    if(!subs.length){
      var e = el('div', 'panel fam-empty');
      e.appendChild(el('p', null, 'Nothing has been played in this browser yet.'));
      e.appendChild(el('p', 'quiet', 'When your child plays any FinnBots game on this device, this page shows which games, for how long, and how much they have improved. It is kept only in this browser and is never sent to us.'));
      root.appendChild(e);
      return;
    }

    var week = [], q7 = 0, days7 = 0;
    for(var d = today - 6; d <= today; d++){
      var q = rec.time[d] || 0;
      week.push({ d: d, q: q });
      q7 += q;
      var played = q > 0 || subs.some(function(s){ return rec.games[s].l === d; });
      if(played) days7++;
    }
    var runs = subs.reduce(function(t, s){ return t + rec.games[s].r; }, 0);

    var tiles = el('div', 'fam-tiles');
    [[days7 + ' / 7', 'days played this week'], [mins(q7), 'playing this week'],
     [String(subs.length), subs.length === 1 ? 'game tried' : 'games tried'], [fmt(runs), runs === 1 ? 'game finished' : 'games finished']]
      .forEach(function(t){
        var p = el('div', 'panel fam-tile');
        p.appendChild(el('b', null, t[0])); p.appendChild(el('span', null, t[1]));
        tiles.appendChild(p);
      });
    root.appendChild(tiles);

    var max = Math.max.apply(null, week.map(function(w){ return w.q; }).concat([1]));
    var bars = el('div', 'panel fam-week');
    bars.setAttribute('role', 'img');
    bars.setAttribute('aria-label', 'Minutes played on each of the last 7 days: ' +
      week.map(function(w){ return Math.round(w.q / 4); }).join(', '));
    week.forEach(function(w){
      var col = el('div', 'fam-day');
      var bar = el('div', 'fam-bar');
      bar.style.height = Math.round(70 * w.q / max) + '%';
      bar.title = mins(w.q);
      col.appendChild(bar);
      var name;
      try{ name = C.dayDate(w.d).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }); }catch(e){ name = ''; }
      col.appendChild(el('span', null, w.d === today ? 'Today' : name));
      bars.appendChild(col);
    });
    root.appendChild(bars);

    var wrap = el('div', 'panel fam-wrap');
    var tbl = el('table', 'fam-table');
    var hr = el('tr');
    [['Game'], ['Best score', 'n'], ['Improved by', 'n'], ['Games finished', 'n'], ['Days played', 'n'], ['Last played']]
      .forEach(function(h){ var th = el('th', h[1] || null, h[0]); th.scope = 'col'; hr.appendChild(th); });
    var thead = el('thead'); thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el('tbody');
    subs.forEach(function(s){
      var g = rec.games[s], info = byGame[s], tr = el('tr'), td = el('td');
      if(info && /^https:\/\/[a-z0-9-]+\.finnstergram\.com\/?$/.test(info.url)){
        var a = el('a', null, info.name); a.href = info.url; td.appendChild(a);
      } else td.textContent = s;
      tr.appendChild(td);
      tr.appendChild(el('td', 'n', fmt(g.b)));
      var up = g.b - g.b0;
      tr.appendChild(el('td', 'n' + (up > 0 ? ' fam-up' : ''), up > 0 ? '+' + fmt(up) : '—'));
      tr.appendChild(el('td', 'n', fmt(g.r)));
      tr.appendChild(el('td', 'n', fmt(g.d)));
      tr.appendChild(el('td', null, ago(g.l, today)));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); root.appendChild(wrap);
    root.appendChild(el('p', 'quiet', '"Improved by" compares the best score now with the best score on the first day that game was played here.'));

    var acts = el('div', 'fam-actions');
    var pr = el('button', 'btn btn-amber', 'Print this summary'); pr.type = 'button';
    pr.addEventListener('click', function(){ window.print(); });
    var cl = el('button', 'btn btn-plain', 'Clear this record'); cl.type = 'button';
    cl.addEventListener('click', function(){
      if(window.confirm('Clear the FinnBots play record in this browser? This cannot be undone.')){
        C.clear(document, location); render(list);
      }
    });
    acts.appendChild(pr); acts.appendChild(cl);
    root.appendChild(acts);
  }

  render([]);
  try{
    fetch('/assets/games.json').then(function(r){ return r.ok ? r.json() : []; })
      .then(render, function(){});
  }catch(e){}
})();
/* ==========================================================================
   FinnBots E1 COLLECT PANEL — on /parents/, for grown-ups (PARENTS-AND-OIL-BRIEF.md section 6).

   SOURCE OF TRUTH. apply-family.js --site builds site/assets/family.js from the codec, qr.js, the E1 roster
   (FB_E1_GAMES, from templates/e1-roster.json) and this file. It renders ONLY into #fb-e1-collect, which the
   E1 section adds to the page at go-live, so no section means no panel: the off switch.

   It lists the daily challenges cleared on THIS device in the last 7 days and, behind a grown-ups' question,
   shows a QR code (and a link) for the collect page. The grown-up opens that on their own phone and signs
   there, in Phantom. This page signs nothing, holds no wallet code and sends nothing anywhere.
   ========================================================================== */
(function(){
  var C = window.FB_FAMILY_CODEC, Q = window.FB_QR, G = window.FB_E1_GAMES || {}, TERMS = window.FB_E1_TERMS || {};
  var root = document.getElementById('fb-e1-collect');
  if(!C || !Q || !root) return;

  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function dayName(d){
    try{ return C.dayDate(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
    catch(e){ return 'day ' + d; }
  }
  var names = Object.keys(G).map(function(k){ return G[k]; }).join(', ');

  function cleared(){
    var rec = C.read(document), today = C.dayIdx(), out = [];
    Object.keys(rec.cleared || {}).forEach(function(k){
      var p = k.split('.'), d = +p[1];
      if(Object.prototype.hasOwnProperty.call(G, p[0]) && d > today - 7 && d <= today) out.push({ ns: p[0], day: d });
    });
    return out.sort(function(a, b){ return (b.day - a.day) || (a.ns < b.ns ? -1 : 1); });
  }
  function link(list){
    return location.origin + '/parents/collect/#c=' + list.map(function(c){ return c.ns + '.' + c.day.toString(36); }).join(',');
  }

  function render(){
    root.textContent = '';
    var list = cleared();
    var box = el('div', 'panel fam-collect');
    box.appendChild(el('h3', null, 'Daily challenges cleared on this device'));
    if(!list.length){
      box.appendChild(el('p', 'quiet', 'None in the last 7 days. When your child clears the daily challenge in ' + names +
        ', you can collect a small $OIL reward for it here, with your own Phantom wallet. Your child is never shown a reward or asked to do anything.'));
      root.appendChild(box); return;
    }
    var ul = el('ul', 'fam-cleared');
    list.forEach(function(c){ ul.appendChild(el('li', null, (G[c.ns] || c.ns) + ' — ' + dayName(c.day))); });
    box.appendChild(ul);
    /* the terms come from templates/e1-terms.json (the same file the claim page reads) — never typed here */
    box.appendChild(el('p', null, 'Each one can be collected once, within ' + TERMS.window_days + ' days, for ' + TERMS.reward +
      ' $OIL. Collecting costs ' + (TERMS.lamports / 1e9) + ' SOL each, paid from your wallet; the $OIL arrives with the next weekly rewards payout.'));
    var btn = el('button', 'btn btn-amber', 'For grown-ups: show the collect code'); btn.type = 'button';
    btn.addEventListener('click', function(){ ask(box, list, btn); });
    box.appendChild(btn);
    root.appendChild(box);
  }

  /* A grown-ups' question, as children's apps use: it keeps a young child from wandering into a wallet flow.
     It is not security — nothing here can move money; that takes the grown-up's own Phantom on their own phone. */
  function ask(box, list, btn){
    btn.hidden = true;
    var a = 6 + Math.floor(Math.random() * 7), b = 6 + Math.floor(Math.random() * 7);
    var f = el('form', 'fam-gate');
    var lab = el('label', null, 'What is ' + a + ' × ' + b + '? ');
    var inp = el('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.autocomplete = 'off'; inp.size = 4;
    lab.appendChild(inp); f.appendChild(lab);
    var go = el('button', 'btn btn-plain', 'Show'); go.type = 'submit'; f.appendChild(go);
    var msg = el('p', 'quiet'); f.appendChild(msg);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      if(parseInt(inp.value, 10) === a * b){ f.remove(); show(box, list); }
      else { msg.textContent = 'Not quite — ask a grown-up to help.'; inp.value = ''; }
    });
    box.appendChild(f);
    try{ inp.focus(); }catch(e){}
  }

  function show(box, list){
    var url = link(list);
    var wrap = el('div', 'fam-qr');
    wrap.innerHTML = Q.svg(url, 220);                 /* built from numbers only (verify-qr.js) */
    box.appendChild(wrap);
    box.appendChild(el('p', null, 'Scan this with your phone’s camera. It opens the collect page; approve each one in Phantom there.'));
    var a = el('a', null, 'Or open the collect page on this device'); a.href = url;
    box.appendChild(a);
    var note = el('p', 'quiet', 'Limits: at most 5 collections per wallet per day, and a shared daily pool that can run out. ' +
      'Your wallet address, the game and the day are written publicly on the Solana blockchain when you collect; no score, name or anything about your child is.');
    box.appendChild(note);
  }

  var css = document.createElement('style');
  css.textContent = '.fam-collect{padding:18px 20px;margin:0 0 20px}.fam-collect h3{margin:0 0 8px}' +
    '.fam-cleared{margin:0 0 12px;padding-left:20px}.fam-gate{margin:12px 0}.fam-gate input{font:inherit;padding:6px 8px;width:5em}' +
    '.fam-qr{margin:14px 0 8px}.fam-qr svg{max-width:100%;height:auto;border:4px solid #fff;border-radius:8px}';
  document.head.appendChild(css);
  render();
})();

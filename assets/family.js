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
   <day> counts UTC days from 2026-01-01. UTC, to match the daily challenge.
   ========================================================================== */
var FB_FAMILY_CODEC = (function(){
  var NAME = 'fb-family', V = '1', MAX = 3600, KEEP_DAYS = 35;
  var EPOCH = Date.UTC(2026, 0, 1), DAY = 86400000;
  var SUB = /^[a-z0-9-]{1,40}$/;

  function dayIdx(ms){ return Math.floor(((ms == null ? Date.now() : ms) - EPOCH) / DAY); }
  function dayDate(i){ return new Date(EPOCH + i * DAY); }
  function n36(x){ x = Math.max(0, Math.floor(+x || 0)); return x.toString(36); }
  function p36(s){ if(!/^[0-9a-z]{1,9}$/.test(s || '')) return null; return parseInt(s, 36); }
  function empty(){ return { games: {}, time: {} }; }

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
    function all(){ return [V].concat(tparts, gparts).join('!'); }
    /* over budget: forget the game played longest ago, then the oldest day */
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

/* ==========================================================================
   FinnBots CABINET NAMES — an index into templates/cabinet-names.json, turned into a name.
   PARENTS-AND-OIL-BRIEF.md section 7 (S1, D2 2026-10-22).

   SOURCE OF TRUTH for the browser half. The scanner has the same function in Python (sinks.py), and
   verify-names.js proves the two agree index for index, so the name a grown-up paid for is the name the
   board shows. A name is never typed: index -> adjective + noun + number, all from reviewed lists.

   Usage: FB_CABINET_NAMES(lists) -> { count, name(i), valid(i), suggest(seed, k) }
   ========================================================================== */
var FB_CABINET_NAMES = function(L){
  var A = L.adjectives, N = L.nouns, K = [];
  for(var n = L.numbers_from; n <= L.numbers_to; n++) if(L.numbers_skip.indexOf(n) < 0) K.push(n);
  var COUNT = A.length * N.length * K.length;
  function valid(i){ return typeof i === 'number' && isFinite(i) && i === Math.floor(i) && i >= 0 && i < COUNT; }
  function name(i){
    if(!valid(i)) return null;
    return A[Math.floor(i / (N.length * K.length))] + ' ' + N[Math.floor(i / K.length) % N.length] + ' ' + K[i % K.length];
  }
  /* k distinct suggestions from a seed (e.g. the wallet address + season): the same wallet sees the same choices
     in a season, so the list is not a slot machine to pull again and again. */
  function suggest(seed, k){
    var h = 2166136261 >>> 0, s = String(seed), out = [], seen = {};
    for(var c = 0; c < s.length; c++){ h ^= s.charCodeAt(c); h = Math.imul(h, 16777619) >>> 0; }
    while(out.length < Math.min(k, COUNT)){
      h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
      var i = h % COUNT; if(!seen[i]){ seen[i] = 1; out.push(i); }
    }
    return out;
  }
  return { count: COUNT, name: name, valid: valid, suggest: suggest };
};
if(typeof module !== 'undefined' && module.exports) module.exports = FB_CABINET_NAMES;

/* ==========================================================================
   FinnBots SINKS PAY PAGE — finnstergram.com/holders/name/ and /holders/fund/ (PARENTS-AND-OIL-BRIEF.md section 7).

   SOURCE OF TRUTH. apply-sinks.js --site publishes it as /assets/sinks.js, after templates/cabinet-names.js.
   Grown-ups with a wallet only. Phantom SIGNS; this page SUBMITS through CFG.rpc (the FinnBots RPC Worker live, the
   local validator in test) and polls for confirmation — the games' own payment code (templates/wallet-layer.reference.js),
   unchanged in substance: ONE SPL transfer of $OIL from the payer's $OIL account to the treasury token account + ONE memo.

     name:  CFG.nameFee $OIL   memo FBNM|s=<YYYY-MM>|n=<index>    (the scanner checks the season is the month it landed)
     fund:  10, 50 or 100      memo FBFD|f=<fund id>

   sinks.py accepts exactly that and nothing else. Settings come from <script type="application/json" id="sink-cfg">
   (apply-sinks.js, from factory.env), never typed here. A payment is sent at most ONCE per press: after it is sent the
   button is gone, whatever happens next (the E1 claim page's lesson, 2026-10-22: a retry must never pay twice).
   ========================================================================== */
(function(){
  var cfgEl = document.getElementById('sink-cfg'), root = document.getElementById('sink-pay');
  if(!cfgEl || !root) return;
  var CFG; try{ CFG = JSON.parse(cfgEl.textContent); }catch(e){ root.textContent = 'This page is misconfigured.'; return; }
  var NAMES = CFG.names ? FB_CABINET_NAMES(CFG.names) : null, KEY = 'fb-sink-paid';
  var season = new Date().toISOString().slice(0, 7);          /* UTC month: the scanner's season for this payment */
  var wallet = null, picked = null;

  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function store(){ try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ return {}; } }
  function remember(k, v){ var s = store(); s[k] = v; try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  var delay = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var status = el('p', 'sink-status');
  function say(t, warn){ status.textContent = t; status.className = 'sink-status' + (warn ? ' warn' : ''); }

  function provider(){
    if(window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if(window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }

  /* ---- the games' payment code: one SPL transfer + one memo ---- */
  function u64LE(n){ var out = new Uint8Array(8), big = BigInt(Math.round(n)); for(var i = 0; i < 8; i++){ out[i] = Number(big & 0xffn); big >>= 8n; } return out; }
  function transferIx(src, dst, owner, raw){ var data = new Uint8Array(9); data[0] = 3; data.set(u64LE(raw), 1);
    return new solanaWeb3.TransactionInstruction({ programId: new solanaWeb3.PublicKey(CFG.tokenProgram),
      keys: [{ pubkey: src, isSigner: false, isWritable: true }, { pubkey: dst, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }], data: data }); }
  function memoIx(owner, text){ return new solanaWeb3.TransactionInstruction({ programId: new solanaWeb3.PublicKey(CFG.memoProgram),
    keys: [{ pubkey: owner, isSigner: true, isWritable: false }], data: new TextEncoder().encode(text) }); }
  async function confirm(conn, sig, ms){
    var t0 = Date.now();
    while(Date.now() - t0 < ms){
      var st = ((await conn.getSignatureStatuses([sig])) || {}).value; st = st && st[0];
      if(st){ if(st.err){ var bad = new Error('The payment failed on-chain; no $OIL was taken. Reload the page to try again.'); bad.onchain = true; throw bad; }
              if(st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return true; }
      await delay(1500);
    }
    return false;
  }

  async function connect(){
    var p = provider();
    if(!p){
      if(isMobile()){ say('Opening this page inside Phantom…');
        location.href = 'https://phantom.app/ul/browse/' + encodeURIComponent(location.href) + '?ref=' + encodeURIComponent(location.origin); return null; }
      throw new Error('Phantom is not available in this browser. Install it, or open this page on your phone.');
    }
    if(!wallet){ say('Connecting…'); wallet = (await p.connect()).publicKey.toString(); say(''); }
    return p;
  }

  async function pay(btn, amountOil, memo, rememberKey){
    btn.disabled = true;
    var sent = false;
    try{
      var p = await connect(); if(!p) return;
      if(typeof solanaWeb3 === 'undefined') throw new Error('The wallet library did not load. Reload the page.');
      var owner = new solanaWeb3.PublicKey(wallet), conn = new solanaWeb3.Connection(CFG.rpc, 'confirmed');
      var accts = await conn.getTokenAccountsByOwner(owner, { mint: new solanaWeb3.PublicKey(CFG.mint) });
      if(!accts.value.length) throw new Error('This wallet has no $OIL account.');
      var src = accts.value[0].pubkey, raw = Math.round(amountOil * Math.pow(10, CFG.decimals));
      var bal = await conn.getTokenAccountBalance(src);
      if(Number(bal.value.amount) < raw) throw new Error('Not enough $OIL in this wallet: this needs ' + amountOil + '.');
      var tx = new solanaWeb3.Transaction();
      tx.add(transferIx(src, new solanaWeb3.PublicKey(CFG.treasury), owner, raw), memoIx(owner, memo));
      tx.feePayer = owner; tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      say('Approve in Phantom…');
      var signed = await p.signTransaction(tx);
      say('Sending…');
      var sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      sent = true; btn.remove();                                /* sent: this button can never pay again */
      remember(rememberKey, { sig: sig, memo: memo, at: Date.now() });
      var ok = await confirm(conn, sig, 30000);
      say(ok ? 'Paid ✓ ' + CFG.doneText : 'Sent, still confirming. Do not pay again: check it on Solscan first (' + sig.slice(0, 16) + '…).');
    }catch(e){
      say((e && e.message) || 'Something went wrong. Nothing was taken unless a line above says paid.', true);
      if(!sent) btn.disabled = false;                           /* never sent: safe to press again */
      else if(e && e.onchain){ var s = store(); delete s[rememberKey]; try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(x){} }
    }
  }

  /* ---- the two pages ---- */
  function renderName(){
    root.appendChild(el('p', null, 'Pick a name for your cabinet on the FinnBots leaderboards this season (' + season +
      '). It shows in place of your wallet address on every board you play. ' + CFG.nameFee + ' $OIL; a new season starts each month.'));
    root.appendChild(el('p', 'quiet', 'Names come from a fixed list of robot words, so nothing on a board can be rude or personal.'));
    var go = el('button', 'btn btn-amber', 'Connect Phantom to see your names'); go.type = 'button'; go.id = 'sink-connect';
    root.appendChild(go); root.appendChild(status);
    go.addEventListener('click', async function(){
      try{ if(!(await connect())) return; }catch(e){ say(e.message, true); return; }
      go.remove();
      var had = store()['name|' + wallet + '|' + season];
      if(had) root.insertBefore(el('p', 'quiet', 'You already paid for a name this season. Choosing again replaces it and costs another ' + CFG.nameFee + ' $OIL.'), status);
      var list = el('div', 'sink-names'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', 'Cabinet names');
      NAMES.suggest(wallet + '|' + season, 8).forEach(function(i){
        var b = el('button', 'sink-name', NAMES.name(i)); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
        b.dataset.n = i;
        b.addEventListener('click', function(){ picked = i; [].forEach.call(list.children, function(x){ x.setAttribute('aria-checked', String(x === b)); }); payBtn.disabled = false; payBtn.textContent = 'Pay ' + CFG.nameFee + ' $OIL for "' + NAMES.name(i) + '"'; });
        list.appendChild(b);
      });
      var payBtn = el('button', 'btn btn-amber', 'Pick a name first'); payBtn.type = 'button'; payBtn.id = 'sink-go'; payBtn.disabled = true;
      payBtn.addEventListener('click', function(){ if(picked != null && NAMES.valid(picked)) pay(payBtn, CFG.nameFee, 'FBNM|s=' + season + '|n=' + picked, 'name|' + wallet + '|' + season); });
      root.insertBefore(list, status); root.insertBefore(payBtn, status);
    });
  }

  function renderFund(){
    var f = CFG.fund;
    if(!f){ root.appendChild(el('p', null, 'No build fund is open right now.')); return; }
    root.appendChild(el('h2', null, f.title));
    root.appendChild(el('p', null, 'Every $OIL here goes toward ' + (f.kind === 'new game' ? 'a new game' : 'a new level pack') +
      ' that ships FREE for everyone, children included, once ' + f.target.toLocaleString('en-GB') + ' $OIL is raised. There is no deadline.'));
    var bar = el('div', 'sink-bar'), fill = el('span'), note = el('p', 'quiet', 'Loading the total…');
    bar.appendChild(fill); root.appendChild(bar); root.appendChild(note);
    fetch('/assets/funds.json', { cache: 'no-store' }).then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(j){
      var t = (j.funds || []).filter(function(x){ return x.id === f.id; })[0];
      if(!t || !j.updated){ note.textContent = 'The total has not been published yet.'; return; }
      fill.style.width = Math.min(100, 100 * t.raised / t.target).toFixed(1) + '%';
      note.textContent = t.raised.toLocaleString('en-GB') + ' of ' + t.target.toLocaleString('en-GB') + ' $OIL raised (updated when the leaderboards are).';
    }).catch(function(){ note.textContent = 'The total could not be loaded just now.'; });
    var row = el('div', 'sink-amounts');
    CFG.amounts.forEach(function(a){
      var b = el('button', 'btn btn-amber', 'Give ' + a + ' $OIL'); b.type = 'button'; b.dataset.amount = a;
      b.addEventListener('click', function(){ [].forEach.call(row.querySelectorAll('button'), function(x){ if(x !== b) x.remove(); });
        pay(b, a, 'FBFD|f=' + f.id, 'fund|' + Date.now()); });
      row.appendChild(b);
    });
    root.appendChild(row); root.appendChild(status);
  }

  root.textContent = '';
  if(CFG.test) root.appendChild(el('p', 'sink-test', 'TEST MODE — local test chain, no real $OIL.'));
  (CFG.kind === 'name' ? renderName : renderFund)();
  var css = document.createElement('style');
  css.textContent = '#sink-pay{padding:18px 20px}.sink-status{font-weight:700}.sink-status.warn{color:#c0392b}' +
    '.sink-names{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.sink-name{padding:8px 12px;border-radius:10px;border:2px solid var(--edge);background:var(--card);color:inherit;font:inherit;cursor:pointer}' +
    '.sink-name[aria-checked="true"]{border-color:var(--amber);outline:2px solid var(--amber)}.sink-amounts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}' +
    '.sink-bar{height:14px;border-radius:7px;background:var(--edge);overflow:hidden;margin:8px 0}.sink-bar span{display:block;height:100%;width:0;background:var(--amber)}' +
    '.sink-test{background:#fde8c8;color:#8a4f05;padding:6px 10px;border-radius:8px;font-weight:700}';
  document.head.appendChild(css);
  window.FB_SINK = { season: season, cfg: CFG };
})();

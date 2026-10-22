/* ==========================================================================
   FinnBots E1 CLAIM PAGE — finnstergram.com/parents/collect/ (PARENTS-AND-OIL-BRIEF.md section 6).

   SOURCE OF TRUTH. apply-family.js --site --e1 publishes it as /assets/e1-claim.js beside the collect page.
   The ONE signing page on the site. Its wallet pattern is the faucet chassis's, unchanged in substance:
   Phantom SIGNS only, this page SUBMITS through CFG.rpc (the FinnBots RPC Worker live, the local validator
   in test) and polls for confirmation. On a phone without Phantom's in-app browser it re-opens itself
   there (Phantom's "browse" link), so mobile needs no new code path.

   Each claim is ONE transaction: CFG.lamports SOL to the rewards wallet + the memo FBRW|g=<NS>|d=<day>.
   The scanner (rewards_claims.py) pays only when the rewards wallet's own balance rose by exactly that much
   and the memo is the only memo, so this page builds precisely that and nothing else.

   Settings come from <script type="application/json" id="e1-cfg"> (written by apply-family.js from
   factory.env), never typed into this file. An unset or invalid rewards wallet refuses to build anything.
   ========================================================================== */
(function(){
  var cfgEl = document.getElementById('e1-cfg'), root = document.getElementById('e1-collect');
  if(!cfgEl || !root) return;
  var CFG; try{ CFG = JSON.parse(cfgEl.textContent); }catch(e){ root.textContent = 'This page is misconfigured.'; return; }
  var GAMES = CFG.games || {}, KEY = 'fb-e1-collected', MAX_AT_ONCE = 5;
  var EPOCH = Date.UTC(2026, 0, 1), DAY = 86400000;
  var today = Math.floor((Date.now() - EPOCH) / DAY);
  var delay = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function dayName(d){ try{ return new Date(EPOCH + d * DAY).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }catch(e){ return 'day ' + d; } }
  function store(){ try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ return {}; } }
  function remember(k, v){ var s = store(); s[k] = v; try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  function forget(k){ var s = store(); delete s[k]; try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  function unsent(){ var s = store(); return batch.filter(function(c){ return !s[c.ns + '.' + c.day]; }); }

  /* ---- what the QR code asked for, judged the way the scanner will judge it ---- */
  var asked = (/[#&]c=([A-Z0-9.,a-z]{1,400})/.exec(location.hash) || [])[1] || '';
  var claims = [], skipped = [];
  asked.split(',').filter(Boolean).forEach(function(part){
    var m = /^([A-Z0-9]{2,6})\.([0-9a-z]{1,4})$/.exec(part), d = m ? parseInt(m[2], 36) : NaN;
    if(!m) return skipped.push(part + ': not a claim');
    if(!Object.prototype.hasOwnProperty.call(GAMES, m[1])) return skipped.push(part + ': not a daily-challenge game');
    if(!(d <= today && d > today - 7)) return skipped.push((GAMES[m[1]]) + ' ' + dayName(d) + ': not within the last 7 days');
    if(store()[m[1] + '.' + d]) return skipped.push(GAMES[m[1]] + ' ' + dayName(d) + ': already collected from this phone');
    if(!claims.some(function(c){ return c.ns === m[1] && c.day === d; })) claims.push({ ns: m[1], day: d });
  });
  claims.sort(function(a, b){ return a.day - b.day; });          /* oldest first: they expire first */
  var batch = claims.slice(0, MAX_AT_ONCE);

  /* ---- wallet: the faucet chassis's pattern ---- */
  var wallet = null;
  function provider(){
    if(window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if(window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }
  function rewardsKey(){
    if(typeof solanaWeb3 === 'undefined') throw new Error('The wallet library did not load. Reload the page.');
    if(!CFG.rewards || /^</.test(CFG.rewards)) throw new Error('Collecting is not switched on yet.');
    return new solanaWeb3.PublicKey(CFG.rewards);              /* throws on anything that is not a real address */
  }
  function buildTx(owner, c, blockhash){
    var tx = new solanaWeb3.Transaction();
    tx.add(solanaWeb3.SystemProgram.transfer({ fromPubkey: owner, toPubkey: rewardsKey(), lamports: CFG.lamports }),
           new solanaWeb3.TransactionInstruction({ programId: new solanaWeb3.PublicKey(CFG.memoProgram),
             keys: [{ pubkey: owner, isSigner: true, isWritable: false }],
             data: new TextEncoder().encode('FBRW|g=' + c.ns + '|d=' + c.day) }));
    tx.feePayer = owner; tx.recentBlockhash = blockhash;
    return tx;
  }
  async function confirm(conn, sig, ms){
    var t0 = Date.now();
    while(Date.now() - t0 < ms){
      var st = ((await conn.getSignatureStatuses([sig])) || {}).value; st = st && st[0];
      if(st){ if(st.err){ var bad = new Error('A claim failed on-chain; its fee was not kept. Press the button to try it again.'); bad.onchain = true; throw bad; } if(st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return true; }
      await delay(1500);
    }
    return false;
  }

  /* ---- the page ---- */
  var status = el('p', 'e1-status');
  function say(t, warn){ status.textContent = t; status.className = 'e1-status' + (warn ? ' warn' : ''); }

  function render(){
    root.textContent = '';
    if(CFG.test) root.appendChild(el('p', 'e1-test', 'TEST MODE — local test chain, no real SOL or $OIL.'));
    if(!batch.length){
      root.appendChild(el('p', null, claims.length ? '' : 'Nothing to collect here.'));
    } else {
      root.appendChild(el('h2', null, 'Ready to collect: ' + batch.length + (batch.length === 1 ? ' challenge' : ' challenges')));
      var ul = el('ul', 'e1-list');
      batch.forEach(function(c){ var li = el('li', null, GAMES[c.ns] + ' — ' + dayName(c.day)); li.id = 'e1-' + c.ns + '-' + c.day; ul.appendChild(li); });
      root.appendChild(ul);
      if(claims.length > batch.length) root.appendChild(el('p', 'quiet', (claims.length - batch.length) + ' more after these: a wallet is paid for at most ' + MAX_AT_ONCE + ' a day, so collect the rest tomorrow (each keeps for 7 days).'));
      root.appendChild(el('p', null, 'Each costs ' + (CFG.lamports / 1e9) + ' SOL from your wallet and pays ' + CFG.reward +
        ' $OIL to it with the next weekly rewards payout. You approve every one in Phantom.'));
      root.appendChild(el('p', 'quiet', 'Public on the Solana blockchain: your wallet address, the game and the day. Nothing about your child. ' +
        'Limits: 5 collections per wallet per day, and a shared daily pool that can run out — a claim past either is not paid.'));
      var b = el('button', 'btn btn-amber', 'Connect Phantom and collect'); b.type = 'button'; b.id = 'e1-go';
      b.addEventListener('click', function(){ collect(b); });
      root.appendChild(b);
    }
    root.appendChild(status);
    if(skipped.length){ var s = el('ul', 'e1-skipped quiet'); skipped.forEach(function(x){ s.appendChild(el('li', null, x)); }); root.appendChild(s); }
  }

  async function collect(btn){
    btn.disabled = true;
    try{
      var p = provider();
      if(!p){
        if(isMobile()){
          say('Opening this page inside Phantom…');
          location.href = 'https://phantom.app/ul/browse/' + encodeURIComponent(location.href) + '?ref=' + encodeURIComponent(location.origin);
          return;
        }
        throw new Error('Phantom is not available in this browser. Install it, or scan the code with your phone.');
      }
      if(!wallet){ say('Connecting…'); wallet = (await p.connect()).publicKey.toString(); }
      var owner = new solanaWeb3.PublicKey(wallet), conn = new solanaWeb3.Connection(CFG.rpc, 'confirmed');
      rewardsKey();
      var need = batch.length * (CFG.lamports + 5000);
      if(await conn.getBalance(owner) < need) throw new Error('This wallet needs at least ' + (need / 1e9) + ' SOL to collect these.');
      var bh = (await conn.getLatestBlockhash()).blockhash;
      var txs = batch.map(function(c){ return buildTx(owner, c, bh); });
      say('Approve in Phantom…');
      var signed = p.signAllTransactions ? await p.signAllTransactions(txs) : await txs.reduce(function(acc, t){
        return acc.then(function(out){ return p.signTransaction(t).then(function(s){ out.push(s); return out; }); }); }, Promise.resolve([]));
      if(!signed || signed.length !== txs.length) throw new Error('Phantom returned a different number of transactions; nothing was sent.');
      for(var i = 0; i < signed.length; i++){
        var c = batch[i], li = document.getElementById('e1-' + c.ns + '-' + c.day);
        say('Sending ' + (i + 1) + ' of ' + signed.length + '…');
        var sig = await conn.sendRawTransaction(signed[i].serialize(), { skipPreflight: false });
        remember(c.ns + '.' + c.day, { sig: sig, wallet: wallet, at: Date.now() });      /* never pay a fee twice for one claim */
        var ok;
        try{ ok = await confirm(conn, sig, 30000); }
        catch(e){                           /* failed ON-CHAIN: the claim is still open. A lost connection is NOT that: the
                                               transaction may still land, so it stays remembered and is never signed twice. */
          if(e && e.onchain){ forget(c.ns + '.' + c.day); if(li) li.textContent = GAMES[c.ns] + ' — ' + dayName(c.day) + ' ✗ failed, no fee kept'; }
          throw e; }
        if(li) li.textContent = GAMES[c.ns] + ' — ' + dayName(c.day) + (ok ? ' ✓ collected' : ' … sent, still confirming');
      }
      say('Done. Your $OIL arrives with the next weekly rewards payout.');
      /* the button goes: pressing it again would sign the SAME claims, pay the fee and be refused as a duplicate
         (seen on the Founder's first live claim, 2026-10-22) */
      btn.hidden = true; btn.remove();
      batch = []; return;
    }catch(e){
      say((e && e.message) || 'Something went wrong. Nothing was sent unless a line above says collected.', true);
      batch = unsent();                     /* what was sent stays sent: the button now offers only the rest */
      if(batch.length) btn.disabled = false; else btn.remove();
    }
  }

  var css = document.createElement('style');
  css.textContent = '#e1-collect{padding:18px 20px}.e1-list{padding-left:20px}.e1-status{font-weight:700}.e1-status.warn{color:#c0392b}' +
    '.e1-test{background:#fde8c8;color:#8a4f05;padding:6px 10px;border-radius:8px;font-weight:700}';
  document.head.appendChild(css);
  render();
  window.FB_E1_CLAIM = { claims: claims, batch: batch, skipped: skipped, collect: function(){ return collect(document.getElementById('e1-go')); } };
})();

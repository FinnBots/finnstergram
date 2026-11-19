/* finnstergram.com/holders/ — the Holder Dashboard (2026-10-17).
   READ-ONLY: connects a Phantom wallet and reads balances through the FinnBots RPC Worker. It never
   builds, signs or sends a transaction.
   Hardened vs the old page:
   - the wallet address (which, after a mobile deeplink, arrives in a URL anyone can craft) is checked
     against the Solana address format and only ever written as TEXT — the old page wrote it with
     innerHTML, a script-injection route on a URL an attacker controls;
   - a Bot picture is shown only if it is in the verified index (assets/bot-index.json): Arweave answers
     any number with Bot #12's picture, so the old page showed a stranger's Bot for #1640 and #2984. */
(function () {
  'use strict';
  var RPC = 'https://finnbots-rpc.mart-kin1000.workers.dev';
  var OIL_MINT = 'HrcfXJcFdMoLfbkN5qCTSFrLsAgJNHitmwKc5AyS7xzf';
  var TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  var EMISSION_RATE = 10;                      // $OIL per Bot per day
  var ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;  // a base58 Solana address — nothing else is ever displayed
  var $ = function (s) { return document.querySelector(s); };
  var el = {
    connect: $('[data-h-connect]'), status: $('[data-h-status]'), addr: $('[data-h-addr]'),
    disconnect: $('[data-h-disconnect]'), pre: $('[data-h-pre]'), board: $('[data-h-board]'),
    oil: $('[data-h-oil]'), bots: $('[data-h-bots]'), rate: $('[data-h-rate]'),
    grid: $('[data-h-grid]'), empty: $('[data-h-empty]'), msg: $('[data-h-msg]')
  };
  if (!el.connect) return;

  function say(text, warn) { el.msg.textContent = text || ''; el.msg.classList.toggle('warn', !!warn); }
  function short(a) { return a.slice(0, 4) + '…' + a.slice(-4); }
  function fmt(n, d) { return Number(n).toLocaleString('en-GB', { maximumFractionDigits: d || 0 }); }

  function rpc(method, params) {
    return fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) })
      .then(function (r) { if (!r.ok) throw new Error('RPC ' + r.status); return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error.message || 'RPC error'); return j.result; });
  }
  var dataP = null;
  function botData() {                         // mint -> number, plus the pictured set
    return dataP || (dataP = Promise.all([
      fetch('/assets/bot-mints.json').then(function (r) { if (!r.ok) throw new Error('Bot list ' + r.status); return r.json(); }),
      fetch('/assets/bot-index.json').then(function (r) { if (!r.ok) throw new Error('Bot index ' + r.status); return r.json(); })
    ]).then(function (res) {
      var byMint = {}; Object.keys(res[0]).forEach(function (n) { byMint[res[0][n]] = +n; });
      return { byMint: byMint, pictured: new Set(res[1].image), base: res[1].base };
    }));
  }

  function oilBalance(owner) {
    return rpc('getTokenAccountsByOwner', [owner, { mint: OIL_MINT }, { encoding: 'jsonParsed' }]).then(function (r) {
      var t = 0; ((r && r.value) || []).forEach(function (a) { t += a.account.data.parsed.info.tokenAmount.uiAmount || 0; }); return t;
    });
  }
  function heldBots(owner, data) {
    return rpc('getTokenAccountsByOwner', [owner, { programId: TOKEN_PROGRAM }, { encoding: 'jsonParsed' }]).then(function (r) {
      var held = [];
      ((r && r.value) || []).forEach(function (a) {
        var info = a.account.data.parsed.info, amt = info.tokenAmount;
        if (amt.decimals === 0 && Number(amt.amount) >= 1 && data.byMint[info.mint] !== undefined) held.push(data.byMint[info.mint]);
      });
      return held.sort(function (x, y) { return x - y; });
    });
  }

  function tile(n, data) {
    var a = document.createElement('a');
    a.className = 'panel holder-bot tilt'; a.href = '/showcase/?bot=' + n + '#finder';
    var scr = document.createElement('span'); scr.className = 'screen';
    if (data.pictured.has(n)) {
      var img = document.createElement('img');
      img.className = 'px'; img.width = 512; img.height = 512; img.loading = 'lazy';
      img.alt = 'Bot #' + n; img.src = data.base + '/' + n + '.png';
      scr.appendChild(img);
    } else scr.classList.add('nosignal');      // in the wallet, but no picture archived — never a wrong Bot
    var lab = document.createElement('span'); lab.className = 'badge'; lab.textContent = '#' + n;
    scr.appendChild(lab); a.appendChild(scr);
    return a;
  }

  function load(owner) {
    if (!ADDR.test(owner)) { say('That wallet address doesn’t look right, so nothing was loaded. Try connecting again.', true); return; }
    el.connect.hidden = true; el.disconnect.hidden = false;
    el.status.textContent = 'Connected'; el.status.classList.add('on'); el.addr.textContent = short(owner); el.addr.title = owner;
    el.pre.hidden = true; el.board.hidden = false; say('');
    el.oil.textContent = el.bots.textContent = el.rate.textContent = '…';
    oilBalance(owner).then(function (b) { el.oil.textContent = fmt(b, 2); })
      .catch(function (e) { el.oil.textContent = '—'; say('Could not load your $OIL balance (' + e.message + ').', true); });
    botData().then(function (data) {
      return heldBots(owner, data).then(function (list) {
        el.bots.textContent = fmt(list.length);
        el.rate.textContent = fmt(list.length * EMISSION_RATE) + ' $OIL';
        el.grid.textContent = '';
        el.empty.hidden = list.length > 0;
        list.forEach(function (n) { el.grid.appendChild(tile(n, data)); });
      });
    }).catch(function (e) { el.bots.textContent = el.rate.textContent = '—'; say('Could not load your Bots (' + e.message + ').', true); });
  }

  function provider() {
    if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  var mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');

  el.connect.addEventListener('click', function () {
    var p = provider();
    if (!p) {
      if (window.PhantomMobile && mobile) {   // no injected wallet (e.g. Chrome on iPhone): Phantom's deeplink
        el.connect.disabled = true; el.connect.textContent = 'Opening Phantom…';
        window.PhantomMobile.connect(location.origin + location.pathname);
        return;
      }
      say('Phantom wallet not found. Install it from phantom.app, then reload this page.', true);
      return;
    }
    el.connect.disabled = true; el.connect.textContent = 'Connecting…';
    p.connect().then(function (r) { load(r.publicKey.toString()); })
      .catch(function () { el.connect.disabled = false; el.connect.textContent = 'Connect wallet'; });
  });
  el.disconnect.addEventListener('click', function () {
    try { if (window.PhantomMobile && window.PhantomMobile.clearSession) window.PhantomMobile.clearSession(); } catch (e) {}
    var p = provider(); if (p && p.disconnect) { try { p.disconnect(); } catch (e) {} }
    location.replace(location.pathname);
  });

  // returning from the Phantom app (mobile deeplink), a same-tab session, or a trusted extension
  var back = new URLSearchParams(location.search).get('phantom_action');
  if (back && window.PhantomMobile) {
    var res = window.PhantomMobile.consumePendingRedirect();
    if (res && res.type === 'connect') load(String(res.publicKey || ''));
    else say((res && res.type === 'error' && typeof res.message === 'string' ? res.message.slice(0, 200) + ' ' : '') +
             'The connection didn’t finish — tap Connect wallet to try again.', true);
  } else if (window.PhantomMobile && window.PhantomMobile.hasSession()) {
    var s = window.PhantomMobile.getSessionPublicKey(); if (s) load(String(s));
  } else if (provider()) {
    provider().connect({ onlyIfTrusted: true }).then(function (r) { load(r.publicKey.toString()); }).catch(function () {});
  }
})();

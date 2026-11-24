/* finnstergram.com/tt — the address our TikTok clips give (Founder 2026-11-24: "Yes to all"). TikTok's in-app browser
   sends no referrer and people TYPE the address, so without this every TikTok visit counted as "direct". This page
   sends the visitor straight into the game from the latest clip, tagged ?from=tt-<game> so the play counter can say
   which clip brought them. CLIPS = the TikTok schedule (Gulf times); add a row when a clip is scheduled. Nothing about
   the visitor is read or stored. The list on the page is the fallback if this does not run. */
(function () {
  'use strict';
  var CLIPS = [                                   // [goes live, Gulf time, game sub]
    ['2026-11-24T04:44', 'botword'], ['2026-11-25T19:00', 'sumbot'], ['2026-11-26T19:00', 'globot'], ['2026-11-27T19:00', 'flagbot']
  ];
  var today = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 16);   // Gulf time, like the post times
  var pick = CLIPS[0][1];
  for (var i = 0; i < CLIPS.length; i++) if (CLIPS[i][0] <= today) pick = CLIPS[i][1];
  var url = 'https://' + pick + '.finnstergram.com/?from=tt-' + pick;
  try { location.replace(url); } catch (e) { var s = document.getElementById('tt-state'); if (s) s.textContent = 'Pick a game below.'; }
})();

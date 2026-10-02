// Microsoft Advertising's UET tag, loaded like js/meta-pixel.js and
// js/x-pixel.js are. UET_TAG_ID (js/products-data.js) is the single switch:
// empty and this does nothing at all, no script loads and no page view is
// sent. It reports page views only; conversions are destination-URL goals
// configured in the Microsoft Advertising account, so nothing in
// js/analytics.js forwards events here.
// Kept as its own file so the privacy policy can point at exactly the one
// responsible for this destination.
(function () {
  // privacy.html's disclosure of this file's own capability, same pattern as
  // js/x-pixel.js: runs before the early return because this is the one file
  // that always knows the true state of UET_TAG_ID.
  if (typeof UET_TAG_ID !== 'undefined' && UET_TAG_ID) {
    var note3 = document.getElementById('uetNote3');
    if (note3) note3.textContent = 'We also run a Microsoft Advertising tag, which ' +
      'sends Microsoft a record of pages viewed so Microsoft can measure and target ' +
      'advertising. See section 4 for what that involves and section 5 for the ' +
      'cookies it sets.';

    var note4 = document.getElementById('uetNote4');
    if (note4) note4.textContent = 'receives the pages you view on this site, so ' +
      'Microsoft can measure and target advertising. This leaves this site and is ' +
      "governed by Microsoft's own privacy statement.";

    var note5 = document.getElementById('uetNote5');
    if (note5) note5.textContent = "Microsoft Advertising's tag sets cookies of its own, " +
      "used to identify your browser to Microsoft. These are governed by Microsoft's " +
      'own privacy statement, not ours.';
  }

  if (typeof UET_TAG_ID === 'undefined' || !UET_TAG_ID) return;

  // Microsoft's own snippet, unminified, with the tag ID read from the one
  // constant instead of typed here.
  /* eslint-disable */
  (function (w, d, t, u, o) {
    w[u] = w[u] || [], o.ts = (new Date).getTime();
    var n = d.createElement(t);
    n.src = 'https://bat.bing.net/bat.js?ti=' + o.ti + ('uetq' != u ? '&q=' + u : ''),
    n.async = 1, n.onload = n.onreadystatechange = function () {
      var s = this.readyState;
      s && 'loaded' !== s && 'complete' !== s || (o.q = w[u], w[u] = new UET(o), w[u].push('pageLoad'),
        n.onload = n.onreadystatechange = null);
    };
    var i = d.getElementsByTagName(t)[0];
    i.parentNode.insertBefore(n, i);
  })(window, document, 'script', 'uetq', { ti: UET_TAG_ID, enableAutoSpaTracking: true });
  /* eslint-enable */
})();

// GoAffPro's loader, on every page like js/meta-pixel.js is. GOAFFPRO_SHOP_ID
// (js/products-data.js) is the single switch: empty and this does nothing at
// all, no script loads, until a real shop ID from the app's setup screen
// replaces it.
//
// The conversion side of GoAffPro's own snippet (window.goaffpro_order plus
// goaffproTrackConversion) is not pasted in statically here or on
// thank-you.html. It needs the order number and the server-verified total,
// and js/thank-you.js already holds both after reading them out of the
// sessionStorage handoff from checkout — see the goaffproTrackConversion call
// there. A static snippet on thank-you.html would only ever have the
// placeholder numbers from GoAffPro's own docs.
(function () {
  if (typeof GOAFFPRO_SHOP_ID === 'undefined' || !GOAFFPRO_SHOP_ID) return;

  var s = document.createElement('script');
  s.src = 'https://api.goaffpro.com/loader.js?shop=' + GOAFFPRO_SHOP_ID;
  document.head.appendChild(s);
})();

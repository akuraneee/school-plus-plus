(function (SPP) {
  'use strict';
  if (window.top !== window || document.getElementById('spp-host')) return;
  if (/\/login/.test(location.pathname)) return;
  SPP.ui.init();
})(globalThis.SPP);

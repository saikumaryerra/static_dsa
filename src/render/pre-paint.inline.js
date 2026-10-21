(function () {
  try {
    var t = localStorage.getItem('theme');
    var dark = t ? t === 'dark'
                 : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) { /* no-JS/blocked storage: CSS media-query fallback applies */ }
})();

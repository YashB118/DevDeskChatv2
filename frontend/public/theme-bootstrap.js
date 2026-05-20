(function () {
  try {
    var key = 'devdesk:theme';
    var stored = localStorage.getItem(key);
    var allowed = ['light', 'dark', 'high-contrast', 'system'];
    var theme = stored && allowed.indexOf(stored) !== -1 ? stored : 'system';
    var resolved =
      theme === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-preference', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-theme-preference', 'system');
  }
})();

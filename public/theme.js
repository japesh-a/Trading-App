// Run in the head to apply the saved preference before the first paint.
(() => {
  const key = 'wicklume-theme';
  const system = matchMedia('(prefers-color-scheme: light)');
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Use the system preference. */ }
  const apply = value => {
    const theme = value === 'light' || value === 'dark' ? value : system.matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f7fb' : '#0b101b');
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
      button.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
      button.setAttribute('aria-pressed', String(theme === 'light'));
    }
    window.dispatchEvent(new Event('wicklume:theme'));
  };
  apply(saved);
  system.addEventListener('change', () => { if (!saved) apply(); });
  window.addEventListener('storage', event => { if (event.key === key) { saved = event.newValue; apply(saved); } });
  document.addEventListener('DOMContentLoaded', () => {
    apply(saved);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      saved = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(key, saved); } catch { /* Keep the preference in this tab. */ }
      apply(saved);
    });
  });
})();

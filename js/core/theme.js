/** الوضع الداكن / الفاتح */
const KEY = 'yusr_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const currentTheme = () => { try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; } };

export function resolvedTheme(mode = currentTheme()) {
  return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
}

export function applyTheme(mode = currentTheme()) {
  try { localStorage.setItem(KEY, mode); } catch {}
  const t = resolvedTheme(mode);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0b1116' : '#f4f6f5');
  document.dispatchEvent(new CustomEvent('yusr:theme', { detail: t }));
}

export function toggleTheme() {
  applyTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
}

media.addEventListener?.('change', () => { if (currentTheme() === 'system') applyTheme('system'); });

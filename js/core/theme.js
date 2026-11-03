/** الوضع الداكن / الفاتح — الافتراضي فاتح، واختيار المستخدم يُحفظ في حسابه (prefs/{uid}/theme) */
const KEY = 'yusr_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const DEFAULT_THEME = 'light';
const MODES = ['light', 'dark', 'system'];
export const currentTheme = () => { try { const t = localStorage.getItem(KEY); return MODES.includes(t) ? t : DEFAULT_THEME; } catch { return DEFAULT_THEME; } };

export function resolvedTheme(mode = currentTheme()) {
  return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
}

export function applyTheme(mode = currentTheme()) {
  if (!MODES.includes(mode)) mode = DEFAULT_THEME;
  try { localStorage.setItem(KEY, mode); } catch {}
  const t = resolvedTheme(mode);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0b1116' : '#f4f6f5');
  document.dispatchEvent(new CustomEvent('yusr:theme', { detail: t }));
}

/** يعيد الوضع الجديد بعد التبديل */
export function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

media.addEventListener?.('change', () => { if (currentTheme() === 'system') applyTheme('system'); });

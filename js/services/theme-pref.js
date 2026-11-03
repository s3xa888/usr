/**
 * ربط المظهر بحساب المستخدم:
 *  - عند الدخول يُطبَّق المظهر المحفوظ في الحساب (أو الفاتح إذا لم يُحدَّد بعد).
 *  - عند تغييره يُحفظ في Firebase مرة واحدة فقط (لا كتابة إذا لم تتغير القيمة).
 */
import { store } from '../core/store.js';
import { applyTheme, currentTheme, toggleTheme, DEFAULT_THEME } from '../core/theme.js';
import { settingsRepo } from './repositories.js';

let off = null;
let lastUid = null;

/** يُستدعى بعد بدء المزامنة: يطبّق مظهر الحساب كلما وصلت تفضيلاته */
export function startThemeSync() {
  stopThemeSync();
  lastUid = store.get('authUser')?.uid || null;
  let first = true;
  off = store.on('prefs', (prefs) => {
    const saved = prefs?.theme || DEFAULT_THEME;
    if (first || saved !== currentTheme()) applyTheme(saved);
    first = false;
  });
}

export function stopThemeSync() { off?.(); off = null; }

function persist(mode) {
  const uid = store.get('authUser')?.uid || lastUid;
  if (!uid) return;
  const saved = store.get('prefs')?.theme || DEFAULT_THEME;
  if (saved === mode) return;
  store.set('prefs', { ...(store.get('prefs') || {}), theme: mode }); // تحديث فوري محلياً
  settingsRepo.saveTheme(uid, mode).catch((err) => console.error('theme save failed', err));
}

export function chooseTheme(mode) { applyTheme(mode); persist(mode); }
export function toggleAndSaveTheme() { const mode = toggleTheme(); persist(mode); return mode; }

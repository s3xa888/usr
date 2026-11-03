/**
 * قناة إشعارات المتصفح/الكمبيوتر (تعمل والمنصة مفتوحة).
 * للإشعارات والمنصة مغلقة استخدم قناة "push" (تحتاج Cloud Functions).
 */
const PREF_KEY = 'yusr_browser_notify';

export const browserChannel = {
  id: 'browser',
  label: 'إشعارات الجهاز',
  supported: () => 'Notification' in window,
  permission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
  enabled() {
    try { return localStorage.getItem(PREF_KEY) === '1' && this.permission() === 'granted'; } catch { return false; }
  },
  async enable() {
    if (!this.supported()) throw new Error('unsupported');
    const res = await Notification.requestPermission();
    if (res !== 'granted') throw new Error('denied');
    try { localStorage.setItem(PREF_KEY, '1'); } catch {}
    return true;
  },
  disable() { try { localStorage.removeItem(PREF_KEY); } catch {} },
  deliver({ title, body, tag, icon, onClick }) {
    if (!this.enabled()) return;
    try {
      const n = new Notification(title, { body, tag, icon: icon || 'assets/logo.svg', lang: 'ar', dir: 'rtl' });
      n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    } catch (err) {
      console.warn('notification failed', err);
    }
  },
};

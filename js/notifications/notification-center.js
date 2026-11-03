/**
 * مركز الإشعارات: يحسب التنبيهات من البيانات الحية، ويوزعها على القنوات المفعّلة.
 *
 *   البيانات → rules.js (ماذا ننبه؟) → notification-center (لمن وأين؟) → channels/* (كيف نرسل؟)
 *
 * القنوات الحالية في المتصفح: داخل المنصة + إشعارات الجهاز.
 * قنوات الخادم (إيميل/واتساب/Push): راجع channels/server.js و functions/.
 */
import { store, centerName } from '../core/store.js';
import { todayISO } from '../utils/dates.js';
import { money } from '../utils/numbers.js';
import { buildAlerts, resolveWindows, alertMessage } from './rules.js';
import { browserChannel } from './channels/browser.js';
import { settingsRepo } from '../services/repositories.js';

const clientChannels = [browserChannel];
let off = null;
let onOpenContract = () => {};

function deliveredToday() {
  try {
    const raw = JSON.parse(localStorage.getItem('yusr_notified') || '{}');
    return raw.date === todayISO() ? raw : { date: todayISO(), keys: [] };
  } catch { return { date: todayISO(), keys: [] }; }
}

function markDelivered(record) {
  try { localStorage.setItem('yusr_notified', JSON.stringify(record)); } catch {}
}

function recompute() {
  const windows = resolveWindows(store.get('generalSettings'));
  const all = buildAlerts(store.get('contracts'), centerName, windows);
  const dismissed = store.get('prefs')?.dismissed || {};
  const visible = all.filter((a) => !dismissed[a.key]);
  store.set('alerts', visible);
  dispatch(visible);
}

/** يرسل التنبيهات العاجلة لقنوات الجهاز مرة واحدة يومياً لكل تنبيه */
function dispatch(alerts) {
  const active = clientChannels.filter((c) => c.enabled());
  if (!active.length) return;
  const record = deliveredToday();
  const fresh = alerts.filter((a) => a.severity !== 'info' && !record.keys.includes(a.key));
  if (!fresh.length) return;

  const brandingLogo = store.get('branding')?.logo;
  if (fresh.length > 3) {
    const total = fresh.reduce((s, a) => s + (a.amount || 0), 0);
    active.forEach((ch) => ch.deliver({ title: `لديك ${fresh.length} تنبيهات تحتاج متابعة`, body: `إجمالي المبالغ: ${money(total)}`, tag: `digest-${todayISO()}`, icon: brandingLogo }));
  } else {
    fresh.forEach((a) => active.forEach((ch) => ch.deliver({
      title: `${a.title} — ${alertMessage(a)}`,
      body: `${a.subtitle}${a.amount ? ` · ${money(a.amount)}` : ''}`,
      tag: a.key,
      icon: brandingLogo,
      onClick: () => onOpenContract(a.contractId),
    })));
  }
  record.keys.push(...fresh.map((a) => a.key));
  markDelivered(record);
}

export const notificationCenter = {
  start({ openContract } = {}) {
    if (openContract) onOpenContract = openContract;
    off?.();
    off = store.on(['contracts', 'centers', 'prefs', 'generalSettings'], () => {
      if (store.get('loaded').contracts) recompute();
    });
    recompute();
  },
  stop() { off?.(); off = null; },
  dismiss(key) {
    const uid = store.get('authUser')?.uid;
    if (uid) return settingsRepo.dismissAlert(uid, key);
  },
  restoreAll() {
    const uid = store.get('authUser')?.uid;
    if (uid) return settingsRepo.clearDismissed(uid);
  },
  channels: clientChannels,
  testDeliver() {
    browserChannel.deliver({ title: 'تجربة الإشعارات ✅', body: 'ستصلك تنبيهات الاستحقاق على هذا الجهاز', tag: 'test' });
  },
};

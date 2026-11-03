/**
 * قنوات الخادم: تُرسل من Cloud Functions يومياً حتى لو المنصة مغلقة.
 * الواجهة هنا تحفظ الإعدادات فقط (من يستلم، ومتى)، أما المفاتيح السرية
 * (كلمة مرور البريد، توكن واتساب) فتبقى في أسرار Firebase ولا تصل للمتصفح أبداً.
 *
 * لإضافة قناة جديدة (مثلاً SMS أو تيليجرام):
 *   1) أضف تعريفها هنا في SERVER_CHANNELS
 *   2) أنشئ ملفها في functions/src/channels/
 *   3) سجّلها في functions/src/channels/index.js
 */
import { APP_CONFIG } from '../../config/app.config.js';
import { firebaseConfig } from '../../config/firebase.config.js';
import { app } from '../../core/firebase.js';
import { loadMessaging } from '../../core/sdk.js';

export const SERVER_CHANNELS = [
  {
    id: 'email',
    label: 'البريد الإلكتروني',
    description: 'رسالة يومية بملخص الدفعات المستحقة والمتأخرة',
    field: { name: 'recipients', label: 'البريد المستلم (افصل بفاصلة)', placeholder: 'finance@company.com, manager@company.com', dir: 'ltr' },
  },
  {
    id: 'whatsapp',
    label: 'واتساب',
    description: 'عبر WhatsApp Business Cloud API (Meta)',
    field: { name: 'recipients', label: 'أرقام المستلمين بالصيغة الدولية', placeholder: '9665XXXXXXXX, 9665YYYYYYYY', dir: 'ltr' },
  },
  {
    id: 'push',
    label: 'إشعارات الجوال والكمبيوتر (Push)',
    description: 'تصل حتى والمنصة مغلقة — فعّلها من كل جهاز على حدة',
    field: null,
  },
];

/** تسجيل هذا الجهاز لاستقبال Push عبر Firebase Cloud Messaging */
export async function registerPushDevice() {
  if (!APP_CONFIG.vapidKey) throw new Error('vapid-missing');
  if (!('serviceWorker' in navigator)) throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId, appId: firebaseConfig.appId,
  });
  const reg = await navigator.serviceWorker.register(`firebase-messaging-sw.js?${params}`);
  const { getMessaging, getToken } = await loadMessaging();
  return getToken(getMessaging(app), { vapidKey: APP_CONFIG.vapidKey, serviceWorkerRegistration: reg });
}

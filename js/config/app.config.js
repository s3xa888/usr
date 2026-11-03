/**
 * إعدادات المنصة العامة — عدّل من هنا بدون الدخول في الكود.
 */
export const APP_CONFIG = {
  appName: 'منصة يُسر',
  tagline: 'إدارة الإيجارات والمراكز التجارية',
  version: '2.0.0',

  /** مسار البيانات الجديد في Realtime Database */
  dbRoot: 'v2',
  /** مسار بيانات النسخة القديمة (v1.x) — للاستيراد فقط */
  legacyRoot: 'yesur_data',

  /**
   * تسجيل الدخول باسم مستخدم: Firebase يحتاج بريداً، فنحوّل "ahmed" إلى "ahmed@yusr.local".
   * يمكن للمستخدم أيضاً الدخول ببريد حقيقي كامل.
   * ⚠️ لا تغيّر هذه القيمة بعد إنشاء الحسابات.
   */
  usernameDomain: 'yusr.local',

  features: {
    /** فعّلها بعد نشر مجلد functions (يتطلب خطة Blaze) — تفتح: تغيير كلمات مرور التابعين، حذف الحسابات نهائياً، الإشعارات عبر الإيميل/واتساب/الجوال */
    cloudFunctions: false,
    /** فعّلها بعد إعداد App Check في Firebase Console */
    appCheck: false,
  },
  /** مفتاح reCAPTCHA v3 الخاص بـ App Check (Site key) */
  appCheckSiteKey: '',
  functionsRegion: 'us-central1',
  /** مفتاح Web Push (VAPID) من: Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates */
  vapidKey: '',

  alerts: {
    /** إظهار تنبيه للدفعة قبل استحقاقها بعدد الأيام */
    windowDays: 60,
    /** الدفعة تُعتبر عاجلة إذا بقي عليها هذا العدد أو أقل */
    urgentDays: 7,
    /** تنبيه بقرب انتهاء العقد قبل عدد الأيام */
    contractEndDays: 90,
  },

  currency: 'ر.س',
  maxDurationYears: 20,

  categories: ['مطعم', 'مقهى', 'نادي رياضي', 'ألعاب', 'ملابس', 'أجهزة إلكترونية', 'جوالات', 'مفروشات وأثاث', 'أخرى'],

  shopStatuses: [
    { id: 'vacant', label: 'غير مؤجر', tone: 'danger' },
    { id: 'leased_closed', label: 'مؤجر ومغلق', tone: 'warning' },
    { id: 'leased_open', label: 'مؤجر ومفتوح', tone: 'success' },
  ],

  paymentTypes: [
    { id: 'annual', label: 'سنوية', hint: 'دفعة كل سنة', perYear: 1 },
    { id: 'semiannual', label: 'نصف سنوية', hint: 'دفعتان في السنة', perYear: 2 },
    { id: 'quarterly', label: 'ربع سنوية', hint: '4 دفعات في السنة', perYear: 4 },
    { id: 'monthly', label: 'شهرية', hint: '12 دفعة في السنة', perYear: 12 },
    { id: 'manual', label: 'يدوية', hint: 'تحدد التواريخ والمبالغ بنفسك', perYear: 0 },
  ],

  roles: [
    { id: 'owner', label: 'المالك' },
    { id: 'admin', label: 'مدير نظام' },
    { id: 'staff', label: 'حساب تابع' },
  ],
};

export const labelOf = (list, id, fallback = '—') => list.find((x) => x.id === id)?.label ?? fallback;

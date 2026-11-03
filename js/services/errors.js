/** ترجمة أخطاء Firebase لرسائل مفهومة */
const MESSAGES = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  'auth/wrong-password': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  'auth/user-not-found': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  'auth/invalid-email': 'اسم المستخدم غير صالح (حروف إنجليزية وأرقام فقط)',
  'auth/too-many-requests': 'محاولات كثيرة. تم إيقاف الدخول مؤقتاً للحماية، حاول بعد قليل',
  'auth/network-request-failed': 'تعذر الاتصال بالإنترنت',
  'auth/email-already-in-use': 'اسم المستخدم مستخدم مسبقاً',
  'auth/weak-password': 'كلمة المرور ضعيفة (8 أحرف على الأقل)',
  'auth/requires-recent-login': 'لأمانك، سجّل الخروج ثم الدخول مرة أخرى وأعد المحاولة',
  'auth/operation-not-allowed': 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Console',
  'auth/user-disabled': 'هذا الحساب موقوف',
  'functions-disabled': 'هذه الميزة تتطلب تفعيل Cloud Functions (راجع docs/NOTIFICATIONS.md)',
  PERMISSION_DENIED: 'ليس لديك صلاحية لتنفيذ هذا الإجراء',
};

export function friendlyError(err) {
  const code = err?.code || err?.message || '';
  for (const key of Object.keys(MESSAGES)) {
    if (String(code).includes(key) || String(err?.message || '').includes(key)) return MESSAGES[key];
  }
  if (String(err?.message || '').toLowerCase().includes('permission')) return MESSAGES.PERMISSION_DENIED;
  console.error(err);
  return 'حدث خطأ غير متوقع، حاول مرة أخرى';
}

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;

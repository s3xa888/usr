/**
 * مخزن الحالة المركزي: كل البيانات الحية من Firebase تمر من هنا،
 * والصفحات تشترك في المفاتيح التي تهمها فقط.
 */
const state = {
  authUser: null,      // مستخدم Firebase Auth
  profile: null,       // سجل المستخدم في v2/users
  centers: [],         // [{id, name, createdAt}]
  contracts: [],       // عقود موحّدة الشكل
  users: [],           // للمدراء فقط
  branding: {},        // { name, logo }
  notifySettings: {},  // إعدادات قنوات الإشعار (للمدراء)
  generalSettings: {}, // إعدادات عامة (فترات التنبيه)
  prefs: {},           // تفضيلات المستخدم (التنبيهات المخفية...)
  alerts: [],          // التنبيهات المحسوبة
  connected: true,
  loaded: { centers: false, contracts: false },
};

const listeners = new Map();

export const store = {
  get: (key) => state[key],
  state,
  set(key, value) {
    state[key] = value;
    (listeners.get(key) || []).forEach((fn) => fn(value));
    (listeners.get('*') || []).forEach((fn) => fn(key, value));
  },
  /** اشتراك بمفتاح واحد أو أكثر؛ يعيد دالة إلغاء الاشتراك */
  on(keys, fn) {
    const arr = Array.isArray(keys) ? keys : [keys];
    arr.forEach((k) => { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); });
    return () => arr.forEach((k) => listeners.get(k)?.delete(fn));
  },
  reset() {
    Object.assign(state, {
      authUser: null, profile: null, centers: [], contracts: [], users: [], prefs: {},
      notifySettings: {}, generalSettings: {}, alerts: [], loaded: { centers: false, contracts: false },
    });
  },
};

/* ===== صلاحيات المستخدم الحالي ===== */
export const can = {
  admin: () => ['owner', 'admin'].includes(state.profile?.role),
  owner: () => state.profile?.role === 'owner',
  add: () => can.admin() || !!state.profile?.permissions?.add,
  pay: () => can.admin() || !!state.profile?.permissions?.pay,
};

export const centerName = (id) => state.centers.find((c) => c.id === id)?.name || 'مركز محذوف';
export const actorName = () => state.profile?.displayName || state.profile?.username || 'مستخدم';

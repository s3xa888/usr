/**
 * عمليات الكتابة على قاعدة البيانات.
 * كل عملية تكتب الجزء المتغير فقط (وليس كامل القاعدة كما في النسخة القديمة)
 * فلا تضيع تعديلات مستخدمين يعملون في نفس الوقت.
 */
import { push, set, update, remove, get } from '../core/sdk.js';
import { dbRef, path, db, withSecondaryAuth, usernameToEmail, callFunction } from '../core/firebase.js';
import { createUserWithEmailAndPassword, ref } from '../core/sdk.js';
import { store, actorName } from '../core/store.js';
import { USERNAME_RE, MIN_PASSWORD } from './errors.js';

/* ============ سجل العمليات ============ */
export function audit(action, details = {}) {
  const user = store.get('authUser');
  if (!user) return;
  push(dbRef('audit'), { uid: user.uid, by: actorName(), action, details, at: Date.now() }).catch(() => {});
}

/* ============ المراكز ============ */
export const centersRepo = {
  async add(name) {
    const clean = name.trim();
    if (!clean) throw new Error('empty');
    if (store.get('centers').some((c) => c.name === clean)) throw { code: 'duplicate' };
    const r = push(dbRef('centers'));
    await set(r, { name: clean, createdAt: Date.now(), order: Date.now() });
    audit('center.add', { name: clean });
    return r.key;
  },
  async rename(id, name) {
    const clean = name.trim();
    if (store.get('centers').some((c) => c.name === clean && c.id !== id)) throw { code: 'duplicate' };
    await update(dbRef('centers', id), { name: clean });
    audit('center.rename', { id, name: clean });
  },
  /** موقع المركز على الخريطة: إحداثيان فقط { lat, lng } — أو null للحذف */
  async setLocation(id, loc) {
    const value = loc ? { lat: Math.round(loc.lat * 1e6) / 1e6, lng: Math.round(loc.lng * 1e6) / 1e6 } : null;
    await set(dbRef('centers', id, 'location'), value);
    audit('center.location', { id });
  },
  /** بيانات الاستثمار: { ownership: 'owned'|'leased', landRent, buildCost, years } */
  async saveInvestment(id, data) {
    await set(dbRef('centers', id, 'investment'), { ...data, updatedAt: Date.now() });
    audit('center.investment', { id });
  },
  async remove(id) {
    if (store.get('contracts').some((c) => c.centerId === id)) throw { code: 'has-contracts' };
    await remove(dbRef('centers', id));
    audit('center.delete', { id });
  },
};

/* ============ العقود ============ */
export const contractsRepo = {
  async create(record) {
    const r = push(dbRef('contracts'));
    await set(r, record);
    audit('contract.add', { id: r.key, brand: record.brandName });
    return r.key;
  },
  async save(id, record) {
    await set(dbRef('contracts', id), record);
    audit('contract.edit', { id, brand: record.brandName });
  },
  async remove(id, brand) {
    await remove(dbRef('contracts', id));
    audit('contract.delete', { id, brand });
  },
  /** تحديث حالة دفعة واحدة فقط (مسموح لمن لديه صلاحية الدفعات) */
  async setInstallment(contractId, index, changes) {
    const base = path('contracts', contractId, 'installments', index);
    const actor = actorName();
    const patch = {};
    if ('paid' in changes) {
      patch[`${base}/paid`] = !!changes.paid;
      patch[`${base}/paidAt`] = changes.paid ? Date.now() : null;
      patch[`${base}/paidBy`] = changes.paid ? actor : null;
      if (!changes.paid) patch[`${base}/lateFlag`] = false;
    }
    if ('lateFlag' in changes) patch[`${base}/lateFlag`] = !!changes.lateFlag;
    patch[path('contracts', contractId, 'updatedBy')] = actor;
    patch[path('contracts', contractId, 'updatedAt')] = Date.now();
    await update(ref(db), patch);
    audit('installment.update', { contractId, index, ...changes });
  },
};

/* ============ المستخدمون ============ */
export const usersRepo = {
  async create({ username, password, displayName, role, permissions }) {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) throw { code: 'auth/invalid-email' };
    if (password.length < MIN_PASSWORD) throw { code: 'auth/weak-password' };
    const uid = await withSecondaryAuth(async (secAuth) => {
      const cred = await createUserWithEmailAndPassword(secAuth, usernameToEmail(u), password);
      return cred.user.uid;
    });
    await set(dbRef('users', uid), {
      username: u,
      displayName: displayName || u,
      role: role === 'admin' ? 'admin' : 'staff',
      active: true,
      permissions: { add: role === 'admin' || !!permissions?.add, pay: role === 'admin' || !!permissions?.pay },
      createdAt: Date.now(),
      createdBy: actorName(),
    });
    audit('user.add', { uid, username: u });
    return uid;
  },
  async update(uid, { displayName, role, permissions, active }) {
    const isAdmin = role === 'admin';
    await update(dbRef('users', uid), {
      displayName,
      role: isAdmin ? 'admin' : 'staff',
      active: !!active,
      permissions: { add: isAdmin || !!permissions?.add, pay: isAdmin || !!permissions?.pay },
      updatedAt: Date.now(),
    });
    audit('user.edit', { uid, role, active });
  },
  /** بدون Cloud Functions: إيقاف الحساب (يُمنع من كل البيانات فوراً). مع Functions: حذف نهائي. */
  async remove(uid) {
    try {
      await callFunction('adminDeleteUser', { uid });
    } catch (err) {
      if (err.message !== 'functions-disabled') throw err;
      await remove(dbRef('users', uid));
    }
    audit('user.delete', { uid });
  },
  async setPassword(uid, password) {
    if (password.length < MIN_PASSWORD) throw { code: 'auth/weak-password' };
    await callFunction('adminSetPassword', { uid, password });
    audit('user.password', { uid });
  },
};

/* ============ الإعدادات والهوية ============ */
export const settingsRepo = {
  saveBranding: (data) => update(dbRef('branding'), { ...data, updatedAt: Date.now() }),
  saveGeneral: (data) => update(dbRef('settings', 'general'), { ...data, updatedAt: Date.now() }),
  saveNotifications: (data) => set(dbRef('settings', 'notifications'), { ...data, updatedAt: Date.now() }),
  /** حفظ المظهر في حساب المستخدم: حقل نصي واحد صغير يُكتب فقط عند التغيير */
  saveTheme: (uid, mode) => set(dbRef('prefs', uid, 'theme'), mode),
  /** تصحيح الإيجار السنوي المخزّن للعقود (يكتب حقل annualRent فقط) */
  fixAnnualRents: (items) => update(ref(db), Object.fromEntries(items.map((x) => [path('contracts', x.id, 'annualRent'), x.annualRent]))),
  dismissAlert: (uid, key) => set(dbRef('prefs', uid, 'dismissed', key), Date.now()),
  clearDismissed: (uid) => remove(dbRef('prefs', uid, 'dismissed')),
  savePushToken: (uid, token) => set(dbRef('pushTokens', uid, token.replace(/[.#$/[\]]/g, '_')), { token, at: Date.now(), ua: navigator.userAgent.slice(0, 120) }),
  readAudit: async () => {
    const snap = await get(dbRef('audit'));
    return Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at).slice(0, 200);
  },
};

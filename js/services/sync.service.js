/**
 * مزامنة حية مع Realtime Database: يستمع للتغييرات ويحدّث المخزن.
 * التغيير من أي جهاز يظهر فوراً في كل الأجهزة.
 */
import { onValue, ref } from '../core/sdk.js';
import { db, dbRef } from '../core/firebase.js';
import { store } from '../core/store.js';
import { normalizeContract } from '../domain/contracts.js';

let unsubs = [];

const listen = (r, cb, onError) => {
  const off = onValue(r, cb, (err) => { console.error('sync error', err); onError?.(err); });
  unsubs.push(off);
};

/** بيانات عامة تظهر قبل تسجيل الدخول (الشعار واسم المنصة) */
export function listenBranding() {
  return onValue(dbRef('branding'), (snap) => store.set('branding', snap.val() || {}), () => {});
}

export function listenProfile(uid, cb) {
  return onValue(dbRef('users', uid), (snap) => cb(snap.val()), () => cb(null));
}

export function startSync({ uid, isAdmin }) {
  stopSync();

  listen(ref(db, '.info/connected'), (snap) => store.set('connected', snap.val() === true));

  listen(dbRef('centers'), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val)
      .map(([id, c]) => ({ id, name: c.name || '', createdAt: c.createdAt || 0, order: c.order ?? c.createdAt ?? 0 }))
      .sort((a, b) => a.order - b.order);
    store.set('loaded', { ...store.get('loaded'), centers: true });
    store.set('centers', list);
  });

  listen(dbRef('contracts'), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, raw]) => normalizeContract(id, raw)).filter(Boolean);
    store.set('loaded', { ...store.get('loaded'), contracts: true });
    store.set('contracts', list);
  });

  listen(dbRef('settings', 'general'), (snap) => store.set('generalSettings', snap.val() || {}));

  listen(dbRef('prefs', uid), (snap) => store.set('prefs', snap.val() || {}));

  if (isAdmin) {
    listen(dbRef('users'), (snap) => {
      const val = snap.val() || {};
      store.set('users', Object.entries(val).map(([id, u]) => ({ id, ...u })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    });
    listen(dbRef('settings', 'notifications'), (snap) => store.set('notifySettings', snap.val() || {}));
  }
}

export function stopSync() {
  unsubs.forEach((off) => off());
  unsubs = [];
}

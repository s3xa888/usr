/**
 * نقطة الاستيراد الوحيدة لمكتبة Firebase في المشروع.
 * لتغيير الإصدار، أو لاستخدام نسخة محلية بدل CDN (مفيد لتطبيق iOS)،
 * عدّل هذا الملف فقط — راجع docs/IOS.md
 */
const V = '10.14.1';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;

const [appMod, authMod, dbMod] = await Promise.all([
  import(`${BASE}/firebase-app.js`),
  import(`${BASE}/firebase-auth.js`),
  import(`${BASE}/firebase-database.js`),
]);

export const { initializeApp, deleteApp } = appMod;

export const {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} = authMod;

export const {
  getDatabase,
  ref,
  onValue,
  get,
  set,
  update,
  push,
  remove,
  serverTimestamp,
  goOffline,
  goOnline,
} = dbMod;

/** تُحمَّل عند الحاجة فقط */
export const loadFunctions = () => import(`${BASE}/firebase-functions.js`);
export const loadAppCheck = () => import(`${BASE}/firebase-app-check.js`);
export const loadMessaging = () => import(`${BASE}/firebase-messaging.js`);

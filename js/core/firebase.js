/**
 * تهيئة Firebase مرة واحدة ومشاركة الاتصال في كل المشروع.
 */
import { firebaseConfig } from '../config/firebase.config.js';
import { APP_CONFIG } from '../config/app.config.js';
import {
  initializeApp, deleteApp, getAuth, setPersistence, browserLocalPersistence,
  getDatabase, ref, onValue, goOffline, goOnline, loadAppCheck, loadFunctions,
} from './sdk.js';

export const app = initializeApp(firebaseConfig);

if (APP_CONFIG.features.appCheck && APP_CONFIG.appCheckSiteKey) {
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await loadAppCheck();
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APP_CONFIG.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.error('App Check init failed', err);
  }
}

export const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getDatabase(app);

/**
 * حارس الاتصال: إذا لم يتصل Realtime Database خلال ثوانٍ (أو انقطع ولم يرجع)،
 * نمسح علامة فشل WebSocket ونعيد الاتصال — حتى لا تعلق المكتبة على طريقة اتصال بديلة لا تعمل.
 */
(() => {
  const FLAG = 'firebase:previous_websocket_failure';
  let timer = null;
  const kick = () => {
    try { localStorage.removeItem(FLAG); } catch {}
    goOffline(db);
    goOnline(db);
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { kick(); arm(); }, 8000); };
  onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() === true) clearTimeout(timer);
    else arm();
  });
  arm();
})();

/** مسار داخل جذر البيانات v2 */
export const path = (...parts) => [APP_CONFIG.dbRoot, ...parts].filter((p) => p !== undefined && p !== '').join('/');
export const dbRef = (...parts) => ref(db, path(...parts));

/** تحويل اسم المستخدم إلى بريد Firebase */
export const usernameToEmail = (username) => {
  const u = String(username || '').trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${APP_CONFIG.usernameDomain}`;
};
export const emailToUsername = (email) => String(email || '').replace(`@${APP_CONFIG.usernameDomain}`, '');

/**
 * إنشاء حساب جديد عبر نسخة ثانوية من التطبيق حتى لا يُسجَّل خروج المدير الحالي.
 */
export async function withSecondaryAuth(fn) {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  try {
    return await fn(getAuth(secondary));
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}

let functionsInstance = null;
export async function callFunction(name, data) {
  if (!APP_CONFIG.features.cloudFunctions) throw new Error('functions-disabled');
  const mod = await loadFunctions();
  functionsInstance ||= mod.getFunctions(app, APP_CONFIG.functionsRegion);
  const res = await mod.httpsCallable(functionsInstance, name)(data);
  return res.data;
}

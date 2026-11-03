/**
 * نقطة البداية: تهيئة المظهر → الاتصال بـ Firebase → التحقق من الدخول → تشغيل الواجهة.
 */
import { applyTheme } from './core/theme.js';
import { store } from './core/store.js';
import { registerPage, startRouter, stopRouter } from './core/router.js';
import { emailToUsername } from './core/firebase.js';
import { onAuth, ownerExists, getOwnerUid, ensureOwnerProfile, isCreatingOwner } from './services/auth.service.js';
import { listenBranding, listenProfile, startSync, stopSync } from './services/sync.service.js';
import { notificationCenter } from './notifications/notification-center.js';
import { mountShell, unmountShell, onPageChange } from './components/shell.js';
import { closeAllModals } from './components/overlay.js';
import { startThemeSync, stopThemeSync } from './services/theme-pref.js';
import { renderLogin, renderSetup, renderBlocked, renderFatal } from './pages/auth.js';
import { openContractDetails } from './pages/contract-details.js';

import dashboard from './pages/dashboard.js';
import contracts from './pages/contracts.js';
import entitlements from './pages/entitlements.js';
import centers from './pages/centers.js';
import reports from './pages/reports.js';
import investment from './pages/investment.js';
import users from './pages/users.js';
import settings from './pages/settings.js';

[dashboard, contracts, entitlements, centers, reports, investment, users, settings].forEach(registerPage);

const authEl = document.getElementById('auth');
const appEl = document.getElementById('app');
const bootEl = document.getElementById('boot');

let started = false;
let profileOff = null;
let lastAccessKey = '';

function show(which) {
  bootEl.hidden = true;
  authEl.hidden = which !== 'auth';
  appEl.hidden = which !== 'app';
}

function applyBranding(b = {}) {
  document.querySelectorAll('.auth-brand img, .side-brand img').forEach((img) => { img.src = b.logo || 'assets/logo.svg'; });
  const icon = document.querySelector('link[rel=icon]');
  if (icon && b.logo) icon.href = b.logo;
  const nameEl = document.querySelector('.auth-brand h1');
  if (nameEl && b.name) nameEl.textContent = b.name;
}

function startApp(profile) {
  show('app');
  mountShell(appEl);
  startThemeSync();
  startSync({ uid: store.get('authUser').uid, isAdmin: ['owner', 'admin'].includes(profile.role) });
  startRouter(appEl.querySelector('#page'), onPageChange);
  notificationCenter.start({ openContract: openContractDetails });
  started = true;
}

function stopApp() {
  if (!started) return;
  closeAllModals();
  notificationCenter.stop();
  stopThemeSync();
  stopRouter();
  stopSync();
  unmountShell();
  started = false;
}

const accessKey = (p) => `${p.role}|${!!p.permissions?.add}|${!!p.permissions?.pay}`;

async function onProfile(user, profile) {
  if (!profile) {
    if (isCreatingOwner()) return; // إنشاء حساب المالك جارٍ — ننتظر اكتماله
    const ownerUid = await getOwnerUid().catch(() => null);
    if (ownerUid === user.uid) { await ensureOwnerProfile(user.uid, emailToUsername(user.email), ''); return; }
    if (!ownerUid) return; // إنشاء حساب المالك جارٍ الآن — ننتظر اكتماله
    stopApp(); show('auth');
    renderBlocked(authEl, 'هذا الحساب غير مفعّل أو تم حذفه. تواصل مع مدير النظام.');
    return;
  }
  if (!profile.active) {
    stopApp(); show('auth');
    renderBlocked(authEl, 'تم إيقاف هذا الحساب من قبل مدير النظام.');
    return;
  }
  store.set('profile', profile);
  const key = accessKey(profile);
  if (!started) { lastAccessKey = key; startApp(profile); return; }
  if (key !== lastAccessKey) {
    // تغيّرت الصلاحيات أثناء الجلسة: نعيد بناء الواجهة بالصلاحيات الجديدة
    lastAccessKey = key;
    stopApp();
    startApp(profile);
  }
}

async function boot() {
  applyTheme();
  window.__yusrReady = true;
  listenBranding();
  store.on('branding', applyBranding);

  onAuth(async (user) => {
    profileOff?.();
    profileOff = null;
    if (!user) {
      stopApp();
      store.reset();
      show('auth');
      try {
        if (await ownerExists()) renderLogin(authEl);
        else renderSetup(authEl);
      } catch (err) {
        console.error(err);
        renderFatal(authEl, 'تعذر الاتصال بقاعدة البيانات', 'تأكد من الإنترنت، ومن نشر قواعد الأمان database.rules.json (راجع README).');
      }
      return;
    }
    store.set('authUser', user);
    profileOff = listenProfile(user.uid, (p) => onProfile(user, p).catch((err) => { console.error(err); renderFatal(authEl, 'تعذر تحميل الحساب', String(err.message || err)); }));
  });
}

boot().catch((err) => {
  console.error(err);
  show('auth');
  renderFatal(authEl, 'تعذر تشغيل المنصة', String(err.message || err));
});

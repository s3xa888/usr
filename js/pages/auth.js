/** شاشات الدخول وإعداد حساب المالك لأول مرة */
import { APP_CONFIG } from '../config/app.config.js';
import { store } from '../core/store.js';
import { html, setHTML, $ } from '../utils/dom.js';
import { login, createOwner, logout } from '../services/auth.service.js';
import { friendlyError, MIN_PASSWORD } from '../services/errors.js';
import { withBusy } from '../components/overlay.js';
import { icon } from '../components/icons.js';
import { passwordField, bindPasswordTools } from './users.js';

const brand = () => {
  const b = store.get('branding') || {};
  return html`
    <div class="auth-brand">
      <img class="brand-logo brand-logo-lg" src="${b.logo || 'assets/logo.svg'}" alt="">
      <h1>${b.name || APP_CONFIG.appName}</h1>
      <p>${APP_CONFIG.tagline}</p>
    </div>`;
};

const shell = (inner) => html`
  <div class="auth-bg"></div>
  <div class="auth-card">${brand()}${inner}</div>
  <p class="auth-foot">${icon('shield', 14)} اتصال آمن ومشفّر · الإصدار ${APP_CONFIG.version}</p>`;

export function renderLogin(el, notice = '') {
  setHTML(el, shell(html`
    ${notice ? html`<div class="auth-notice">${icon('info', 16)} ${notice}</div>` : ''}
    <form class="stack" data-login novalidate>
      <label class="field"><span>اسم المستخدم</span>
        <input class="input" name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="username" required autofocus></label>
      <label class="field"><span>كلمة المرور</span>
        <div class="input-group">
          <input class="input" name="password" type="password" dir="ltr" autocomplete="current-password" required>
          <button type="button" class="icon-btn" data-toggle-pass title="إظهار">${icon('eye', 17)}</button>
        </div></label>
      <p class="form-error" data-err hidden></p>
      <button class="btn btn-primary btn-block btn-lg">تسجيل الدخول</button>
    </form>`));
  bindPasswordTools(el);
  const form = $('[data-login]', el);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-err]', el);
    err.hidden = true;
    if (!form.username.value.trim() || !form.password.value) { err.textContent = 'أدخل اسم المستخدم وكلمة المرور'; err.hidden = false; return; }
    withBusy(form.querySelector('.btn-primary'), async () => {
      try { await login(form.username.value, form.password.value); }
      catch (ex) { err.textContent = friendlyError(ex); err.hidden = false; form.password.select(); }
    });
  });
}

export function renderSetup(el) {
  setHTML(el, shell(html`
    <div class="auth-notice auth-notice-primary">${icon('sparkle', 16)} مرحباً! هذه أول مرة تُشغَّل فيها المنصة. أنشئ حساب المالك (المدير الرئيسي).</div>
    <form class="stack" data-setup novalidate>
      <label class="field"><span>اسمك</span><input class="input" name="displayName" placeholder="مثال: سعد" required autofocus></label>
      <label class="field"><span>اسم المستخدم للدخول</span><input class="input" name="username" dir="ltr" autocapitalize="none" placeholder="admin" required><small class="hint">حروف إنجليزية صغيرة وأرقام</small></label>
      ${passwordField('password', 'كلمة مرور قوية')}
      <p class="form-error" data-err hidden></p>
      <button class="btn btn-primary btn-block btn-lg">إنشاء حساب المالك والبدء</button>
    </form>`));
  bindPasswordTools(el);
  const form = $('[data-setup]', el);
  form.username.addEventListener('input', () => { form.username.value = form.username.value.toLowerCase().replace(/\s/g, ''); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-err]', el);
    err.hidden = true;
    if (form.password.value.length < MIN_PASSWORD) { err.textContent = `كلمة المرور ${MIN_PASSWORD} أحرف على الأقل`; err.hidden = false; return; }
    withBusy(form.querySelector('.btn-primary'), async () => {
      try { await createOwner({ username: form.username.value, password: form.password.value, displayName: form.displayName.value.trim() }); }
      catch (ex) { err.textContent = friendlyError(ex); err.hidden = false; }
    });
  });
}

export function renderBlocked(el, message) {
  setHTML(el, shell(html`
    <div class="auth-notice auth-notice-danger">${icon('lock', 16)} ${message}</div>
    <button class="btn btn-ghost btn-block" data-out>${icon('logout', 18)} تسجيل الخروج</button>`));
  $('[data-out]', el).addEventListener('click', () => logout());
}

export function renderFatal(el, title, detail) {
  setHTML(el, shell(html`<div class="auth-notice auth-notice-danger">${icon('alert', 16)} <div><strong>${title}</strong><br><small>${detail}</small></div></div>
    <button class="btn btn-ghost btn-block" data-reload>${icon('refresh', 18)} إعادة المحاولة</button>`));
  $('[data-reload]', el).addEventListener('click', () => location.reload());
}

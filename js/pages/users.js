/** إدارة الحسابات التابعة والصلاحيات (للمدراء) */
import { APP_CONFIG, labelOf } from '../config/app.config.js';
import { store, can } from '../core/store.js';
import { html, setHTML, on, $, formValues } from '../utils/dom.js';
import { formatTimestamp } from '../utils/dates.js';
import { usersRepo } from '../services/repositories.js';
import { friendlyError, USERNAME_RE, MIN_PASSWORD } from '../services/errors.js';
import { pageHeader, emptyState, badge } from '../components/ui.js';
import { openModal, confirmDialog, toast, withBusy, showFieldErrors } from '../components/overlay.js';
import { icon } from '../components/icons.js';

let root;

export function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export const passwordField = (name = 'password', label = 'كلمة المرور', value = '') => html`
  <label class="field"><span>${label}</span>
    <div class="input-group">
      <input class="input num" name="${name}" type="password" dir="ltr" autocomplete="new-password" minlength="${MIN_PASSWORD}" value="${value}" required>
      <button type="button" class="icon-btn" data-toggle-pass title="إظهار">${icon('eye', 17)}</button>
      <button type="button" class="icon-btn" data-gen-pass title="توليد كلمة مرور قوية">${icon('refresh', 17)}</button>
    </div>
    <small class="hint">${MIN_PASSWORD} أحرف على الأقل — لن تُحفظ أو تُعرض مرة أخرى، انسخها وسلّمها للمستخدم</small>
  </label>`;

export function bindPasswordTools(el) {
  on(el, 'click', '[data-toggle-pass]', (e, b) => {
    const input = b.parentElement.querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
    setHTML(b, icon(input.type === 'password' ? 'eye' : 'eyeOff', 17));
  });
  on(el, 'click', '[data-gen-pass]', (e, b) => {
    const input = b.parentElement.querySelector('input');
    input.value = generatePassword();
    input.type = 'text';
  });
}

const permsBlock = (u = {}) => html`
  <div class="field"><span>نوع الحساب</span>
    <div class="segmented">
      <label class="seg"><input type="radio" name="role" value="staff" ${u.role !== 'admin' ? 'checked' : ''}><span>حساب تابع</span></label>
      <label class="seg"><input type="radio" name="role" value="admin" ${u.role === 'admin' ? 'checked' : ''}><span>مدير نظام (كامل الصلاحيات)</span></label>
    </div>
  </div>
  <div class="perm-list" data-perms ${u.role === 'admin' ? 'hidden' : ''}>
    <label class="perm"><span class="switch"><input type="checkbox" name="permAdd" ${u.permissions?.add ? 'checked' : ''}><i></i></span><span><strong>إضافة عقود جديدة</strong><small>بدون تعديل أو حذف العقود الموجودة</small></span></label>
    <label class="perm"><span class="switch"><input type="checkbox" name="permPay" ${u.permissions?.pay ? 'checked' : ''}><i></i></span><span><strong>تسجيل السداد والتعثر</strong><small>تغيير حالة الدفعات فقط</small></span></label>
    <p class="hint">${icon('info', 14)} جميع الحسابات تستطيع الاطلاع على البيانات والتقارير.</p>
  </div>`;

const bindRoleToggle = (el) => on(el, 'change', 'input[name=role]', (e, input) => { el.querySelector('[data-perms]').hidden = input.value === 'admin'; });

function openCreate() {
  openModal({
    title: 'إضافة مستخدم',
    subtitle: 'أنشئ حساباً لموظف وحدد صلاحياته',
    body: html`<form class="stack" novalidate>
      <div class="grid-2">
        <label class="field"><span>الاسم الظاهر</span><input class="input" name="displayName" placeholder="مثال: محمد المحاسب" required></label>
        <label class="field"><span>اسم المستخدم (للدخول)</span><input class="input" name="username" dir="ltr" placeholder="accountant1" autocomplete="off" required><small class="hint">حروف إنجليزية صغيرة وأرقام فقط</small></label>
      </div>
      ${passwordField()}
      ${permsBlock()}
    </form>`,
    footer: html`<button class="btn btn-primary" data-save>${icon('check', 18)} إنشاء الحساب</button><button class="btn btn-ghost" data-close>إلغاء</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      bindPasswordTools(el); bindRoleToggle(el);
      form.username.addEventListener('input', () => { form.username.value = form.username.value.toLowerCase().replace(/\s/g, ''); });
      el.querySelector('[data-save]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const v = formValues(form);
        const errors = {};
        if (!v.displayName) errors.displayName = 'أدخل الاسم';
        if (!USERNAME_RE.test(v.username)) errors.username = 'من 3 إلى 32 حرفاً إنجليزياً أو رقماً';
        if (store.get('users').some((u) => u.username === v.username)) errors.username = 'اسم المستخدم مستخدم مسبقاً';
        if ((v.password || '').length < MIN_PASSWORD) errors.password = `${MIN_PASSWORD} أحرف على الأقل`;
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        try {
          await usersRepo.create({ username: v.username, password: v.password, displayName: v.displayName, role: v.role, permissions: { add: v.permAdd, pay: v.permPay } });
          toast(`تم إنشاء حساب ${v.displayName}`);
          close();
        } catch (err) { toast(friendlyError(err), 'danger'); }
      }));
    },
  });
}

function openEdit(u) {
  const fn = APP_CONFIG.features.cloudFunctions;
  openModal({
    title: 'تعديل المستخدم',
    subtitle: `@${u.username}`,
    body: html`<form class="stack" novalidate>
      <label class="field"><span>الاسم الظاهر</span><input class="input" name="displayName" value="${u.displayName || u.username}" required></label>
      ${permsBlock(u)}
      <label class="perm perm-danger"><span class="switch"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><i></i></span><span><strong>الحساب نشط</strong><small>إيقافه يمنع الدخول وقراءة أي بيانات فوراً</small></span></label>
      <hr class="sep">
      ${fn ? html`<div class="stack-sm"><strong>${icon('key', 16)} تغيير كلمة المرور</strong>${passwordField('newPassword', 'كلمة مرور جديدة (اتركها فارغة إن لم ترد تغييرها)')}</div>`
        : html`<p class="hint">${icon('lock', 14)} لا يمكن الاطلاع على كلمات المرور (محمية ومشفرة). لتغيير كلمة مرور موظف فعّل Cloud Functions، أو أوقف حسابه وأنشئ حساباً جديداً.</p>`}
    </form>`,
    footer: html`<button class="btn btn-primary" data-save>${icon('check', 18)} حفظ</button><button class="btn btn-ghost" data-close>إلغاء</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      bindPasswordTools(el); bindRoleToggle(el);
      if (fn) form.newPassword.required = false;
      el.querySelector('[data-save]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const v = formValues(form);
        try {
          await usersRepo.update(u.id, { displayName: v.displayName || u.username, role: v.role, permissions: { add: v.permAdd, pay: v.permPay }, active: v.active });
          if (fn && v.newPassword) await usersRepo.setPassword(u.id, v.newPassword);
          toast('تم حفظ التعديلات');
          close();
        } catch (err) { toast(friendlyError(err), 'danger'); }
      }));
    },
  });
}

function render() {
  const box = $('[data-list]', root);
  const users = store.get('users');
  const me = store.get('authUser')?.uid;
  if (!users.length) { setHTML(box, emptyState({ ic: 'users', title: 'لا يوجد مستخدمون' })); return; }
  setHTML(box, html`<div class="table-wrap"><table class="table table-cards">
    <thead><tr><th>المستخدم</th><th>النوع</th><th>الصلاحيات</th><th>الحالة</th><th>أُنشئ</th><th></th></tr></thead>
    <tbody>${users.map((u) => {
      const locked = u.role === 'owner' || u.id === me;
      const tone = u.role === 'owner' ? 'accent' : u.role === 'admin' ? 'info' : 'neutral';
      return html`<tr>
        <td data-label="المستخدم" class="cell-main"><div class="user-cell"><span class="avatar">${(u.displayName || u.username || '?').slice(0, 1)}</span><span><strong>${u.displayName || u.username}</strong><small class="muted block" dir="ltr">@${u.username}</small></span></div></td>
        <td data-label="النوع">${badge(labelOf(APP_CONFIG.roles, u.role), tone)}</td>
        <td data-label="الصلاحيات">${['owner', 'admin'].includes(u.role) ? html`<span class="muted small">كامل الصلاحيات</span>` : html`
          <span class="chip ${u.permissions?.add ? 'chip-success' : 'chip-neutral'}">${u.permissions?.add ? '✓' : '✕'} إضافة عقود</span>
          <span class="chip ${u.permissions?.pay ? 'chip-success' : 'chip-neutral'}">${u.permissions?.pay ? '✓' : '✕'} الدفعات</span>`}</td>
        <td data-label="الحالة">${u.active ? badge('نشط', 'success') : badge('موقوف', 'danger')}</td>
        <td data-label="أُنشئ" class="num small muted">${formatTimestamp(u.createdAt)}</td>
        <td class="cell-actions">${locked ? html`<span class="muted small">${icon('lock', 14)} ${u.id === me ? 'حسابك' : 'محمي'}</span>` : html`
          <button class="icon-btn" data-edit="${u.id}" title="تعديل">${icon('edit', 17)}</button>
          <button class="icon-btn text-danger" data-delete="${u.id}" title="حذف">${icon('trash', 17)}</button>`}</td>
      </tr>`;
    })}</tbody></table></div>`);
}

export default {
  id: 'users',
  title: 'المستخدمون',
  icon: 'users',
  nav: true,
  guard: () => can.admin(),
  deps: ['users'],
  mount(el) {
    root = el;
    setHTML(el, html`
      ${pageHeader({
        title: 'المستخدمون والصلاحيات',
        subtitle: 'أنشئ حسابات لفريقك وحدد ما يستطيع كل شخص فعله',
        actions: html`<button class="btn btn-primary" data-new>${icon('plus', 18)} مستخدم جديد</button>`,
      })}
      <section class="card card-flush" data-list></section>`);
    render();
    on(el, 'click', '[data-new]', openCreate);
    on(el, 'click', '[data-edit]', (e, b) => openEdit(store.get('users').find((u) => u.id === b.dataset.edit)));
    on(el, 'click', '[data-delete]', async (e, b) => {
      const u = store.get('users').find((x) => x.id === b.dataset.delete);
      if (await confirmDialog({ title: 'حذف المستخدم', message: `سيتم حذف حساب "${u.displayName || u.username}" ومنعه من الدخول نهائياً.`, confirmText: 'حذف', danger: true })) {
        try { await usersRepo.remove(u.id); toast('تم حذف المستخدم'); } catch (err) { toast(friendlyError(err), 'danger'); }
      }
    });
  },
  update: render,
};

/** الإعدادات: الهوية والشعار، الإشعارات، الحساب، البيانات، سجل العمليات */
import { APP_CONFIG } from '../config/app.config.js';
import { store, can } from '../core/store.js';
import { callFunction } from '../core/firebase.js';
import { html, setHTML, on, $, formValues } from '../utils/dom.js';
import { formatTimestamp } from '../utils/dates.js';
import { money } from '../utils/numbers.js';
import { customCategories, CUSTOM_GROUP } from '../components/categories.js';
import { settingsRepo } from '../services/repositories.js';
import { changeOwnPassword, logout } from '../services/auth.service.js';
import { readLegacy, importLegacy, deleteLegacy } from '../services/migration.service.js';
import { exportContractsCSV } from '../services/export.service.js';
import { friendlyError } from '../services/errors.js';
import { notificationCenter } from '../notifications/notification-center.js';
import { browserChannel } from '../notifications/channels/browser.js';
import { SERVER_CHANNELS, registerPushDevice } from '../notifications/channels/server.js';
import { resolveWindows } from '../notifications/rules.js';
import { pageHeader, emptyState, badge } from '../components/ui.js';
import { toast, withBusy, confirmDialog } from '../components/overlay.js';
import { icon } from '../components/icons.js';
import { navigate } from '../core/router.js';
import { currentTheme } from '../core/theme.js';
import { chooseTheme } from '../services/theme-pref.js';
import { passwordField, bindPasswordTools } from './users.js';

const TABS = [
  { id: 'brand', label: 'هوية المنصة', ic: 'palette', guard: () => can.admin() },
  { id: 'notify', label: 'الإشعارات', ic: 'bell' },
  { id: 'categories', label: 'التصنيفات', ic: 'grid', guard: () => can.admin() },
  { id: 'account', label: 'حسابي', ic: 'user' },
  { id: 'data', label: 'البيانات', ic: 'database', guard: () => can.owner() },
  { id: 'audit', label: 'سجل العمليات', ic: 'history', guard: () => can.admin() },
];

let root;
let tab = 'notify';

/* ---------------- الهوية والشعار ---------------- */
function resizeImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) return reject(new Error('type'));
    if (file.size > 5 * 1024 * 1024) return reject(new Error('size'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
      const w = Math.round((img.width || max) * scale);
      const h = Math.round((img.height || max) * scale);
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('type')); };
    img.src = url;
  });
}

function brandTab(el) {
  const b = store.get('branding') || {};
  setHTML(el, html`
    <section class="card">
      <header class="card-head"><h2>${icon('image', 18)} شعار المنصة</h2></header>
      <div class="logo-editor">
        <div class="logo-preview" data-preview>${b.logo ? html`<img src="${b.logo}" alt="الشعار">` : html`<img src="assets/logo.svg" alt="الشعار الافتراضي">`}</div>
        <div class="stack-sm">
          <p class="muted">يظهر الشعار في شاشة الدخول، القائمة الجانبية، التقارير المطبوعة، والإشعارات. يفضل صورة مربعة PNG بخلفية شفافة.</p>
          <div class="row">
            <label class="btn btn-primary">${icon('upload', 18)} رفع شعار<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-file hidden></label>
            ${b.logo ? html`<button class="btn btn-ghost text-danger" data-remove-logo>${icon('trash', 18)} إزالة</button>` : ''}
          </div>
          <small class="hint">بديل: ضع ملف شعارك باسم <code>logo.svg</code> داخل مجلد <code>public/assets</code></small>
        </div>
      </div>
    </section>
    <form class="card stack" data-brand-form>
      <header class="card-head"><h2>${icon('sparkle', 18)} اسم المنصة</h2></header>
      <label class="field"><span>الاسم الظاهر في المنصة والتقارير</span><input class="input" name="name" maxlength="80" value="${b.name || APP_CONFIG.appName}"></label>
      <div><button class="btn btn-primary">حفظ</button></div>
    </form>`);

  $('[data-file]', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      await settingsRepo.saveBranding({ logo: dataUrl });
      toast('تم تحديث الشعار');
      brandTab(el);
    } catch (err) {
      toast(err.message === 'size' ? 'حجم الصورة أكبر من 5MB' : err.message === 'type' ? 'صيغة الصورة غير مدعومة' : friendlyError(err), 'danger');
    }
  });
  on(el, 'click', '[data-remove-logo]', async () => { await settingsRepo.saveBranding({ logo: null }); toast('تمت إزالة الشعار'); brandTab(el); });
  $('[data-brand-form]', el).addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(e.currentTarget.querySelector('button'), async () => {
      try { await settingsRepo.saveBranding({ name: e.currentTarget.name.value.trim() || APP_CONFIG.appName }); toast('تم الحفظ'); }
      catch (err) { toast(friendlyError(err), 'danger'); }
    });
  });
}

/* ---------------- الإشعارات ---------------- */
function notifyTab(el) {
  const perm = browserChannel.permission();
  const enabled = browserChannel.enabled();
  const w = resolveWindows(store.get('generalSettings'));
  const ns = store.get('notifySettings') || {};
  const fnOn = APP_CONFIG.features.cloudFunctions;
  const dismissedCount = Object.keys(store.get('prefs')?.dismissed || {}).length;

  setHTML(el, html`
    <section class="card">
      <header class="card-head"><h2>${icon('smartphone', 18)} إشعارات هذا الجهاز</h2>
        ${enabled ? badge('مفعّلة', 'success') : perm === 'denied' ? badge('محظورة من المتصفح', 'danger') : badge('غير مفعّلة', 'neutral')}</header>
      <p class="muted">تنبيه منبثق على الكمبيوتر أو الجوال عند وجود دفعات عاجلة أو متأخرة (مرة يومياً لكل تنبيه، والمنصة مفتوحة).</p>
      ${!browserChannel.supported() ? html`<p class="hint">${icon('info', 14)} هذا المتصفح لا يدعم الإشعارات. على iPhone: أضف المنصة للشاشة الرئيسية أولاً (مشاركة ← إضافة إلى الشاشة الرئيسية).</p>` : html`
        <div class="row">
          ${enabled ? html`<button class="btn btn-ghost" data-browser-off>إيقاف</button><button class="btn btn-subtle" data-browser-test>${icon('bell', 16)} إرسال تجربة</button>`
            : html`<button class="btn btn-primary" data-browser-on>${icon('bell', 16)} تفعيل الإشعارات</button>`}
        </div>`}
      ${dismissedCount ? html`<div class="row top-gap"><span class="muted small">لديك ${dismissedCount} تنبيه مخفي</span><button class="btn btn-ghost btn-sm" data-restore>إظهار التنبيهات المخفية</button></div>` : ''}
    </section>

    ${can.admin() ? html`
      <form class="card stack" data-windows>
        <header class="card-head"><h2>${icon('clock', 18)} توقيت التنبيهات</h2></header>
        <div class="grid-3">
          <label class="field"><span>نبّه عن الدفعة قبل (يوم)</span><input class="input num" type="number" min="1" max="365" name="windowDays" value="${w.windowDays}"></label>
          <label class="field"><span>تعتبر عاجلة قبل (يوم)</span><input class="input num" type="number" min="0" max="90" name="urgentDays" value="${w.urgentDays}"></label>
          <label class="field"><span>نبّه عن انتهاء العقد قبل (يوم)</span><input class="input num" type="number" min="0" max="365" name="contractEndDays" value="${w.contractEndDays}"></label>
        </div>
        <div><button class="btn btn-primary">حفظ</button></div>
      </form>

      <form class="card stack" data-channels>
        <header class="card-head"><h2>${icon('mail', 18)} الإرسال التلقائي اليومي</h2>${fnOn ? badge('الخادم مفعّل', 'success') : badge('يتطلب Cloud Functions', 'warning')}</header>
        <p class="muted">يرسل الخادم كل يوم الساعة 8 صباحاً (بتوقيت الرياض) ملخص الاستحقاقات حتى لو لم يفتح أحد المنصة.
          ${fnOn ? '' : html`<br><span class="hint">${icon('info', 14)} الإعدادات تُحفظ الآن وتبدأ بالعمل فور تفعيل Cloud Functions — راجع <code>docs/NOTIFICATIONS.md</code></span>`}</p>
        ${SERVER_CHANNELS.map((ch) => html`
          <div class="channel">
            <label class="perm"><span class="switch"><input type="checkbox" name="${ch.id}.enabled" ${ns[ch.id]?.enabled ? 'checked' : ''}><i></i></span>
              <span><strong>${ch.label}</strong><small>${ch.description}</small></span></label>
            ${ch.field ? html`<label class="field"><span>${ch.field.label}</span><input class="input" name="${ch.id}.${ch.field.name}" dir="${ch.field.dir}" placeholder="${ch.field.placeholder}" value="${ns[ch.id]?.[ch.field.name] || ''}"></label>` : ''}
            ${ch.id === 'whatsapp' ? html`<label class="field"><span>اسم قالب الرسالة المعتمد في Meta</span><input class="input" name="whatsapp.template" dir="ltr" value="${ns.whatsapp?.template || 'yusr_daily_digest'}"></label>` : ''}
            ${ch.id === 'push' ? html`<div class="row"><button type="button" class="btn btn-subtle btn-sm" data-push-register>${icon('smartphone', 16)} تسجيل هذا الجهاز</button></div>` : ''}
            ${fnOn ? html`<div class="row"><button type="button" class="btn btn-ghost btn-sm" data-server-test="${ch.id}">إرسال تجربة الآن</button></div>` : ''}
          </div>`)}
        <label class="perm"><span class="switch"><input type="checkbox" name="includeInfo" ${ns.includeInfo ? 'checked' : ''}><i></i></span>
          <span><strong>تضمين التنبيهات البعيدة</strong><small>افتراضياً يُرسل المتأخر والعاجل فقط</small></span></label>
        <div><button class="btn btn-primary">حفظ إعدادات الإرسال</button></div>
      </form>` : ''}`);

  on(el, 'click', '[data-browser-on]', async () => {
    try { await browserChannel.enable(); toast('تم تفعيل الإشعارات'); notificationCenter.testDeliver(); notifyTab(el); }
    catch (err) { toast(err.message === 'denied' ? 'رفضت الإذن. فعّله من إعدادات المتصفح' : 'الإشعارات غير مدعومة هنا', 'warning'); notifyTab(el); }
  });
  on(el, 'click', '[data-browser-off]', () => { browserChannel.disable(); notifyTab(el); });
  on(el, 'click', '[data-browser-test]', () => notificationCenter.testDeliver());
  on(el, 'click', '[data-restore]', async () => { await notificationCenter.restoreAll(); toast('تمت إعادة إظهار التنبيهات'); });
  on(el, 'click', '[data-push-register]', async (e, b) => withBusy(b, async () => {
    try {
      const token = await registerPushDevice();
      await settingsRepo.savePushToken(store.get('authUser').uid, token);
      toast('تم تسجيل الجهاز لاستقبال الإشعارات');
    } catch (err) {
      toast(err.message === 'vapid-missing' ? 'أضف مفتاح vapidKey في app.config.js أولاً' : err.message === 'denied' ? 'لم يتم منح الإذن' : friendlyError(err), 'warning');
    }
  }));
  on(el, 'click', '[data-server-test]', (e, b) => withBusy(b, async () => {
    try { const r = await callFunction('sendTestNotification', { channel: b.dataset.serverTest }); toast(r?.results?.[b.dataset.serverTest]?.error ? `فشل: ${r.results[b.dataset.serverTest].error}` : 'تم الإرسال — تحقق من الوصول', r?.results?.[b.dataset.serverTest]?.error ? 'danger' : 'success'); }
    catch (err) { toast(friendlyError(err), 'danger'); }
  }));

  $('[data-windows]', el)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    withBusy(e.currentTarget.querySelector('button'), async () => {
      try { await settingsRepo.saveGeneral({ windowDays: +v.windowDays || 60, urgentDays: +v.urgentDays || 0, contractEndDays: +v.contractEndDays || 0 }); toast('تم الحفظ'); }
      catch (err) { toast(friendlyError(err), 'danger'); }
    });
  });
  $('[data-channels]', el)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    const out = { includeInfo: !!v.includeInfo };
    Object.entries(v).forEach(([k, val]) => {
      if (!k.includes('.')) return;
      const [ch, field] = k.split('.');
      (out[ch] ||= {})[field] = val;
    });
    withBusy(e.currentTarget.querySelector('button[type=submit], button:not([type])'), async () => {
      try { await settingsRepo.saveNotifications(out); toast('تم حفظ إعدادات الإرسال'); }
      catch (err) { toast(friendlyError(err), 'danger'); }
    });
  });
}

/* ---------------- الحساب ---------------- */
function accountTab(el) {
  const p = store.get('profile') || {};
  setHTML(el, html`
    <section class="card">
      <div class="profile-row">
        <span class="avatar avatar-lg">${(p.displayName || p.username || '?').slice(0, 1)}</span>
        <div><h2>${p.displayName || p.username}</h2><span class="muted" dir="ltr">@${p.username}</span></div>
        ${badge(p.role === 'owner' ? 'المالك' : p.role === 'admin' ? 'مدير نظام' : 'حساب تابع', 'info')}
      </div>
    </section>
    <form class="card stack" data-pass>
      <header class="card-head"><h2>${icon('key', 18)} تغيير كلمة المرور</h2></header>
      <label class="field"><span>كلمة المرور الحالية</span><input class="input" type="password" name="current" dir="ltr" autocomplete="current-password" required></label>
      ${passwordField('next', 'كلمة المرور الجديدة')}
      <div><button class="btn btn-primary">تغيير كلمة المرور</button></div>
    </form>
    <section class="card">
      <header class="card-head"><h2>${icon('palette', 18)} المظهر</h2></header>
      <div class="segmented">
        ${[['light', 'فاتح'], ['dark', 'داكن'], ['system', 'حسب الجهاز']].map(([id, l]) => html`<label class="seg"><input type="radio" name="theme" value="${id}" ${currentTheme() === id ? 'checked' : ''}><span>${l}</span></label>`)}
      </div>
    </section>
    <section class="card"><button class="btn btn-ghost text-danger" data-logout>${icon('logout', 18)} تسجيل الخروج</button>
      <p class="muted small top-gap">الإصدار ${APP_CONFIG.version}</p></section>`);

  bindPasswordTools(el);
  on(el, 'change', 'input[name=theme]', (e, i) => chooseTheme(i.value));
  on(el, 'click', '[data-logout]', () => logout());
  $('[data-pass]', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    withBusy(form.querySelector('button:not([type=button])'), async () => {
      try { await changeOwnPassword(form.current.value, form.next.value); form.reset(); toast('تم تغيير كلمة المرور'); }
      catch (err) { toast(friendlyError(err), 'danger'); }
    });
  });
}

/* ---------------- البيانات والاستيراد ---------------- */
function dataTab(el) {
  setHTML(el, html`
    <section class="card stack">
      <header class="card-head"><h2>${icon('refresh', 18)} استيراد بيانات النسخة القديمة (v1.x)</h2></header>
      <p class="muted">ينقل المراكز والعقود وحالات الدفعات من النسخة السابقة إلى البنية الجديدة الآمنة. <strong>لا تُنقل كلمات المرور القديمة</strong> لأنها كانت محفوظة بشكل مكشوف — أنشئ حسابات الموظفين من جديد.</p>
      <div data-legacy><button class="btn btn-primary" data-scan>${icon('search', 18)} فحص البيانات القديمة</button></div>
    </section>
    <section class="card stack">
      <header class="card-head"><h2>${icon('download', 18)} نسخة احتياطية</h2></header>
      <p class="muted">تصدير كل العقود إلى ملف Excel. للنسخ الاحتياطي الكامل: Firebase Console ← Realtime Database ← ⋮ ← Export JSON.</p>
      <div><button class="btn btn-subtle" data-export>${icon('download', 18)} تصدير كل العقود</button></div>
    </section>
    <section class="card stack">
      <header class="card-head"><h2>${icon('wallet', 18)} إعادة حساب الإيجار السنوي للعقود</h2></header>
      <p class="muted">الإيجار السنوي يُحسب الآن من <strong>مجموع دفعات العقد ÷ مدة العقد الفعلية</strong> (من تاريخ البداية حتى تاريخ النهاية). المنصة تعرض القيمة الصحيحة تلقائياً، وهذه الأداة تحفظ القيمة المصححة في قاعدة البيانات أيضاً. لا يتغير أي شيء آخر في العقود (الدفعات، حالات السداد، التواريخ).</p>
      <div data-rent-fix></div>
    </section>`);

  const fixBox = $('[data-rent-fix]', el);
  const renderFix = () => {
    const diffs = store.get('contracts').filter((c) => c.installments.length && Math.abs(c.annualRent - c.storedAnnualRent) >= 0.01);
    if (!diffs.length) { setHTML(fixBox, html`<p class="hint">${icon('check', 14)} كل العقود محفوظة بالإيجار السنوي الصحيح.</p>`); return; }
    setHTML(fixBox, html`
      <div class="table-wrap"><table class="table table-compact">
        <thead><tr><th>النشاط</th><th>المحل</th><th>المحفوظ</th><th>الصحيح</th></tr></thead>
        <tbody>${diffs.slice(0, 50).map((c) => html`<tr><td>${c.brandName}</td><td class="num">${c.shopNumber}</td><td class="num muted">${money(c.storedAnnualRent)}</td><td class="num"><strong>${money(c.annualRent)}</strong></td></tr>`)}</tbody>
      </table></div>
      ${diffs.length > 50 ? html`<p class="hint">و ${diffs.length - 50} عقد آخر…</p>` : ''}
      <div><button class="btn btn-primary" data-fix-rent>${icon('check', 18)} حفظ القيم الصحيحة (${diffs.length} عقد)</button></div>`);
  };
  renderFix();
  on(fixBox, 'click', '[data-fix-rent]', (ev, btn) => withBusy(btn, async () => {
    const diffs = store.get('contracts').filter((c) => c.installments.length && Math.abs(c.annualRent - c.storedAnnualRent) >= 0.01);
    if (!(await confirmDialog({ title: 'إعادة حساب الإيجار السنوي', message: `سيتم تحديث حقل الإيجار السنوي فقط في ${diffs.length} عقد. تأكد أنك أخذت نسخة احتياطية. متابعة؟`, confirmText: 'متابعة' }))) return;
    try {
      for (let i = 0; i < diffs.length; i += 200) await settingsRepo.fixAnnualRents(diffs.slice(i, i + 200).map((c) => ({ id: c.id, annualRent: c.annualRent })));
      toast(`تم تحديث ${diffs.length} عقد`);
      setTimeout(renderFix, 400);
    } catch (err) { toast(friendlyError(err), 'danger'); }
  }));

  const box = $('[data-legacy]', el);
  on(el, 'click', '[data-export]', () => exportContractsCSV(store.get('contracts'), 'نسخة_احتياطية'));
  on(el, 'click', '[data-scan]', (e, b) => withBusy(b, async () => {
    try {
      const legacy = await readLegacy();
      if (!legacy) { setHTML(box, html`<p class="hint">${icon('check', 14)} لا توجد بيانات قديمة (تم استيرادها وحذفها، أو لم تكن موجودة).</p>`); return; }
      setHTML(box, html`
        <div class="legacy-summary">
          <div><strong class="num">${legacy.centers.length}</strong><span>مركز</span></div>
          <div><strong class="num">${legacy.rentals.length}</strong><span>عقد</span></div>
          <div><strong class="num">${legacy.usernames.length}</strong><span>حساب قديم</span></div>
        </div>
        ${legacy.usernames.length ? html`<p class="hint">الحسابات القديمة (أعد إنشاءها من صفحة المستخدمين): <span dir="ltr">${legacy.usernames.join('، ')}</span></p>` : ''}
        <div class="row">
          <button class="btn btn-primary" data-import>${icon('download', 18)} استيراد الآن</button>
          <button class="btn btn-ghost text-danger" data-wipe>${icon('trash', 18)} حذف البيانات القديمة نهائياً</button>
        </div>`);
      on(box, 'click', '[data-import]', (ev, btn) => withBusy(btn, async () => {
        const existing = store.get('contracts').filter((c) => c.legacyId).length;
        if (existing && !(await confirmDialog({ title: 'تنبيه', message: 'يبدو أنك استوردت سابقاً. الاستيراد مرة أخرى سيكرر العقود. متابعة؟', confirmText: 'متابعة' }))) return;
        try { const r = await importLegacy(legacy); toast(`تم استيراد ${r.contractsCount} عقد و ${r.centersCount} مركز`); }
        catch (err) { toast(friendlyError(err), 'danger'); }
      }));
      on(box, 'click', '[data-wipe]', async () => {
        if (await confirmDialog({ title: 'حذف البيانات القديمة', message: 'تأكد أولاً أن الاستيراد تم وأن العقود ظاهرة في المنصة. الحذف يزيل كلمات المرور المكشوفة القديمة من قاعدة البيانات ولا يمكن التراجع.', confirmText: 'حذف نهائي', danger: true })) {
          try { await deleteLegacy(); toast('تم حذف البيانات القديمة'); dataTab(el); } catch (err) { toast(friendlyError(err), 'danger'); }
        }
      });
    } catch (err) { toast(friendlyError(err), 'danger'); }
  }));
}

/* ---------------- سجل العمليات ---------------- */
const ACTIONS = {
  'contract.add': 'إضافة عقد', 'contract.edit': 'تعديل عقد', 'contract.delete': 'حذف عقد', 'installment.update': 'تحديث دفعة',
  'installment.payment': 'تسجيل مبلغ مسدد', 'installment.payment_delete': 'حذف مبلغ مسدد', 'installment.adjust': 'إعفاء / خصم',
  'center.add': 'إضافة مركز', 'center.rename': 'تعديل مركز', 'center.delete': 'حذف مركز', 'center.location': 'تحديد موقع مركز', 'center.investment': 'بيانات استثمار مركز',
  'user.add': 'إضافة مستخدم', 'user.edit': 'تعديل مستخدم', 'user.delete': 'حذف مستخدم', 'user.password': 'تغيير كلمة مرور',
};

async function auditTab(el) {
  setHTML(el, html`<section class="card"><span class="spinner"></span></section>`);
  try {
    const rows = await settingsRepo.readAudit();
    const contracts = store.get('contracts');
    const describe = (r) => {
      const d = r.details || {};
      if (d.brand) return d.brand;
      if (d.contractId) { const c = contracts.find((x) => x.id === d.contractId); return `${c?.brandName || ''} — دفعة ${Number(d.index) + 1}${d.amount ? ` (${money(d.amount)})` : ''}${d.waived || d.discount ? ` (إعفاء ${money(d.waived || 0)} · خصم ${money(d.discount || 0)})` : ''}${'paid' in d ? (d.paid ? ' (سداد)' : ' (إلغاء سداد)') : ''}${'lateFlag' in d ? (d.lateFlag ? ' (تعثر)' : ' (إلغاء تعثر)') : ''}`; }
      return d.name || d.username || '';
    };
    setHTML(el, html`<section class="card card-flush">${rows.length ? html`<div class="table-wrap"><table class="table table-cards">
      <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td data-label="الوقت" class="num small">${formatTimestamp(r.at)}</td><td data-label="المستخدم">${r.by}</td><td data-label="العملية">${ACTIONS[r.action] || r.action}</td><td data-label="التفاصيل" class="small">${describe(r)}</td></tr>`)}</tbody>
    </table></div>` : emptyState({ ic: 'history', title: 'لا توجد عمليات مسجلة بعد' })}</section>`);
  } catch (err) { setHTML(el, html`<section class="card">${friendlyError(err)}</section>`); }
}

/* ---------------- التصنيفات ---------------- */
function categoriesTab(el) {
  const custom = customCategories();
  setHTML(el, html`
    <section class="card stack">
      <header class="card-head"><h2>${icon('plus', 18)} تصنيفات خاصة</h2></header>
      <p class="muted">أضف أي نشاط غير موجود في القائمة الأساسية، وسيظهر في نموذج العقد تحت مجموعة "${CUSTOM_GROUP}" وفي الإحصائيات.</p>
      <form class="inline-form" data-add-cat>
        <input class="input" name="name" placeholder="مثال: محل شاي وقهوة مختصة" maxlength="60" required>
        <button class="btn btn-primary">${icon('plus', 16)} إضافة</button>
      </form>
      ${custom.length ? html`<div class="cat-list">${custom.map((c) => html`<span class="chip chip-neutral">${c}<button type="button" data-del-cat="${c}" title="حذف" aria-label="حذف ${c}">${icon('x', 13)}</button></span>`)}</div>`
        : html`<p class="hint">${icon('info', 14)} لا توجد تصنيفات خاصة بعد.</p>`}
    </section>
    <section class="card stack">
      <header class="card-head"><h2>${icon('grid', 18)} التصنيفات الأساسية</h2></header>
      <div class="cat-groups">${APP_CONFIG.categoryGroups.map((g) => html`<div><strong>${g.group}</strong><p>${g.items.join('، ')}</p></div>`)}</div>
    </section>`);

  const save = (list) => settingsRepo.saveGeneral({ customCategories: list });
  $('[data-add-cat]', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.name.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (APP_CONFIG.categories.includes(name) || custom.includes(name)) { toast('هذا التصنيف موجود مسبقاً', 'warning'); return; }
    withBusy(form.querySelector('button'), async () => {
      try { await save([...custom, name]); toast('تمت إضافة التصنيف'); categoriesTab(el); }
      catch (err) { toast(friendlyError(err), 'danger'); }
    });
  });
  on(el, 'click', '[data-del-cat]', async (e, b) => {
    const name = b.dataset.delCat;
    const used = store.get('contracts').filter((c) => c.category === name).length;
    const msg = used ? `التصنيف "${name}" مستخدم في ${used} عقد — ستبقى هذه العقود بنفس التصنيف لكنه لن يظهر في القائمة. متابعة؟` : `حذف التصنيف "${name}"؟`;
    if (!(await confirmDialog({ title: 'حذف تصنيف', message: msg, confirmText: 'حذف', danger: true }))) return;
    try { await save(custom.filter((x) => x !== name)); toast('تم حذف التصنيف'); categoriesTab(el); }
    catch (err) { toast(friendlyError(err), 'danger'); }
  });
}

const RENDER = { brand: brandTab, notify: notifyTab, categories: categoriesTab, account: accountTab, data: dataTab, audit: auditTab };

export default {
  id: 'settings',
  title: 'الإعدادات',
  icon: 'settings',
  nav: true,
  deps: ['notifySettings', 'generalSettings'],
  mount(el, params) {
    root = el;
    const tabs = TABS.filter((t) => !t.guard || t.guard());
    tab = tabs.some((t) => t.id === params) ? params : tabs[0].id;
    setHTML(el, html`
      ${pageHeader({ title: 'الإعدادات', subtitle: 'تخصيص المنصة والإشعارات وحسابك' })}
      <nav class="tabs" role="tablist">${tabs.map((t) => html`<a class="tab ${t.id === tab ? 'active' : ''}" href="#/settings/${t.id}" role="tab">${icon(t.ic, 16)} ${t.label}</a>`)}</nav>
      <div class="stack" data-tab></div>`);
    RENDER[tab]($('[data-tab]', el));
  },
  // نعيد رسم تبويب الإشعارات فقط عند وصول إعداداته من الخادم (بقية النماذج لا تُمس أثناء الكتابة)
  update() { if (tab === 'notify' && !root.contains(document.activeElement)) notifyTab($('[data-tab]', root)); },
};


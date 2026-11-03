/** العائد على الاستثمار لكل مركز تجاري */
import { APP_CONFIG } from '../config/app.config.js';
import { store, can } from '../core/store.js';
import { html, setHTML, on, $, formValues } from '../utils/dom.js';
import { money, compactMoney, toNumber, int } from '../utils/numbers.js';
import { centerInvestment, investmentTotals, normalizeInvestment } from '../domain/investment.js';
import { centersRepo } from '../services/repositories.js';
import { friendlyError } from '../services/errors.js';
import { pageHeader, emptyState, kpi, loadingBlock, badge, options } from '../components/ui.js';
import { openModal, toast, withBusy, showFieldErrors } from '../components/overlay.js';
import { icon } from '../components/icons.js';

let root;
let centerFilter = '';

const pctText = (r) => (r === null || r === undefined ? '—' : `${(r * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}٪`);
const yearsText = (y) => {
  if (y === null || y === undefined) return '—';
  const n = Math.round(y * 10) / 10;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} سنة`;
};
const tone = (n) => (n > 0 ? 'text-success' : n < 0 ? 'text-danger' : '');

function centerCard(r) {
  const { center, inv } = r;
  const edit = can.admin() ? html`<button class="btn btn-ghost btn-sm" data-edit="${center.id}">${icon('edit', 15)} ${inv.configured ? 'تعديل البيانات' : 'إدخال البيانات'}</button>` : '';
  if (!inv.configured) {
    return html`
      <section class="card roi-card">
        <header class="card-head"><h2>${icon('building', 18)} ${center.name}</h2>${edit}</header>
        <p class="muted">لم تُدخل بيانات الاستثمار لهذا المركز بعد. الدخل السنوي الحالي من العقود: <strong class="num">${money(r.income)}</strong></p>
      </section>`;
  }
  return html`
    <section class="card roi-card">
      <header class="card-head">
        <h2>${icon('building', 18)} ${center.name} ${badge(inv.ownership === 'leased' ? 'أرض مستأجرة' : 'ملك', inv.ownership === 'leased' ? 'warning' : 'success')}</h2>
        ${edit}
      </header>
      <div class="roi-hero">
        <div class="roi-rate">
          <span>نسبة العائد السنوي على رأس المال</span>
          <strong class="num ${tone(r.roi)}">${pctText(r.roi)}</strong>
        </div>
        <div class="roi-net">
          <span>الصافي السنوي</span>
          <strong class="num ${tone(r.net)}">${money(r.net)}</strong>
        </div>
      </div>
      <dl class="roi-grid">
        <div><dt>الدخل السنوي من العقود</dt><dd class="num">${money(r.income)}</dd><small class="muted">${int(r.contractsCount)} عقد ساري أو قادم</small></div>
        <div><dt>إيجار الأرض السنوي</dt><dd class="num">${inv.ownership === 'leased' ? money(inv.landRent) : '— (ملك)'}</dd></div>
        <div><dt>تكلفة الإنشاء</dt><dd class="num">${money(inv.buildCost)}</dd></div>
        <div><dt>رأس المال</dt><dd class="num">${money(r.capital)}</dd><small class="muted">الإنشاء + إيجار السنة الحالية</small></div>
        <div><dt>مدة الاستثمار</dt><dd class="num">${inv.years ? `${inv.years} سنة` : '—'}</dd></div>
        <div><dt>إجمالي الدخل خلال مدة الاستثمار</dt><dd class="num">${inv.years ? money(r.income * inv.years) : '—'}</dd><small class="muted">بافتراض ثبات الدخل الحالي</small></div>
        <div><dt>صافي الربح خلال مدة الاستثمار</dt><dd class="num ${tone(r.totalNet)}">${r.totalNet === null ? '—' : money(r.totalNet)}</dd><small class="muted">الصافي السنوي × المدة − تكلفة الإنشاء</small></div>
        <div><dt>استرداد تكلفة الإنشاء</dt><dd class="num">${r.payback === null ? '—' : yearsText(r.payback)}</dd>${r.payback !== null && inv.years && r.payback > inv.years ? html`<small class="text-danger">أطول من مدة الاستثمار</small>` : ''}</div>
      </dl>
    </section>`;
}

function render() {
  const box = $('[data-body]', root);
  if (!store.get('loaded').centers || !store.get('loaded').contracts) { setHTML(box, loadingBlock()); return; }
  const centers = store.get('centers');
  if (!centers.length) { setHTML(box, html`<div class="card">${emptyState({ ic: 'building', title: 'لا توجد مراكز تجارية', text: 'أضف مركزاً من صفحة المراكز أولاً' })}</div>`); return; }
  const contracts = store.get('contracts');
  const rows = centers.map((c) => centerInvestment(c, contracts));
  const shown = centerFilter ? rows.filter((r) => r.center.id === centerFilter) : rows;
  const configured = rows.filter((r) => r.inv.configured);
  const t = investmentTotals(configured);

  setHTML(box, html`
    ${!centerFilter && configured.length > 1 ? html`
      <section class="kpi-grid">
        ${kpi({ label: 'إجمالي الدخل السنوي', value: compactMoney(t.income), hint: money(t.income), ic: 'wallet', tone: 'primary' })}
        ${kpi({ label: 'إجمالي الصافي السنوي', value: compactMoney(t.net), hint: money(t.net), ic: 'trend', tone: 'accent' })}
        ${kpi({ label: 'إجمالي رأس المال', value: compactMoney(t.capital), hint: money(t.capital), ic: 'building', tone: 'info' })}
        ${kpi({ label: 'متوسط العائد على رأس المال', value: pctText(t.roi), hint: `${int(configured.length)} مراكز مُدخلة`, ic: 'chart', tone: t.roi > 0 ? 'primary' : 'danger' })}
      </section>` : ''}
    ${shown.map(centerCard)}
    <p class="hint">${icon('info', 14)} الدخل السنوي = مجموع الإيجار السنوي للعقود غير المنتهية في المركز (يُحسب تلقائياً من دفعات كل عقد ومدته).</p>`);
}

function openInvestmentForm(centerId) {
  const center = store.get('centers').find((c) => c.id === centerId);
  if (!center) return;
  const inv = normalizeInvestment(center.investment);
  openModal({
    title: 'بيانات الاستثمار',
    subtitle: center.name,
    size: 'md',
    body: html`
      <form class="stack" novalidate data-inv>
        <div class="field"><span>ملكية الأرض</span>
          <div class="segmented" role="radiogroup">
            <label class="seg"><input type="radio" name="ownership" value="owned" ${inv.ownership === 'owned' ? 'checked' : ''}><span>ملك</span></label>
            <label class="seg"><input type="radio" name="ownership" value="leased" ${inv.ownership === 'leased' ? 'checked' : ''}><span>إيجار</span></label>
          </div>
        </div>
        <label class="field" data-rent-field ${inv.ownership === 'leased' ? '' : 'hidden'}><span>قيمة إيجار الأرض السنوي (${APP_CONFIG.currency})</span>
          <input class="input num" name="landRent" inputmode="decimal" value="${inv.landRent || ''}" placeholder="2000000"></label>
        <label class="field"><span>تكلفة إنشاء المشروع كاملاً (${APP_CONFIG.currency})</span>
          <input class="input num" name="buildCost" inputmode="decimal" value="${inv.buildCost || ''}" placeholder="50000000"></label>
        <label class="field"><span>مدة الاستثمار (سنوات)</span>
          <input class="input num" name="years" inputmode="numeric" value="${inv.years || ''}" placeholder="25"></label>
      </form>`,
    footer: html`<button class="btn btn-primary" data-save>${icon('check', 18)} حفظ</button><button class="btn btn-ghost" data-close>إلغاء</button>`,
    onMount(el, close) {
      const form = el.querySelector('[data-inv]');
      form.addEventListener('change', () => { form.querySelector('[data-rent-field]').hidden = formValues(form).ownership !== 'leased'; });
      el.querySelector('[data-save]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const v = formValues(form);
        const errors = {};
        const landRent = v.ownership === 'leased' ? toNumber(v.landRent) : 0;
        const buildCost = toNumber(v.buildCost);
        const years = toNumber(v.years);
        if (v.ownership === 'leased' && (Number.isNaN(landRent) || landRent <= 0)) errors.landRent = 'أدخل قيمة الإيجار السنوي';
        if (Number.isNaN(buildCost) || buildCost < 0) errors.buildCost = 'أدخل تكلفة الإنشاء';
        if (Number.isNaN(years) || years < 1 || years > 99 || !Number.isInteger(years)) errors.years = 'أدخل عدد سنوات صحيح (1 – 99)';
        showFieldErrors(form, errors);
        if (Object.keys(errors).length) return;
        try {
          await centersRepo.saveInvestment(center.id, { ownership: v.ownership === 'leased' ? 'leased' : 'owned', landRent, buildCost, years });
          toast('تم حفظ بيانات الاستثمار');
          close();
        } catch (err) { toast(friendlyError(err), 'danger'); }
      }));
    },
  });
}

export default {
  id: 'investment',
  title: 'العائد على الاستثمار',
  icon: 'trend',
  nav: true,
  guard: () => can.admin(),
  deps: ['contracts', 'centers', 'loaded'],
  mount(el) {
    root = el;
    setHTML(el, html`
      ${pageHeader({
        title: 'العائد على الاستثمار',
        subtitle: 'التكاليف الثابتة لكل مركز، الصافي السنوي، ونسبة العائد على رأس المال',
        actions: html`<select class="input toolbar-select" data-center aria-label="المركز"><option value="">جميع المراكز</option>${options(store.get('centers'), centerFilter, { labelKey: 'name' })}</select>`,
      })}
      <div class="stack" data-body></div>`);
    render();
    $('[data-center]', el).addEventListener('change', (e) => { centerFilter = e.target.value; render(); });
    on(el, 'click', '[data-edit]', (e, b) => openInvestmentForm(b.dataset.edit));
  },
  update: render,
};

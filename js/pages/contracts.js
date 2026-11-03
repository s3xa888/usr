/** صفحة العقود: بحث وتصفية وجداول لكل مركز */
import { APP_CONFIG, labelOf } from '../config/app.config.js';
import { store, can, centerName } from '../core/store.js';
import { html, setHTML, on, debounce, $ } from '../utils/dom.js';
import { money, int, compactMoney } from '../utils/numbers.js';
import { formatDate } from '../utils/dates.js';
import { matchesSearch, byShopNumber, contractPhase } from '../domain/contracts.js';
import { isOutstanding } from '../domain/installments.js';
import { contractsRepo } from '../services/repositories.js';
import { exportContractsCSV } from '../services/export.service.js';
import { friendlyError } from '../services/errors.js';
import { pageHeader, emptyState, shopStatusPill, nextInstallmentCell, options, loadingBlock } from '../components/ui.js';
import { confirmDialog, toast } from '../components/overlay.js';
import { icon } from '../components/icons.js';
import { openContractForm } from './contract-form.js';
import { openContractDetails } from './contract-details.js';

const filters = { q: '', center: '', view: 'all' };
let root;

const VIEWS = [
  { id: 'all', label: 'الكل' },
  { id: 'due', label: 'عليها مستحقات' },
  { id: 'vacant', label: 'غير مؤجرة' },
  { id: 'expired', label: 'منتهية' },
];

function filtered() {
  return store.get('contracts').filter((c) => {
    if (filters.center && c.centerId !== filters.center) return false;
    if (filters.view === 'due' && !c.installments.some((i) => isOutstanding(i))) return false;
    if (filters.view === 'vacant' && c.shopStatus !== 'vacant') return false;
    if (filters.view === 'expired' && contractPhase(c) !== 'expired') return false;
    return matchesSearch(c, filters.q, centerName(c.centerId));
  });
}

function row(c) {
  const phase = contractPhase(c);
  return html`
    <tr data-row="${c.id}" class="${phase === 'expired' ? 'is-muted' : ''}">
      <td data-label="الحالة">${shopStatusPill(c.shopStatus)}</td>
      <td data-label="المحل" class="num"><span class="shop-no">${c.shopNumber}</span></td>
      <td data-label="النشاط" class="cell-main">
        <strong>${c.brandName}${c.isBrand ? html` <span class="brand-tick" title="براند">${icon('check', 12)}</span>` : ''}</strong>
        <span class="chip chip-neutral">${c.category}</span>
      </td>
      <td data-label="المستأجر"><span class="block">${c.tenantName}</span><a class="muted small num" dir="ltr" href="tel:${c.tenantPhone}" data-stop>${c.tenantPhone}</a></td>
      <td data-label="المساحة" class="num">${c.area ? `${int(c.area)} م²` : '—'}</td>
      <td data-label="الإيجار السنوي" class="num"><strong>${money(c.annualRent)}</strong></td>
      <td data-label="الدفعة القادمة">${nextInstallmentCell(c)}</td>
      <td data-label="الدفع">${labelOf(APP_CONFIG.paymentTypes, c.paymentType)}</td>
      <td data-label="مدة العقد" class="num small">${formatDate(c.startDate)}<br><span class="muted">${formatDate(c.endDate)}</span>${phase === 'expired' ? html`<br><span class="chip chip-neutral">منتهي</span>` : ''}</td>
      <td class="cell-actions" data-stop>
        <button class="icon-btn" data-details="${c.id}" title="الدفعات والتفاصيل">${icon('wallet', 17)}</button>
        ${can.admin() ? html`
          <button class="icon-btn" data-edit="${c.id}" title="تعديل">${icon('edit', 17)}</button>
          <button class="icon-btn text-danger" data-delete="${c.id}" title="حذف">${icon('trash', 17)}</button>` : ''}
      </td>
    </tr>`;
}

function renderList() {
  const box = $('[data-list]', root);
  const loaded = store.get('loaded');
  if (!loaded.contracts || !loaded.centers) { setHTML(box, loadingBlock()); return; }

  const centers = store.get('centers').filter((c) => !filters.center || c.id === filters.center);
  const list = filtered();
  $('[data-count]', root).textContent = `${int(list.length)} عقد`;

  if (!store.get('centers').length) {
    setHTML(box, html`<div class="card">${emptyState({ ic: 'building', title: 'ابدأ بإضافة مركز تجاري', text: 'العقود تُسجَّل داخل المراكز التجارية', action: can.admin() ? html`<a class="btn btn-primary" href="#/centers">${icon('plus', 18)} إضافة مركز</a>` : '' })}</div>`);
    return;
  }

  const filtering = filters.q || filters.view !== 'all';
  setHTML(box, centers.map((center) => {
    const items = list.filter((c) => c.centerId === center.id).sort(byShopNumber);
    if (filtering && !items.length) return '';
    const annual = items.reduce((s, c) => s + c.annualRent, 0);
    return html`
      <section class="card card-flush">
        <header class="card-head card-head-pad">
          <h2>${icon('building', 18)} ${center.name}</h2>
          <div class="head-meta">
            <span class="muted small num">${int(items.length)} عقد · ${compactMoney(annual)} سنوياً</span>
            ${items.length ? html`<button class="btn btn-ghost btn-sm" data-export="${center.id}">${icon('download', 16)} Excel</button>` : ''}
            ${can.add() ? html`<button class="btn btn-subtle btn-sm" data-new-in="${center.id}">${icon('plus', 16)} عقد</button>` : ''}
          </div>
        </header>
        ${items.length
          ? html`<div class="table-wrap"><table class="table table-cards">
              <thead><tr><th>الحالة</th><th>المحل</th><th>النشاط</th><th>المستأجر</th><th>المساحة</th><th>الإيجار السنوي</th><th>الدفعة القادمة</th><th>الدفع</th><th>مدة العقد</th><th></th></tr></thead>
              <tbody>${items.map(row)}</tbody></table></div>`
          : emptyState({ ic: 'file', title: 'لا توجد عقود في هذا المركز' })}
      </section>`;
  }));

  if (filtering && !list.length) setHTML(box, html`<div class="card">${emptyState({ ic: 'search', title: 'لا توجد نتائج', text: 'جرّب كلمة بحث أخرى أو غيّر التصفية' })}</div>`);
}

export default {
  id: 'contracts',
  title: 'العقود',
  icon: 'file',
  nav: true,
  tab: true,
  deps: ['contracts', 'centers', 'loaded'],
  mount(el, params) {
    root = el;
    if (params) filters.center = params;
    else if (filters.center && !store.get('centers').some((c) => c.id === filters.center)) filters.center = '';

    setHTML(el, html`
      ${pageHeader({
        title: 'العقود',
        subtitle: 'جميع عقود الإيجار مقسمة حسب المراكز التجارية',
        actions: html`
          <button class="btn btn-ghost" data-export-all>${icon('download', 18)} تصدير Excel</button>
          ${can.add() ? html`<button class="btn btn-primary" data-new>${icon('plus', 18)} عقد جديد</button>` : ''}`,
      })}
      <div class="toolbar card">
        <label class="search">${icon('search', 18)}<input class="input" type="search" data-q placeholder="ابحث باسم النشاط، رقم المحل، المستأجر، الجوال…" value="${filters.q}"></label>
        <select class="input toolbar-select" data-center aria-label="المركز">
          <option value="">كل المراكز</option>${options(store.get('centers'), filters.center, { labelKey: 'name' })}
        </select>
        <div class="segmented compact" role="tablist">
          ${VIEWS.map((v) => html`<label class="seg"><input type="radio" name="view" value="${v.id}" ${filters.view === v.id ? 'checked' : ''}><span>${v.label}</span></label>`)}
        </div>
        <span class="muted small num toolbar-count" data-count></span>
      </div>
      <div class="stack" data-list></div>`);

    renderList();

    $('[data-q]', el).addEventListener('input', debounce((e) => { filters.q = e.target.value.trim(); renderList(); }, 150));
    $('[data-center]', el).addEventListener('change', (e) => { filters.center = e.target.value; renderList(); });
    on(el, 'change', 'input[name=view]', (e, input) => { filters.view = input.value; renderList(); });
    on(el, 'click', '[data-new]', () => openContractForm(null, { presetCenterId: filters.center }));
    on(el, 'click', '[data-new-in]', (e, b) => openContractForm(null, { presetCenterId: b.dataset.newIn }));
    on(el, 'click', '[data-export-all]', () => exportContractsCSV(filtered(), 'كل_العقود'));
    on(el, 'click', '[data-export]', (e, b) => exportContractsCSV(filtered().filter((c) => c.centerId === b.dataset.export), centerName(b.dataset.export)));
    on(el, 'click', '[data-details]', (e, b) => openContractDetails(b.dataset.details));
    on(el, 'click', '[data-edit]', (e, b) => openContractForm(store.get('contracts').find((c) => c.id === b.dataset.edit)));
    on(el, 'click', '[data-delete]', async (e, b) => {
      const c = store.get('contracts').find((x) => x.id === b.dataset.delete);
      if (!c) return;
      if (await confirmDialog({ title: 'حذف العقد', message: `سيتم حذف عقد "${c.brandName}" (محل ${c.shopNumber}) وجميع دفعاته نهائياً.`, confirmText: 'حذف نهائي', danger: true })) {
        try { await contractsRepo.remove(c.id, c.brandName); toast('تم حذف العقد'); } catch (err) { toast(friendlyError(err), 'danger'); }
      }
    });
    on(el, 'click', 'tr[data-row]', (e, tr) => {
      if (e.target.closest('[data-stop], a, button, input')) return;
      openContractDetails(tr.dataset.row);
    });
  },
  update: renderList,
};

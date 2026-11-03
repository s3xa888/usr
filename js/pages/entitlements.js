/** الاستحقاقات: الدفعات المستحقة غير المسددة والمتأخرة فقط */
import { store, centerName } from '../core/store.js';
import { html, setHTML, on, $ } from '../utils/dom.js';
import { money, int } from '../utils/numbers.js';
import { formatDate, daysUntil } from '../utils/dates.js';
import { entitlements } from '../domain/stats.js';
import { printEntitlements, downloadCSV } from '../services/export.service.js';
import { pageHeader, emptyState, kpi, options, loadingBlock, waLink } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { openContractDetails } from './contract-details.js';
import { todayISO } from '../utils/dates.js';

let root;
let centerFilter = '';

const data = () => entitlements(store.get('contracts')).filter((e) => !centerFilter || e.contract.centerId === centerFilter);

function render() {
  const box = $('[data-body]', root);
  if (!store.get('loaded').contracts) { setHTML(box, loadingBlock()); return; }
  const list = data();
  const total = list.reduce((s, e) => s + e.total, 0);
  const count = list.reduce((s, e) => s + e.items.length, 0);
  const oldest = list.reduce((m, e) => (!m || e.oldest < m ? e.oldest : m), '');

  setHTML(box, html`
    <section class="kpi-grid kpi-grid-3">
      ${kpi({ label: 'إجمالي المستحق', value: money(total), ic: 'wallet', tone: 'danger' })}
      ${kpi({ label: 'عدد الدفعات', value: int(count), hint: `على ${int(list.length)} نشاط`, ic: 'file', tone: 'warning' })}
      ${kpi({ label: 'أقدم استحقاق', value: oldest ? formatDate(oldest) : '—', hint: oldest ? `منذ ${Math.abs(daysUntil(oldest))} يوم` : '', ic: 'clock', tone: 'info' })}
    </section>
    <section class="card card-flush">
      ${list.length ? html`
        <div class="table-wrap"><table class="table table-cards">
          <thead><tr><th>النشاط</th><th>المركز</th><th>الدفعات</th><th>الإجمالي</th><th>تواريخ الاستحقاق</th><th></th></tr></thead>
          <tbody>${list.map((e) => html`
            <tr data-row="${e.contract.id}">
              <td data-label="النشاط" class="cell-main"><strong>${e.contract.brandName}</strong><span class="muted small">محل ${e.contract.shopNumber} · ${e.contract.tenantName}</span></td>
              <td data-label="المركز">${centerName(e.contract.centerId)}</td>
              <td data-label="الدفعات"><span class="badge badge-danger num">${e.items.length} دفعة</span></td>
              <td data-label="الإجمالي" class="num"><strong class="text-danger">${money(e.total)}</strong></td>
              <td data-label="التواريخ" class="num small">${e.items.map((i) => html`<span class="date-chip">${formatDate(i.dueDate)}</span>`)}</td>
              <td class="cell-actions" data-stop>
                <button class="icon-btn" data-pdf="${e.contract.id}" title="تقرير PDF">${icon('printer', 17)}</button>
                <a class="icon-btn" title="تذكير واتساب" target="_blank" rel="noopener noreferrer"
                   href="${waLink(e.contract.tenantPhone, `السلام عليكم ${e.contract.tenantName}،\nنود تذكيركم بوجود ${e.items.length} دفعة مستحقة على محل ${e.contract.shopNumber} (${e.contract.brandName}) بإجمالي ${money(e.total)}.\nشاكرين تعاونكم.`)}">${icon('message', 17)}</a>
                <button class="icon-btn" data-details="${e.contract.id}" title="الدفعات">${icon('wallet', 17)}</button>
              </td>
            </tr>`)}</tbody>
        </table></div>`
      : emptyState({ ic: 'check', title: 'لا توجد دفعات مستحقة', text: 'جميع الدفعات التي حلّ موعدها مسددة' })}
    </section>`);
}

export default {
  id: 'entitlements',
  title: 'الاستحقاقات',
  icon: 'wallet',
  nav: true,
  tab: true,
  deps: ['contracts', 'centers', 'loaded'],
  mount(el) {
    root = el;
    setHTML(el, html`
      ${pageHeader({
        title: 'الاستحقاقات',
        subtitle: 'الأنشطة التي عليها دفعات حلّ موعدها ولم تُسدد، أو عُلّمت متعثرة',
        actions: html`
          <select class="input toolbar-select" data-center aria-label="المركز"><option value="">كل المراكز</option>${options(store.get('centers'), centerFilter, { labelKey: 'name' })}</select>
          <button class="btn btn-ghost" data-csv>${icon('download', 18)} Excel</button>
          <button class="btn btn-primary" data-print-all>${icon('printer', 18)} تقرير PDF شامل</button>`,
      })}
      <div class="stack" data-body></div>`);
    render();
    $('[data-center]', el).addEventListener('change', (e) => { centerFilter = e.target.value; render(); });
    on(el, 'click', '[data-pdf]', (e, b) => printEntitlements(data().filter((x) => x.contract.id === b.dataset.pdf), `تقرير استحقاقات`));
    on(el, 'click', '[data-print-all]', () => {
      const list = data();
      if (!list.length) return;
      printEntitlements(list, 'تقرير الاستحقاقات الشامل');
    });
    on(el, 'click', '[data-csv]', () => {
      const rows = data().flatMap((e) => e.items.map((i) => [e.contract.brandName, e.contract.shopNumber, centerName(e.contract.centerId), e.contract.tenantName, e.contract.tenantPhone, i.n, i.dueDate, i.amount, i.paidAmount, i.waived + i.discount, i.remaining]));
      downloadCSV(`يسر_الاستحقاقات_${todayISO()}.csv`, ['النشاط', 'المحل', 'المركز', 'المستأجر', 'الجوال', 'رقم الدفعة', 'تاريخ الاستحقاق', 'قيمة الدفعة', 'المسدد', 'الإعفاء والخصم', 'المتبقي'], rows);
    });
    on(el, 'click', '[data-details]', (e, b) => openContractDetails(b.dataset.details));
    on(el, 'click', 'tr[data-row]', (e, tr) => { if (!e.target.closest('[data-stop], a, button')) openContractDetails(tr.dataset.row); });
  },
  update: render,
};

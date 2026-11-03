/** الإحصائيات والتقارير */
import { store, centerName } from '../core/store.js';
import { html, setHTML, $ } from '../utils/dom.js';
import { money, int, compactMoney, pct } from '../utils/numbers.js';
import { overview, incomeByCenter, countBy, defaulters } from '../domain/stats.js';
import { contractTotal } from '../domain/contracts.js';
import { pageHeader, emptyState, kpi, options, loadingBlock } from '../components/ui.js';
import { renderChart, PALETTE } from '../components/charts.js';
import { icon } from '../components/icons.js';
import { openContractDetails } from './contract-details.js';
import { on } from '../utils/dom.js';

let root;
let centerFilter = '';

function render() {
  const box = $('[data-body]', root);
  if (!store.get('loaded').contracts) { setHTML(box, loadingBlock()); return; }
  const all = store.get('contracts');
  const list = centerFilter ? all.filter((c) => c.centerId === centerFilter) : all;
  const o = overview(list);
  const byCenter = incomeByCenter(store.get('centers'), all);
  const cats = countBy(list, (c) => c.category);
  const def = defaulters(list);
  const defByCat = countBy(def.map((d) => d.contract), (c) => c.category);
  const brands = list.filter((c) => c.isBrand).length;
  const leased = list.filter((c) => c.shopStatus !== 'vacant').length;

  setHTML(box, html`
    <section class="kpi-grid">
      ${kpi({ label: 'إجمالي قيمة العقود', value: compactMoney(o.totalContractsValue), hint: money(o.totalContractsValue), ic: 'wallet', tone: 'accent' })}
      ${kpi({ label: 'المحصّل حتى الآن', value: compactMoney(o.collectedTotal), hint: `${pct(o.collectedTotal, o.collectedTotal + o.outstandingTotal)}٪ من المستحق حتى اليوم`, ic: 'check', tone: 'primary' })}
      ${kpi({ label: 'نسبة الإشغال', value: `${pct(leased, list.length)}٪`, hint: `${int(leased)} من ${int(list.length)} وحدة`, ic: 'store', tone: 'info' })}
      ${kpi({ label: 'المتعثرون', value: int(def.length), hint: money(def.reduce((s, d) => s + d.total, 0)), ic: 'alert', tone: 'danger' })}
    </section>

    <section class="card card-flush">
      <header class="card-head card-head-pad"><h2>${icon('building', 18)} دخل المراكز التجارية</h2></header>
      <div class="table-wrap"><table class="table table-cards">
        <thead><tr><th>المركز</th><th>العقود</th><th>المؤجر</th><th>الدخل السنوي</th><th>إجمالي العقود بمددها</th></tr></thead>
        <tbody>${byCenter.map((x) => html`
          <tr class="${centerFilter && centerFilter !== x.center.id ? 'is-muted' : ''}">
            <td data-label="المركز"><strong>${x.center.name}</strong></td>
            <td data-label="العقود" class="num">${int(x.count)}</td>
            <td data-label="المؤجر" class="num">${int(x.leased)}</td>
            <td data-label="الدخل السنوي" class="num">${money(x.annual)}</td>
            <td data-label="الإجمالي" class="num"><strong class="text-success">${money(x.total)}</strong></td>
          </tr>`)}</tbody>
      </table></div>
    </section>

    <div class="chart-grid">
      <section class="card"><header class="card-head"><h2>توزيع الأنشطة</h2></header><div class="chart-box"><canvas data-chart="cats"></canvas></div></section>
      <section class="card"><header class="card-head"><h2>براند / غير براند</h2></header><div class="chart-box"><canvas data-chart="brands"></canvas></div></section>
      <section class="card"><header class="card-head"><h2>الأنشطة الأكثر تعثراً</h2></header><div class="chart-box"><canvas data-chart="def"></canvas></div></section>
    </div>

    <section class="card card-flush danger-edge">
      <header class="card-head card-head-pad"><h2 class="text-danger">${icon('alert', 18)} المتعثرون</h2></header>
      ${def.length ? html`<div class="table-wrap"><table class="table table-cards">
        <thead><tr><th>النشاط</th><th>التصنيف</th><th>المستأجر</th><th>الجوال</th><th>دفعات مستحقة</th><th>المبلغ</th><th>المركز</th></tr></thead>
        <tbody>${def.map((d) => html`
          <tr data-row="${d.contract.id}">
            <td data-label="النشاط"><strong>${d.contract.brandName}</strong></td>
            <td data-label="التصنيف">${d.contract.category}</td>
            <td data-label="المستأجر">${d.contract.tenantName}</td>
            <td data-label="الجوال" class="num" dir="ltr">${d.contract.tenantPhone}</td>
            <td data-label="الدفعات"><span class="badge badge-danger num">${d.count}${d.flagged ? ` (${d.flagged} معلّمة)` : ''}</span></td>
            <td data-label="المبلغ" class="num"><strong>${money(d.total)}</strong></td>
            <td data-label="المركز">${centerName(d.contract.centerId)}</td>
          </tr>`)}</tbody></table></div>`
      : emptyState({ ic: 'check', title: 'لا يوجد متعثرون حالياً' })}
    </section>

    <section class="card card-flush">
      <header class="card-head card-head-pad"><h2>${icon('chart', 18)} أرباح العقود</h2></header>
      ${list.length ? html`<div class="table-wrap"><table class="table table-cards">
        <thead><tr><th>النشاط</th><th>المركز</th><th>الإيجار السنوي</th><th>المدة</th><th>إجمالي العقد</th></tr></thead>
        <tbody>${[...list].sort((a, b) => contractTotal(b) - contractTotal(a)).map((c) => html`
          <tr data-row="${c.id}">
            <td data-label="النشاط"><strong>${c.brandName}</strong> <span class="muted small">(${c.category})</span></td>
            <td data-label="المركز">${centerName(c.centerId)}</td>
            <td data-label="الإيجار السنوي" class="num">${money(c.annualRent)}</td>
            <td data-label="المدة" class="num">${c.durationYears} سنة</td>
            <td data-label="الإجمالي" class="num"><strong class="text-success">${money(contractTotal(c))}</strong></td>
          </tr>`)}</tbody></table></div>`
      : emptyState({ ic: 'file', title: 'لا توجد عقود' })}
    </section>`);

  const draw = async () => {
    try {
      const catKeys = Object.keys(cats);
      await renderChart($('[data-chart=cats]', box), {
        type: 'doughnut',
        data: { labels: catKeys.map((k) => `${k} (${cats[k]})`), datasets: [{ data: catKeys.map((k) => cats[k]), backgroundColor: PALETTE, borderWidth: 0 }] },
        options: { cutout: '62%' },
      });
      await renderChart($('[data-chart=brands]', box), {
        type: 'doughnut',
        data: { labels: [`براند (${brands})`, `غير براند (${list.length - brands})`], datasets: [{ data: [brands, list.length - brands], backgroundColor: ['#14b8a6', '#94a3b8'], borderWidth: 0 }] },
        options: { cutout: '62%' },
      });
      const dk = Object.keys(defByCat);
      await renderChart($('[data-chart=def]', box), {
        type: 'bar',
        data: { labels: dk.length ? dk : ['لا يوجد'], datasets: [{ label: 'عدد المتعثرين', data: dk.length ? dk.map((k) => defByCat[k]) : [0], backgroundColor: '#ef4444', borderRadius: 6, maxBarThickness: 36 }] },
        options: { plugins: { legend: { display: false } } },
      });
    } catch {
      box.querySelectorAll('.chart-box').forEach((b) => setHTML(b, html`<p class="muted small center">تعذر تحميل الرسوم البيانية (تحقق من الإنترنت)</p>`));
    }
  };
  draw();
}

export default {
  id: 'reports',
  title: 'التقارير',
  icon: 'chart',
  nav: true,
  tab: true,
  deps: ['contracts', 'centers', 'loaded'],
  mount(el) {
    root = el;
    setHTML(el, html`
      ${pageHeader({
        title: 'الإحصائيات والتقارير',
        subtitle: 'أداء المراكز، توزيع الأنشطة، والمتعثرون',
        actions: html`<select class="input toolbar-select" data-center aria-label="المركز"><option value="">جميع المراكز</option>${options(store.get('centers'), centerFilter, { labelKey: 'name' })}</select>`,
      })}
      <div class="stack" data-body></div>`);
    render();
    $('[data-center]', el).addEventListener('change', (e) => { centerFilter = e.target.value; render(); });
    on(el, 'click', 'tr[data-row]', (e, tr) => openContractDetails(tr.dataset.row));
  },
  update: render,
};

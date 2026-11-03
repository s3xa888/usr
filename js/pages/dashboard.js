/** الصفحة الرئيسية: نظرة عامة + التنبيهات */
import { store, can, centerName } from '../core/store.js';
import { html, setHTML, on } from '../utils/dom.js';
import { money, compactMoney, int, pct } from '../utils/numbers.js';
import { formatDate, todayISO } from '../utils/dates.js';
import { overview, incomeByCenter } from '../domain/stats.js';
import { kpi, pageHeader, emptyState, loadingBlock } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { alertMessage } from '../notifications/rules.js';
import { notificationCenter } from '../notifications/notification-center.js';
import { navigate } from '../core/router.js';
import { openContractForm } from './contract-form.js';
import { openContractDetails } from './contract-details.js';

let root;

export function alertItem(a, { dismiss = true } = {}) {
  const ic = a.type === 'contract_ending' ? 'file' : a.severity === 'danger' ? 'alert' : 'clock';
  return html`
    <li class="alert-item sev-${a.severity}">
      <button class="alert-main" data-open="${a.contractId}">
        <span class="alert-ic">${icon(ic, 18)}</span>
        <span class="alert-text">
          <strong>${a.title}</strong>
          <small>${a.subtitle}</small>
        </span>
        <span class="alert-side">
          <em>${alertMessage(a)}</em>
          ${a.amount ? html`<b class="num">${money(a.amount)}</b>` : html`<b class="num">${formatDate(a.date)}</b>`}
        </span>
      </button>
      ${dismiss ? html`<button class="icon-btn alert-x" data-dismiss="${a.key}" aria-label="إخفاء التنبيه" title="إخفاء">${icon('x', 14)}</button>` : ''}
    </li>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}

function render() {
  const contracts = store.get('contracts');
  const loaded = store.get('loaded');
  const profile = store.get('profile');
  if (!loaded.contracts || !loaded.centers) { setHTML(root, loadingBlock()); return; }

  const o = overview(contracts);
  const alerts = store.get('alerts');
  const centers = incomeByCenter(store.get('centers'), contracts);
  const total = o.contractsCount || 1;

  setHTML(root, html`
    ${pageHeader({
      title: `${greeting()}، ${profile?.displayName || ''}`,
      subtitle: `ملخص مراكزك التجارية — ${formatDate(todayISO(), { long: true })}`,
      actions: can.add() ? html`<button class="btn btn-primary" data-new>${icon('plus', 18)} عقد جديد</button>` : '',
    })}

    <section class="kpi-grid">
      ${kpi({ label: 'العقود النشطة', value: int(o.activeCount), hint: `من أصل ${int(o.contractsCount)} عقد`, ic: 'file', tone: 'primary' })}
      ${kpi({ label: 'الدخل السنوي المتعاقد', value: compactMoney(o.annualIncome), hint: money(o.annualIncome), ic: 'wallet', tone: 'accent' })}
      ${kpi({ label: 'مستحقات غير مسددة', value: compactMoney(o.outstandingTotal), hint: `${int(o.outstandingCount)} دفعة · ${int(o.defaultersCount)} نشاط`, ic: 'alert', tone: 'danger' })}
      ${kpi({ label: 'دفعات الـ30 يوماً القادمة', value: compactMoney(o.next30Total), hint: `${int(o.next30Count)} دفعة`, ic: 'calendar', tone: 'info' })}
    </section>

    <div class="dash-grid">
      <section class="card">
        <header class="card-head">
          <h2>${icon('bell', 18)} تنبيهات الاستحقاق <span class="count-pill">${alerts.length}</span></h2>
          ${alerts.length ? html`<button class="btn btn-ghost btn-sm" data-go="entitlements">الاستحقاقات ${icon('chevronLeft', 16)}</button>` : ''}
        </header>
        ${alerts.length
          ? html`<ul class="alert-list">${alerts.slice(0, 8).map((a) => alertItem(a))}</ul>
              ${alerts.length > 8 ? html`<button class="btn btn-ghost btn-block" data-panel>عرض كل التنبيهات (${alerts.length})</button>` : ''}`
          : emptyState({ ic: 'check', title: 'لا توجد تنبيهات', text: 'كل الدفعات القريبة مسددة أو بعيدة الموعد' })}
      </section>

      <div class="stack">
        <section class="card">
          <header class="card-head"><h2>${icon('store', 18)} حالة الوحدات</h2></header>
          <div class="occupancy">
            <div class="occ-bar">
              <i class="occ-success" style="width:${pct(o.statusCounts.leased_open, total)}%"></i>
              <i class="occ-warning" style="width:${pct(o.statusCounts.leased_closed, total)}%"></i>
              <i class="occ-danger" style="width:${pct(o.statusCounts.vacant, total)}%"></i>
            </div>
            <ul class="occ-legend">
              <li><b class="dot dot-success"></b>مؤجر ومفتوح <strong class="num">${int(o.statusCounts.leased_open)}</strong></li>
              <li><b class="dot dot-warning"></b>مؤجر ومغلق <strong class="num">${int(o.statusCounts.leased_closed)}</strong></li>
              <li><b class="dot dot-danger"></b>غير مؤجر <strong class="num">${int(o.statusCounts.vacant)}</strong></li>
            </ul>
          </div>
        </section>

        <section class="card">
          <header class="card-head"><h2>${icon('building', 18)} المراكز التجارية</h2>
            <button class="btn btn-ghost btn-sm" data-go="centers">الكل ${icon('chevronLeft', 16)}</button></header>
          ${centers.length
            ? html`<ul class="center-mini">${centers.map((x) => html`
                <li><button data-center="${x.center.id}">
                  <span class="cm-name">${x.center.name}</span>
                  <span class="muted small num">${int(x.count)} عقد</span>
                  <strong class="num">${compactMoney(x.annual)}</strong>
                </button></li>`)}</ul>`
            : emptyState({ ic: 'building', title: 'لا توجد مراكز بعد', action: can.admin() ? html`<button class="btn btn-subtle btn-sm" data-go="centers">إضافة مركز</button>` : '' })}
        </section>
      </div>
    </div>`);
}

export default {
  id: 'dashboard',
  title: 'الرئيسية',
  icon: 'home',
  nav: true,
  tab: true,
  deps: ['contracts', 'centers', 'alerts', 'loaded', 'profile'],
  mount(el) {
    root = el;
    render();
    on(el, 'click', '[data-new]', () => openContractForm());
    on(el, 'click', '[data-go]', (e, b) => navigate(b.dataset.go));
    on(el, 'click', '[data-open]', (e, b) => openContractDetails(b.dataset.open));
    on(el, 'click', '[data-dismiss]', (e, b) => notificationCenter.dismiss(b.dataset.dismiss));
    on(el, 'click', '[data-panel]', () => document.dispatchEvent(new CustomEvent('yusr:open-alerts')));
    on(el, 'click', '[data-center]', (e, b) => navigate('contracts', b.dataset.center));
  },
  update: render,
};


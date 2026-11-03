/**
 * بعد قراءة ملف عقد إيجار: هل هو عقد مسجل مسبقاً (مطابقة) أم عقد جديد (إضافة)؟
 */
import { store, centerName } from '../core/store.js';
import { html, setHTML, on, $ } from '../utils/dom.js';
import { formatDate } from '../utils/dates.js';
import { money } from '../utils/numbers.js';
import { matchesSearch, byShopNumber } from '../domain/contracts.js';
import { findMatchingContracts } from '../domain/contract-match.js';
import { openModal } from '../components/overlay.js';
import { icon } from '../components/icons.js';
import { openContractForm } from './contract-form.js';
import { openReconcile } from './contract-details.js';

export function openImportChooser(imported, { presetCenterId = '' } = {}) {
  const d = imported.data;
  const all = store.get('contracts');
  const suggestions = findMatchingContracts(all, d);
  let selected = suggestions[0]?.score >= 50 ? suggestions[0].contract.id : '';
  let q = '';

  const item = (c, extra = '') => html`
    <label class="pick-item ${selected === c.id ? 'is-on' : ''}">
      <input type="radio" name="pick" value="${c.id}" ${selected === c.id ? 'checked' : ''}>
      <div>
        <strong>${c.brandName}</strong> <span class="muted small">محل <bdi class="num">${c.shopNumber}</bdi> · ${centerName(c.centerId)}</span>
        <small class="block muted">${c.tenantName} · <bdi class="num">${c.tenantPhone}</bdi> · ${formatDate(c.startDate)} ← ${formatDate(c.endDate)}</small>
        ${extra}
      </div>
    </label>`;

  const renderList = (box) => {
    const list = q ? all.filter((c) => matchesSearch(c, q, centerName(c.centerId))).sort(byShopNumber).slice(0, 30) : [];
    setHTML(box, q ? (list.length ? list.map((c) => item(c)) : html`<p class="muted small">لا نتائج</p>`) : '');
  };

  openModal({
    title: 'هل هذا العقد مسجل في المنصة؟',
    subtitle: `${imported.source} — المستأجر في الملف: ${d.tenantName || '—'}`,
    size: 'md',
    body: html`
      <div class="pdf-sum">
        <div><span>المحل</span><strong class="num"><bdi>${d.shopNumber || '—'}</bdi></strong></div>
        <div><span>المدة</span><strong class="num">${formatDate(d.startDate)} ← ${formatDate(d.endDate)}</strong></div>
        <div><span>الجوال في الملف</span><strong class="num"><bdi>${d.tenantPhone || '—'}</bdi></strong></div>
        <div><span>الدفعات</span><strong class="num">${d.installments.length} × ${money(d.installments[0]?.amount || 0)}</strong></div>
      </div>
      ${suggestions.length ? html`
        <h3 class="amt-title">${icon('search', 16)} عقود مشابهة مسجلة</h3>
        <div class="pick-list" data-sugg>${suggestions.map((s) => item(s.contract, html`<span class="pick-reasons">${s.reasons.map((r) => html`<span class="chip chip-neutral">${r}</span>`)}</span>`))}</div>`
        : html`<p class="hint">${icon('info', 14)} لم أجد عقداً مشابهاً تلقائياً — ابحث عنه بالاسم أو رقم المحل، أو أضفه كعقد جديد.</p>`}
      <h3 class="amt-title">${icon('search', 16)} أو ابحث عن العقد</h3>
      <input class="input" data-q placeholder="اسم البراند، المستأجر، رقم المحل…" autocomplete="off">
      <div class="pick-list" data-results></div>`,
    footer: html`
      <button class="btn btn-primary" data-match ${selected ? '' : 'disabled'}>${icon('check', 18)} مطابقة مع العقد المحدد</button>
      <button class="btn btn-ghost" data-new>${icon('plus', 18)} لا، أضفه كعقد جديد</button>`,
    onMount(el, close) {
      const results = el.querySelector('[data-results]');
      const btn = el.querySelector('[data-match]');
      el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value.trim(); renderList(results); });
      on(el, 'change', 'input[name=pick]', (e, input) => {
        selected = input.value;
        btn.disabled = false;
        el.querySelectorAll('.pick-item').forEach((x) => x.classList.toggle('is-on', x.querySelector('input').value === selected));
      });
      btn.addEventListener('click', () => { const id = selected; close(); setTimeout(() => openReconcile(id, imported), 200); });
      el.querySelector('[data-new]').addEventListener('click', () => {
        close();
        setTimeout(() => openContractForm(null, { presetCenterId, prefill: { ...d, shopStatus: 'leased_open' }, importInfo: { source: imported.source, warnings: imported.warnings } }), 200);
      });
    },
  });
}

/** عناصر واجهة صغيرة قابلة لإعادة الاستخدام */
import { html } from '../utils/dom.js';
import { icon } from './icons.js';
import { APP_CONFIG } from '../config/app.config.js';
import { statusById } from '../domain/contracts.js';
import { STATE_META, installmentState, nextUnpaid } from '../domain/installments.js';
import { money } from '../utils/numbers.js';
import { daysUntil, formatDate, relativeDays } from '../utils/dates.js';

export const badge = (label, tone = 'neutral') => html`<span class="badge badge-${tone}">${label}</span>`;

export function shopStatusPill(statusId) {
  const s = statusById(statusId);
  return html`<span class="status status-${s.tone}"><i></i>${s.label}</span>`;
}

export function installmentBadge(inst) {
  const meta = STATE_META[installmentState(inst)];
  return badge(meta.label, meta.tone);
}

export function nextInstallmentCell(contract) {
  const next = nextUnpaid(contract.installments);
  if (!next) return html`<span class="muted small">${icon('check', 14)} مسدد بالكامل</span>`;
  const d = daysUntil(next.dueDate);
  const tone = next.lateFlag || d < 0 ? 'danger' : d <= APP_CONFIG.alerts.urgentDays ? 'warning' : 'success';
  return html`
    <div class="next-inst">
      <strong class="num">${money(next.remaining)}</strong>${next.partial ? html`<span class="muted small">متبقي من ${money(next.amount)}</span>` : ''}
      <span class="muted small num">${formatDate(next.dueDate)}</span>
      <span class="chip chip-${tone}">${next.lateFlag && d >= 0 ? 'متعثرة' : relativeDays(d)}</span>
    </div>`;
}

export function emptyState({ ic = 'info', title, text = '', action = '' }) {
  return html`
    <div class="empty">
      <div class="empty-ic">${icon(ic, 26)}</div>
      <h3>${title}</h3>
      ${text ? html`<p>${text}</p>` : ''}
      ${action}
    </div>`;
}

export function kpi({ label, value, hint = '', ic = 'chart', tone = 'primary' }) {
  return html`
    <div class="kpi kpi-${tone}">
      <div class="kpi-ic">${icon(ic, 20)}</div>
      <div class="kpi-body">
        <span class="kpi-label">${label}</span>
        <strong class="kpi-value num">${value}</strong>
        ${hint ? html`<span class="kpi-hint">${hint}</span>` : ''}
      </div>
    </div>`;
}

export function pageHeader({ title, subtitle = '', actions = '' }) {
  return html`
    <div class="page-head">
      <div><h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
      ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
    </div>`;
}

export const options = (list, selected, { valueKey = 'id', labelKey = 'label' } = {}) =>
  list.map((o) => {
    const v = typeof o === 'string' ? o : o[valueKey];
    const l = typeof o === 'string' ? o : o[labelKey];
    return html`<option value="${v}" ${String(v) === String(selected) ? 'selected' : ''}>${l}</option>`;
  });

export const loadingBlock = () => html`<div class="loading-block"><span class="spinner"></span> جارِ تحميل البيانات…</div>`;

export const waLink = (phone, text) => {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('05')) p = `966${p.slice(1)}`;
  else if (p.startsWith('5') && p.length === 9) p = `966${p}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
};

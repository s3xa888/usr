/**
 * تفاصيل العقد وجدول الدفعات (نافذة منبثقة تتحدث لحظياً).
 */
import { APP_CONFIG, labelOf } from '../config/app.config.js';
import { store, can, centerName } from '../core/store.js';
import { html, setHTML, on } from '../utils/dom.js';
import { countdown, formatDate, formatTimestamp, periodText } from '../utils/dates.js';
import { money, pct } from '../utils/numbers.js';
import { scheduleSummary, isOutstanding } from '../domain/installments.js';
import { contractTotal } from '../domain/contracts.js';
import { contractsRepo } from '../services/repositories.js';
import { printStatement } from '../services/export.service.js';
import { friendlyError } from '../services/errors.js';
import { openModal, toast, confirmDialog } from '../components/overlay.js';
import { shopStatusPill, installmentBadge, waLink } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { openContractForm } from './contract-form.js';

const fmtCountdown = (inst) => {
  if (inst.paid) return html`<span class="muted">—</span>`;
  const c = countdown(inst.dueDate);
  if (!c) return '';
  if (c.past) return html`<span class="cd cd-late">فائتة ${c.d}ي ${c.h}س</span>`;
  return html`<span class="cd">${c.d}ي ${c.h}س ${c.m}د ${c.s}ث</span>`;
};

export function openContractDetails(contractId) {
  const find = () => store.get('contracts').find((c) => c.id === contractId);
  if (!find()) { toast('العقد غير موجود', 'warning'); return; }

  let timer = null;
  let unsub = null;

  openModal({
    title: 'تفاصيل العقد',
    size: 'lg',
    body: html`<div data-details></div>`,
    footer: html`<div data-foot class="foot-actions"></div>`,
    onClose: () => { clearInterval(timer); unsub?.(); },
    onMount(el, close) {
      const box = el.querySelector('[data-details]');
      const foot = el.querySelector('[data-foot]');

      const render = () => {
        const c = find();
        if (!c) { close(); return; }
        el.querySelector('.modal-head h2').textContent = c.brandName;
        const s = scheduleSummary(c.installments);
        const outstanding = c.installments.filter((i) => isOutstanding(i));
        const msg = outstanding.length
          ? `السلام عليكم ${c.tenantName}،\nنود تذكيركم بوجود ${outstanding.length} دفعة مستحقة على محل ${c.shopNumber} (${c.brandName}) بإجمالي ${money(s.outstandingTotal)}.\nشاكرين تعاونكم.`
          : `السلام عليكم ${c.tenantName}،`;

        setHTML(box, html`
          <div class="detail-top">
            <div class="detail-id">
              <span class="detail-shop num">${c.shopNumber}</span>
              <div><strong>${centerName(c.centerId)}</strong><span class="muted small">${c.category}${c.isBrand ? ' · براند' : ''}</span></div>
            </div>
            ${shopStatusPill(c.shopStatus)}
          </div>

          <div class="info-grid">
            <div><span>المستأجر</span><strong>${c.tenantName}</strong></div>
            <div><span>الجوال</span><strong class="num" dir="ltr">${c.tenantPhone}</strong></div>
            <div><span>المساحة</span><strong class="num">${c.area ? `${c.area} م²` : '—'}</strong></div>
            <div><span>الإيجار السنوي</span><strong class="num">${money(c.annualRent)}</strong></div>
            <div><span>مدة العقد</span><strong class="num">${formatDate(c.startDate)} ← ${formatDate(c.endDate)}</strong><small class="muted">${periodText(c.startDate, c.endDate)}</small></div>
            <div><span>طريقة الدفع</span><strong>${labelOf(APP_CONFIG.paymentTypes, c.paymentType)}</strong></div>
            <div><span>أضيف بواسطة</span><strong>${c.createdBy}</strong><small class="muted num">${formatTimestamp(c.createdAt)}</small></div>
            <div><span>آخر تعديل</span><strong>${c.updatedBy}</strong><small class="muted num">${formatTimestamp(c.updatedAt)}</small></div>
          </div>
          ${c.notes ? html`<div class="note-box">${icon('info', 16)}<div><strong class="note-title">الملاحظات</strong><p>${c.notes}</p></div></div>` : ''}
          ${c.violations ? html`<div class="note-box note-danger">${icon('alert', 16)}<div><strong class="note-title">المخالفات</strong><p>${c.violations}</p></div></div>` : ''}

          <div class="pay-summary">
            <div class="pay-bar"><i style="width:${pct(s.paidTotal, s.total)}%"></i></div>
            <div class="pay-legend">
              <span><b class="dot dot-success"></b>مسدد <strong class="num">${money(s.paidTotal)}</strong></span>
              <span><b class="dot dot-danger"></b>مستحق <strong class="num">${money(s.outstandingTotal)}</strong></span>
              <span><b class="dot dot-muted"></b>قادم <strong class="num">${money(s.upcomingTotal)}</strong></span>
              <span class="muted">إجمالي العقد <strong class="num">${money(contractTotal(c))}</strong></span>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table table-compact inst-table">
              <thead><tr><th>#</th><th>الاستحقاق</th><th>المبلغ</th><th>العد التنازلي</th><th>الحالة</th><th>سداد</th><th>تعثر</th></tr></thead>
              <tbody>
                ${c.installments.map((i) => html`
                  <tr class="${i.paid ? 'is-paid' : ''}">
                    <td data-label="#" class="num">${i.n}</td>
                    <td data-label="الاستحقاق" class="num">${formatDate(i.dueDate)}</td>
                    <td data-label="المبلغ" class="num"><strong>${money(i.amount)}</strong></td>
                    <td data-label="العد التنازلي" data-cd="${i._index}">${fmtCountdown(i)}</td>
                    <td data-label="الحالة">${installmentBadge(i)}${i.paid && i.paidBy ? html`<small class="muted block">بواسطة ${i.paidBy}</small>` : ''}</td>
                    <td data-label="سداد"><label class="switch" title="تم السداد"><input type="checkbox" data-pay="${i._index}" ${i.paid ? 'checked' : ''} ${can.pay() ? '' : 'disabled'}><i></i></label></td>
                    <td data-label="تعثر"><label class="switch switch-danger" title="متعثرة"><input type="checkbox" data-late="${i._index}" ${i.lateFlag ? 'checked' : ''} ${can.pay() ? '' : 'disabled'}><i></i></label></td>
                  </tr>`)}
              </tbody>
            </table>
          </div>`);

        setHTML(foot, html`
          <button class="btn btn-subtle" data-print>${icon('printer', 18)} كشف حساب PDF</button>
          <a class="btn btn-subtle" href="${waLink(c.tenantPhone, msg)}" target="_blank" rel="noopener noreferrer">${icon('message', 18)} تذكير عبر واتساب</a>
          <span class="spacer"></span>
          ${can.admin() ? html`
            <button class="btn btn-ghost" data-edit>${icon('edit', 18)} تعديل</button>
            <button class="btn btn-ghost text-danger" data-delete>${icon('trash', 18)} حذف</button>` : ''}`);
      };

      const tick = () => {
        const c = find();
        if (!c) return;
        box.querySelectorAll('[data-cd]').forEach((td) => {
          const inst = c.installments[+td.dataset.cd];
          if (inst) setHTML(td, fmtCountdown(inst));
        });
      };

      render();
      timer = setInterval(tick, 1000);
      unsub = store.on('contracts', render);

      on(box, 'change', '[data-pay]', async (e, input) => {
        try { await contractsRepo.setInstallment(contractId, +input.dataset.pay, { paid: input.checked }); toast(input.checked ? 'تم تسجيل السداد' : 'تم إلغاء السداد'); }
        catch (err) { input.checked = !input.checked; toast(friendlyError(err), 'danger'); }
      });
      on(box, 'change', '[data-late]', async (e, input) => {
        try { await contractsRepo.setInstallment(contractId, +input.dataset.late, { lateFlag: input.checked }); }
        catch (err) { input.checked = !input.checked; toast(friendlyError(err), 'danger'); }
      });
      on(foot, 'click', '[data-print]', () => printStatement(find()));
      on(foot, 'click', '[data-edit]', () => { close(); openContractForm(find()); });
      on(foot, 'click', '[data-delete]', async () => {
        const c = find();
        if (await confirmDialog({ title: 'حذف العقد', message: `سيتم حذف عقد "${c.brandName}" وجميع دفعاته نهائياً. هل أنت متأكد؟`, confirmText: 'حذف نهائي', danger: true })) {
          try { await contractsRepo.remove(c.id, c.brandName); toast('تم حذف العقد'); close(); }
          catch (err) { toast(friendlyError(err), 'danger'); }
        }
      });
    },
  });
}

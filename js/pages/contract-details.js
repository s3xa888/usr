/**
 * تفاصيل العقد وجدول الدفعات (نافذة منبثقة تتحدث لحظياً).
 */
import { APP_CONFIG, labelOf } from '../config/app.config.js';
import { store, can, centerName, actorName } from '../core/store.js';
import { html, setHTML, on, formValues } from '../utils/dom.js';
import { countdown, formatDate, formatTimestamp, periodText, todayISO, toISO } from '../utils/dates.js';
import { money, pct, toNumber, round2 } from '../utils/numbers.js';
import { scheduleSummary, isOutstanding } from '../domain/installments.js';
import { contractTotal } from '../domain/contracts.js';
import { contractsRepo } from '../services/repositories.js';
import { printStatement, printReceipt } from '../services/export.service.js';
import { friendlyError } from '../services/errors.js';
import { openModal, toast, confirmDialog, withBusy, showFieldErrors } from '../components/overlay.js';
import { shopStatusPill, installmentBadge, waLink } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { openContractForm } from './contract-form.js';
import { importEjarPdf, IMPORT_ERRORS } from '../services/pdf-import.js';
import { reconcileContract, buildReconciledRecord } from '../domain/ejar-reconcile.js';
import { STATE_META, installmentState } from '../domain/installments.js';

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
              <div><strong>${centerName(c.centerId)}</strong><span class="muted small">${c.category}${c.isBrand ? ' · براند' : ''}${c.ejarNo ? html` · عقد إيجار <bdi class="num">${c.ejarNo}</bdi>` : ''}</span></div>
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
            <div class="pay-bar"><i style="width:${pct(s.paidTotal + s.waivedTotal + s.discountTotal, s.total)}%"></i></div>
            <div class="pay-legend">
              <span><b class="dot dot-success"></b>مسدد <strong class="num">${money(s.paidTotal)}</strong></span>
              <span><b class="dot dot-danger"></b>مستحق <strong class="num">${money(s.outstandingTotal)}</strong></span>
              <span><b class="dot dot-muted"></b>قادم <strong class="num">${money(s.upcomingTotal)}</strong></span>
              ${s.waivedTotal ? html`<span><b class="dot dot-info"></b>معفى <strong class="num">${money(s.waivedTotal)}</strong></span>` : ''}
              ${s.discountTotal ? html`<span><b class="dot dot-warning"></b>مخصوم <strong class="num">${money(s.discountTotal)}</strong></span>` : ''}
              <span class="muted">إجمالي العقد <strong class="num">${money(s.total)}</strong>${s.vatTotal ? html` <small>(منها ضريبة ${money(s.vatTotal)})</small>` : ''}</span>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table table-compact inst-table">
              <thead><tr><th>#</th><th>الاستحقاق</th><th>المبلغ</th><th>المسدد / المتبقي</th><th>العد التنازلي</th><th>الحالة</th><th>سداد كامل</th><th>تعثر</th><th></th></tr></thead>
              <tbody>
                ${c.installments.map((i) => html`
                  <tr class="${i.paid ? 'is-paid' : ''}">
                    <td data-label="#" class="num">${i.n}</td>
                    <td data-label="الاستحقاق" class="num">${formatDate(i.dueDate)}</td>
                    <td data-label="المبلغ" class="num"><strong>${money(i.amount)}</strong>${i.vat ? html`<small class="muted block">شامل ضريبة ${money(i.vat)}</small>` : ''}</td>
                    <td data-label="المسدد / المتبقي" class="num small">
                      ${i.paidAmount ? html`<span class="text-success block">مسدد ${money(i.paidAmount)}</span>` : ''}
                      ${i.waived ? html`<span class="block muted">معفى ${money(i.waived)}</span>` : ''}
                      ${i.discount ? html`<span class="block muted">خصم ${money(i.discount)}</span>` : ''}
                      ${i.remaining && (i.paidAmount || i.waived || i.discount) ? html`<strong class="text-danger block">متبقي ${money(i.remaining)}</strong>` : ''}
                      ${!i.paidAmount && !i.waived && !i.discount ? html`<span class="muted">—</span>` : ''}
                    </td>
                    <td data-label="العد التنازلي" data-cd="${i._index}">${fmtCountdown(i)}</td>
                    <td data-label="الحالة">${installmentBadge(i)}${i.paid && i.paidBy ? html`<small class="muted block">بواسطة ${i.paidBy}</small>` : ''}</td>
                    <td data-label="سداد كامل"><label class="switch" title="${i.paid ? 'مسددة بالكامل' : `تسجيل سداد المتبقي (${money(i.remaining)})`}"><input type="checkbox" data-pay="${i._index}" ${i.paid ? 'checked' : ''} ${can.pay() && !(i.paid && !i.paidAmount) ? '' : 'disabled'}><i></i></label></td>
                    <td data-label="تعثر"><label class="switch switch-danger" title="متعثرة"><input type="checkbox" data-late="${i._index}" ${i.lateFlag ? 'checked' : ''} ${can.pay() ? '' : 'disabled'}><i></i></label></td>
                    <td data-label="المبالغ"><button class="btn btn-ghost btn-sm" data-amounts="${i._index}" title="المبالغ المسددة والإعفاء والخصم">${icon('wallet', 15)} المبالغ${i.payments.length ? html` <span class="chip chip-neutral num">${i.payments.length}</span>` : ''}</button></td>
                  </tr>`)}
              </tbody>
            </table>
          </div>`);

        setHTML(foot, html`
          <button class="btn btn-subtle" data-print>${icon('printer', 18)} كشف حساب PDF</button>
          <a class="btn btn-subtle" href="${waLink(c.tenantPhone, msg)}" target="_blank" rel="noopener noreferrer">${icon('message', 18)} تذكير عبر واتساب</a>
          <span class="spacer"></span>
          ${can.admin() ? html`
            <label class="btn btn-ghost" data-match title="يقارن العقد مع ملف عقد إيجار PDF ويصحح التواريخ والمبالغ مع الإبقاء على حالات السداد">${icon('check', 18)} مطابقة مع عقد إيجار
              <input type="file" accept="application/pdf,.pdf" hidden data-match-file></label>
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
        const index = +input.dataset.pay;
        const inst = find()?.installments.find((x) => x._index === index);
        if (!inst) return;
        try {
          if (input.checked) {
            // سداد كامل = تسجيل مبلغ بقيمة المتبقي بتاريخ اليوم
            await contractsRepo.addPayment(contractId, index, { amount: inst.remaining, date: todayISO(), method: '', note: 'سداد كامل' });
            toast('تم تسجيل السداد');
          } else {
            if (inst.payments.length > 1 || inst.partial) {
              const ok = await confirmDialog({ title: 'إلغاء السداد', message: `سيتم حذف ${inst.payments.length} مبلغ مسجل على هذه الدفعة (${money(inst.paidAmount)}). هل أنت متأكد؟`, confirmText: 'حذف المبالغ', danger: true });
              if (!ok) { input.checked = true; return; }
            }
            await contractsRepo.setInstallment(contractId, index, { paid: false });
            toast('تم إلغاء السداد');
          }
        } catch (err) { input.checked = !input.checked; toast(friendlyError(err), 'danger'); }
      });
      on(box, 'click', '[data-amounts]', (e, b) => openInstallmentAmounts(contractId, +b.dataset.amounts));
      on(box, 'change', '[data-late]', async (e, input) => {
        try { await contractsRepo.setInstallment(contractId, +input.dataset.late, { lateFlag: input.checked }); }
        catch (err) { input.checked = !input.checked; toast(friendlyError(err), 'danger'); }
      });
      on(foot, 'click', '[data-print]', () => printStatement(find()));
      on(foot, 'change', '[data-match-file]', async (e, input) => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const label = input.closest('[data-match]');
        label.classList.add('is-busy');
        try {
          const r = await importEjarPdf(file);
          if (!r.ok) { toast(IMPORT_ERRORS[r.reason] || 'تعذر قراءة الملف', 'warning', 5000); return; }
          openReconcile(contractId, r);
        } finally { label.classList.remove('is-busy'); }
      });
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

const METHODS = ['تحويل بنكي', 'نقدي', 'مدى', 'سداد', 'شيك', 'أخرى'];

/** نافذة المبالغ: المسدد (كامل/جزئي)، الإعفاء، الخصم، والمتبقي — تتحدث لحظياً */
export function openInstallmentAmounts(contractId, index) {
  const find = () => {
    const c = store.get('contracts').find((x) => x.id === contractId);
    return c ? { c, inst: c.installments.find((x) => x._index === index) } : {};
  };
  if (!find().inst) return;
  let unsub = null;

  openModal({
    title: 'مبالغ الدفعة',
    size: 'md',
    body: html`<div data-amt></div>`,
    footer: html`<button class="btn btn-ghost" data-close>إغلاق</button>`,
    onClose: () => unsub?.(),
    onMount(el, close) {
      const box = el.querySelector('[data-amt]');
      const render = () => {
        const { c, inst } = find();
        if (!inst) { close(); return; }
        el.querySelector('.modal-head h2').textContent = `الدفعة #${inst.n} — ${c.brandName}`;
        const canPay = can.pay() && inst.remaining > 0;
        setHTML(box, html`
          <div class="amt-summary">
            <div><span>قيمة الدفعة</span><strong class="num">${money(inst.amount)}</strong><small class="muted">استحقاق ${formatDate(inst.dueDate)}</small></div>
            <div><span>المسدد</span><strong class="num text-success">${money(inst.paidAmount)}</strong></div>
            <div><span>الإعفاء</span><strong class="num">${money(inst.waived)}</strong></div>
            <div><span>الخصم</span><strong class="num">${money(inst.discount)}</strong></div>
            <div class="amt-remaining ${inst.remaining ? '' : 'is-zero'}"><span>المتبقي</span><strong class="num">${money(inst.remaining)}</strong></div>
          </div>
          ${inst.overpaid ? html`<p class="hint text-danger">${icon('alert', 14)} المبالغ المسجلة تزيد عن المطلوب بمقدار ${money(inst.overpaid)}</p>` : ''}
          ${inst.adjNote ? html`<div class="note-box">${icon('info', 16)}<div><strong class="note-title">سبب الإعفاء / الخصم</strong><p>${inst.adjNote}</p></div></div>` : ''}

          <h3 class="amt-title">${icon('check', 16)} المبالغ المسجلة</h3>
          ${inst.payments.length ? html`
            <ul class="pay-list">${inst.payments.map((p) => html`
              <li>
                <div class="pay-main"><strong class="num">${money(p.amount)}</strong><span class="muted small num">${formatDate(p.date)}${p.method ? ` · ${p.method}` : ''}</span>
                  ${p.note || p.by ? html`<small class="muted">${p.note}${p.note && p.by ? ' — ' : ''}${p.by ? `بواسطة ${p.by}` : ''}</small>` : ''}</div>
                <button class="icon-btn" data-receipt="${p.id}" title="سند قبض">${icon('printer', 16)}</button>
                ${can.pay() ? html`<button class="icon-btn text-danger" data-del-pay="${p.id}" title="حذف">${icon('trash', 16)}</button>` : ''}
              </li>`)}</ul>`
            : html`<p class="muted small">${inst.paid && !inst.paidAmount ? 'الدفعة مُسوّاة بالإعفاء/الخصم.' : inst.paid ? 'مسددة (سُجلت قبل تفعيل تسجيل المبالغ).' : 'لم يُسجل أي مبلغ بعد.'}</p>`}

          ${canPay ? html`
            <form class="amt-form" data-pay-form novalidate>
              <h3 class="amt-title">${icon('plus', 16)} تسجيل مبلغ مسدد</h3>
              <div class="grid-2">
                <label class="field"><span>المبلغ</span><input class="input num" name="amount" inputmode="decimal" value="${inst.remaining}" required></label>
                <label class="field"><span>تاريخ السداد</span><input class="input" type="date" name="date" value="${todayISO()}" required></label>
                <label class="field"><span>طريقة الدفع</span><select class="input" name="method">${METHODS.map((m) => html`<option>${m}</option>`)}</select></label>
                <label class="field"><span>ملاحظة (اختياري)</span><input class="input" name="note" maxlength="200" placeholder="رقم الحوالة أو الشيك…"></label>
              </div>
              <div><button class="btn btn-primary" data-add-pay>${icon('check', 16)} تسجيل المبلغ</button></div>
            </form>` : ''}

          ${can.admin() ? html`
            <form class="amt-form" data-adj-form novalidate>
              <h3 class="amt-title">${icon('edit', 16)} الإعفاء والخصم</h3>
              <div class="grid-2">
                <label class="field"><span>المبلغ المعفى عنه</span><input class="input num" name="waived" inputmode="decimal" value="${inst.waived || ''}" placeholder="0"></label>
                <label class="field"><span>المبلغ المخصوم</span><input class="input num" name="discount" inputmode="decimal" value="${inst.discount || ''}" placeholder="0"></label>
              </div>
              <label class="field"><span>السبب</span><input class="input" name="adjNote" maxlength="300" value="${inst.adjNote}" placeholder="مثال: إعفاء فترة التجهيز، خصم مقابل صيانة…"></label>
              <div><button class="btn btn-subtle" data-save-adj>${icon('check', 16)} حفظ الإعفاء والخصم</button></div>
            </form>` : ''}`);
      };
      render();
      unsub = store.on('contracts', render);

      on(box, 'click', '[data-add-pay]', (e, btn) => {
        e.preventDefault();
        withBusy(btn, async () => {
          const form = box.querySelector('[data-pay-form]');
          const v = formValues(form);
          const { inst } = find();
          const amount = toNumber(v.amount);
          const errors = {};
          if (Number.isNaN(amount) || amount <= 0) errors.amount = 'أدخل مبلغاً صحيحاً';
          else if (round2(amount) > inst.remaining) errors.amount = `المبلغ أكبر من المتبقي (${money(inst.remaining)})`;
          if (!v.date) errors.date = 'اختر التاريخ';
          showFieldErrors(form, errors);
          if (Object.keys(errors).length) return;
          try {
            await contractsRepo.addPayment(contractId, index, { amount: round2(amount), date: v.date, method: v.method, note: v.note });
            toast('تم تسجيل المبلغ');
          } catch (err) { toast(friendlyError(err), 'danger'); }
        });
      });
      on(box, 'click', '[data-del-pay]', async (e, b) => {
        const { inst } = find();
        const p = inst.payments.find((x) => x.id === b.dataset.delPay);
        if (!p || !(await confirmDialog({ title: 'حذف مبلغ', message: `حذف المبلغ ${money(p.amount)} بتاريخ ${formatDate(p.date)}؟`, confirmText: 'حذف', danger: true }))) return;
        try { await contractsRepo.removePayment(contractId, index, p.id); toast('تم حذف المبلغ'); }
        catch (err) { toast(friendlyError(err), 'danger'); }
      });
      on(box, 'click', '[data-receipt]', (e, b) => {
        const { c, inst } = find();
        const p = inst.payments.find((x) => x.id === b.dataset.receipt);
        if (p) printReceipt(c, inst, p);
      });
      on(box, 'click', '[data-save-adj]', (e, btn) => {
        e.preventDefault();
        withBusy(btn, async () => {
          const form = box.querySelector('[data-adj-form]');
          const v = formValues(form);
          const { inst } = find();
          const waived = v.waived === '' ? 0 : toNumber(v.waived);
          const discount = v.discount === '' ? 0 : toNumber(v.discount);
          const errors = {};
          if (Number.isNaN(waived) || waived < 0) errors.waived = 'قيمة غير صحيحة';
          if (Number.isNaN(discount) || discount < 0) errors.discount = 'قيمة غير صحيحة';
          if (!errors.waived && !errors.discount && round2(waived + discount) > inst.amount) errors.discount = 'مجموع الإعفاء والخصم أكبر من قيمة الدفعة';
          if (!errors.waived && !errors.discount && round2(waived + discount + inst.paidAmount) > inst.amount) errors.discount = `مع المسدد (${money(inst.paidAmount)}) يتجاوز المجموع قيمة الدفعة`;
          if ((waived || discount) && !v.adjNote) errors.adjNote = 'اكتب السبب';
          showFieldErrors(form, errors);
          if (Object.keys(errors).length) return;
          try { await contractsRepo.setAdjustment(contractId, index, { waived, discount, adjNote: v.adjNote }); toast('تم الحفظ'); }
          catch (err) { toast(friendlyError(err), 'danger'); }
        });
      });
    },
  });
}

const fieldVal = (key, v) => (v === '' || v == null ? '—' : /Date$/.test(key) ? formatDate(v) : key === 'area' ? `${v} م²` : v);

const statusLine = (list) => {
  const paid = list.filter((i) => i.paid).length;
  const partial = list.filter((i) => i.partial).length;
  const late = list.filter((i) => i.lateFlag).length;
  return [`${paid} مسددة`, partial ? `${partial} مسددة جزئياً` : '', late ? `${late} معلّمة متعثرة` : ''].filter(Boolean).join('، ');
};

/** نافذة مطابقة العقد مع ملف عقد إيجار — تصحيح التواريخ والمبالغ دون المساس بحالات السداد */
export function openReconcile(contractId, imported) {
  const contract = store.get('contracts').find((c) => c.id === contractId);
  if (!contract) return;
  const res = reconcileContract(contract, imported.data);
  const warnings = imported.warnings.filter((w) => !w.includes('يوجد عقد مسجل مسبقاً'));
  const kindLabel = { same: ['مطابقة', 'success'], changed: ['سيتم تصحيحها', 'warning'], new: ['دفعة جديدة', 'info'], removed: ['ستُحذف (غير مسددة)', 'neutral'], orphan: ['لا تقابلها دفعة', 'danger'] };
  const cell = (oldV, newV, same, fmt = (x) => x) => (same ? html`<span class="num">${fmt(oldV)}</span>` : html`<span class="num muted strike">${oldV === '' || oldV == null ? '—' : fmt(oldV)}</span><span class="num text-warning block">${fmt(newV)}</span>`);
  const stateOf = (i) => (i ? STATE_META[installmentState(i)] : null);
  const annualAfter = buildReconciledRecord(contract, imported.data, res).annualRent;

  openModal({
    title: 'مطابقة مع عقد إيجار',
    subtitle: `${contract.brandName} — ${imported.source}`,
    size: 'lg',
    body: html`
      <div class="rec-top ${res.blockers.length ? 'is-bad' : res.changed ? 'is-warn' : 'is-ok'}">
        ${icon(res.blockers.length ? 'alert' : res.changed ? 'info' : 'check', 20)}
        <div>
          <strong>${res.blockers.length ? 'لا يمكن التصحيح التلقائي' : res.changed ? 'توجد اختلافات بين المنصة وملف العقد' : 'العقد مطابق لملف عقد إيجار ✓'}</strong>
          <p>${icon('shield', 14)} حالات السداد محفوظة: ${statusLine(contract.installments)} — وتبقى كما هي بعد التصحيح. لا يتغير أي سداد أو إعفاء أو خصم.</p>
        </div>
      </div>
      ${res.blockers.length ? html`<ul class="rec-blockers">${res.blockers.map((b) => html`<li>${icon('alert', 14)} ${b}</li>`)}</ul>` : ''}
      ${warnings.length ? html`<ul class="rec-blockers is-warn">${warnings.map((w) => html`<li>${icon('info', 14)} ${w}</li>`)}</ul>` : ''}

      <h3 class="amt-title">${icon('file', 16)} بيانات العقد</h3>
      <div class="table-wrap"><table class="table table-compact">
        <thead><tr><th>البيان</th><th>في المنصة</th><th>في ملف العقد</th><th></th></tr></thead>
        <tbody>${res.fields.map((f) => html`<tr>
          <td>${f.label}${f.optional ? html` <small class="muted">(اختياري)</small>` : ''}</td>
          <td class="num"><bdi>${fieldVal(f.key, f.current)}</bdi></td><td class="num"><bdi>${fieldVal(f.key, f.pdf)}</bdi></td>
          <td>${f.same ? html`<span class="chip chip-success">مطابق</span>` : html`<span class="chip chip-warning">مختلف</span>`}</td></tr>`)}</tbody>
      </table></div>
      ${res.optionalChanged ? html`<label class="check-row"><input type="checkbox" data-opt> تحديث بيانات المستأجر ورقم المحل والمساحة أيضاً من ملف العقد</label>` : ''}

      <h3 class="amt-title">${icon('calendar', 16)} جدول الدفعات</h3>
      <div class="table-wrap"><table class="table table-compact rec-table">
        <thead><tr><th>#</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>الضريبة</th><th>حالة السداد (تبقى كما هي)</th><th>النتيجة</th></tr></thead>
        <tbody>${res.rows.map((r, k) => {
          const st = stateOf(r.old);
          const [kl, kt] = kindLabel[r.kind];
          return html`<tr class="rec-${r.kind}">
            <td class="num">${r.pdf ? k + 1 : '—'}</td>
            <td>${r.old && r.pdf ? cell(r.old.dueDate, r.pdf.dueDate, r.old.dueDate === r.pdf.dueDate, formatDate) : r.pdf ? html`<span class="num">${formatDate(r.pdf.dueDate)}</span>` : html`<span class="num muted">${formatDate(r.old.dueDate)}</span>`}</td>
            <td>${r.old && r.pdf ? cell(r.old.amount, r.pdf.amount, Math.abs(r.old.amount - r.pdf.amount) < 0.01, money) : html`<span class="num">${money((r.pdf || r.old).amount)}</span>`}</td>
            <td>${r.old && r.pdf ? cell(r.old.vat, r.pdf.vat, Math.abs(r.old.vat - r.pdf.vat) < 0.01, money) : html`<span class="num">${money((r.pdf || r.old).vat)}</span>`}</td>
            <td>${st ? html`<span class="badge badge-${st.tone}">${st.label}</span>${r.old.paidAmount && !r.old.paid ? html`<small class="muted block num">مسدد ${money(r.old.paidAmount)}</small>` : ''}` : html`<span class="muted">—</span>`}</td>
            <td><span class="chip chip-${kt}">${kl}</span></td></tr>`;
        })}</tbody>
      </table></div>
      ${res.changed && !res.blockers.length ? html`<p class="hint">${icon('info', 14)} بعد التصحيح: الإيجار السنوي <b class="num">${money(annualAfter)}</b> (الحالي ${money(contract.annualRent)})، وطريقة الدفع تصبح "يدوية" حسب جدول عقد إيجار.</p>` : ''}`,
    footer: html`
      ${(res.changed || res.optionalChanged) && !res.blockers.length ? html`<button class="btn btn-primary" data-apply ${res.changed ? '' : 'hidden'}>${icon('check', 18)} تطبيق التصحيحات</button>` : ''}
      <button class="btn btn-ghost" data-close>${res.changed ? 'إلغاء' : 'إغلاق'}</button>`,
    onMount(el, close) {
      // إذا كان الاختلاف في البيانات الاختيارية فقط، يظهر زر التطبيق عند اختيار تحديثها
      el.querySelector('[data-opt]')?.addEventListener('change', (e) => { const b = el.querySelector('[data-apply]'); if (b && !res.changed) b.hidden = !e.target.checked; });
      el.querySelector('[data-apply]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const includeOptional = !!el.querySelector('[data-opt]')?.checked;
        const fresh = store.get('contracts').find((c) => c.id === contractId);
        const again = reconcileContract(fresh, imported.data);
        if (again.blockers.length || again.after < again.before) { toast('تغيّرت بيانات العقد — أعد المطابقة', 'warning'); close(); return; }
        const record = buildReconciledRecord(fresh, imported.data, again, { includeOptional, actor: actorName() });
        try { await contractsRepo.save(contractId, record); toast('تم تصحيح العقد مع الإبقاء على حالات السداد'); close(); }
        catch (err) { toast(friendlyError(err), 'danger'); }
      }));
    },
  });
}

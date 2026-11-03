/**
 * نموذج إضافة / تعديل عقد (نافذة منبثقة).
 */
import { APP_CONFIG } from '../config/app.config.js';
import { store, actorName } from '../core/store.js';
import { html, setHTML, formValues, on } from '../utils/dom.js';
import { contractEndDate, formatDate, todayISO, addMonths, addDays, diffDays, isValidISODate, yearsBetween, periodText } from '../utils/dates.js';
import { money, toNumber, round2 } from '../utils/numbers.js';
import { buildContract, computeAnnualRent } from '../domain/contracts.js';
import { generateSchedule, settledCounts } from '../domain/installments.js';
import { contractsRepo } from '../services/repositories.js';
import { friendlyError } from '../services/errors.js';
import { openModal, toast, withBusy, showFieldErrors, confirmDialog } from '../components/overlay.js';
import { options } from '../components/ui.js';
import { categorySelect } from '../components/categories.js';
import { icon } from '../components/icons.js';

const durations = Array.from({ length: APP_CONFIG.maxDurationYears }, (_, i) => ({ id: i + 1, label: `${i + 1} ${i === 0 ? 'سنة' : i === 1 ? 'سنتان' : i < 10 ? 'سنوات' : 'سنة'}` }));

/**
 * prefill: بيانات جاهزة لعقد جديد (مثل المستخرجة من ملف عقد إيجار PDF)
 * importInfo: { source, warnings[] } تُعرض أعلى النموذج
 */
export function openContractForm(existing = null, { presetCenterId = '', prefill = null, importInfo = null } = {}) {
  const blank = {
    centerId: presetCenterId || store.get('centers')[0]?.id || '', shopNumber: '', shopStatus: 'leased_open', brandName: '',
    category: '', isBrand: false, tenantName: '', tenantPhone: '', area: '', annualRent: '',
    startDate: todayISO(), durationYears: 1, endDate: contractEndDate(todayISO(), 1), paymentType: 'annual', notes: '', violations: '', ejarNo: '', installments: [],
  };
  const c = existing || { ...blank, ...(prefill || {}) };
  let manualRows = c.installments?.length
    ? c.installments.map((i) => ({ dueDate: i.dueDate, amount: String(i.amount), vat: i.vat ? String(i.vat) : '' }))
    : [{ dueDate: c.startDate || '', amount: '', vat: '' }, { dueDate: '', amount: '', vat: '' }];

  const centers = store.get('centers');
  if (!centers.length) { toast('أضف مركزاً تجارياً أولاً من صفحة المراكز', 'warning'); return; }

  const body = html`
    <form class="contract-form" novalidate>
      ${importInfo ? html`
        <div class="import-banner">
          ${icon('file', 18)}
          <div>
            <strong>تم استخراج البيانات من ${importInfo.source}</strong>
            <p>راجع البيانات، ثم أدخل <b>اسم البراند</b> و<b>التصنيف</b> واختر المركز التجاري — هذه غير موجودة في عقد إيجار.</p>
            ${importInfo.warnings?.length ? html`<ul>${importInfo.warnings.map((w) => html`<li>${icon('alert', 13)} ${w}</li>`)}</ul>` : ''}
          </div>
        </div>` : ''}
      <fieldset class="form-section">
        <legend>${icon('store', 16)} الوحدة</legend>
        <div class="grid-3">
          <label class="field"><span>المركز التجاري</span><select class="input" name="centerId" required>${options(centers, c.centerId, { labelKey: 'name' })}</select></label>
          <label class="field"><span>رقم المحل</span><input class="input" name="shopNumber" value="${c.shopNumber}" inputmode="numeric" placeholder="مثال: 102" required></label>
          <label class="field"><span>المساحة (م²)</span><input class="input num" name="area" value="${c.area || ''}" inputmode="decimal" placeholder="150"></label>
        </div>
        <div class="field"><span>حالة المحل</span>
          <div class="segmented" role="radiogroup">
            ${APP_CONFIG.shopStatuses.map((s) => html`<label class="seg seg-${s.tone}"><input type="radio" name="shopStatus" value="${s.id}" ${c.shopStatus === s.id ? 'checked' : ''}><span>${s.label}</span></label>`)}
          </div>
        </div>
      </fieldset>

      <fieldset class="form-section">
        <legend>${icon('sparkle', 16)} النشاط والمستأجر</legend>
        <div class="grid-3">
          <label class="field"><span>اسم النشاط / البراند</span><input class="input" name="brandName" value="${c.brandName}" placeholder="مثال: مطابع السروات" required></label>
          <label class="field"><span>التصنيف</span>${categorySelect(c.category)}</label>
          <label class="field field-inline"><span>علامة تجارية معروفة (براند)</span>
            <span class="switch"><input type="checkbox" name="isBrand" ${c.isBrand ? 'checked' : ''}><i></i></span></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>اسم المستأجر</span><input class="input" name="tenantName" value="${c.tenantName}" placeholder="الاسم الكامل" required></label>
          <label class="field"><span>جوال المستأجر</span><input class="input num" name="tenantPhone" value="${c.tenantPhone}" inputmode="tel" dir="ltr" placeholder="05XXXXXXXX" required></label>
        </div>
      </fieldset>

      <fieldset class="form-section">
        <legend>${icon('calendar', 16)} العقد والدفعات</legend>
        <div class="grid-3">
          <label class="field" data-fixed><span>الإيجار السنوي (${APP_CONFIG.currency})</span><input class="input num" name="annualRent" value="${c.annualRent || ''}" inputmode="decimal" placeholder="175000" required></label>
          <label class="field"><span>تاريخ بداية العقد</span><input class="input" type="date" name="startDate" value="${c.startDate}" required></label>
          <label class="field" data-fixed><span>مدة العقد</span><select class="input" name="durationYears">${options(durations, Math.min(APP_CONFIG.maxDurationYears, Math.max(1, Math.round(c.durationYears))))}</select></label>
          <label class="field" data-manual-only hidden><span>تاريخ نهاية العقد</span><input class="input" type="date" name="endDate" value="${c.endDate || ''}"></label>
        </div>
        <label class="field field-narrow"><span>رقم العقد في منصة إيجار (اختياري)</span><input class="input num" name="ejarNo" value="${c.ejarNo || ''}" maxlength="40" dir="ltr" placeholder="20383047848 / 2-0"></label>
        <div class="field"><span>طريقة الدفع</span>
          <div class="segmented wrap" role="radiogroup">
            ${APP_CONFIG.paymentTypes.map((p) => html`<label class="seg"><input type="radio" name="paymentType" value="${p.id}" ${c.paymentType === p.id ? 'checked' : ''}><span>${p.label}</span></label>`)}
          </div>
        </div>
        <div class="schedule-preview" data-preview></div>
        <div class="manual-box" data-manual hidden></div>
      </fieldset>

      <fieldset class="form-section">
        <legend>${icon('file', 16)} الملاحظات والمخالفات</legend>
        <div class="grid-2">
          <label class="field"><span>الملاحظات</span><textarea class="input" name="notes" rows="3" maxlength="2000" placeholder="أي تفاصيل إضافية عن العقد">${c.notes || ''}</textarea></label>
          <label class="field"><span>المخالفات</span><textarea class="input" name="violations" rows="3" maxlength="2000" placeholder="سجّل أي مخالفات على المستأجر أو المحل">${c.violations || ''}</textarea></label>
        </div>
      </fieldset>
    </form>`;

  openModal({
    title: existing ? 'تعديل العقد' : 'عقد إيجار جديد',
    subtitle: existing ? `${existing.brandName} — محل ${existing.shopNumber}` : 'أدخل بيانات الوحدة والمستأجر وسيتم توليد جدول الدفعات تلقائياً',
    size: 'lg',
    body,
    footer: html`<button class="btn btn-primary" data-save>${icon('check', 18)} ${existing ? 'حفظ التعديلات' : 'حفظ العقد'}</button><button class="btn btn-ghost" data-close>إلغاء</button>`,
    dismissible: false,
    onMount(el, close) {
      const form = el.querySelector('form');
      const preview = el.querySelector('[data-preview]');
      const manualBox = el.querySelector('[data-manual]');

      /** ملخص الدفعات اليدوية: المجموع والإيجار السنوي المحسوب من مدة العقد */
      const manualCalc = () => {
        const v = formValues(form);
        const rows = manualRows.map((r) => ({ amount: toNumber(r.amount) || 0, vat: toNumber(r.vat) || 0 }));
        const total = round2(rows.reduce((s, r) => s + r.amount, 0));
        const vat = round2(rows.reduce((s, r) => s + r.vat, 0));
        const years = yearsBetween(v.startDate, v.endDate);
        const annual = computeAnnualRent(rows, v.startDate, v.endDate);
        return { total, vat, years, annual, period: periodText(v.startDate, v.endDate) };
      };
      const manualSummary = () => {
        const m = manualCalc();
        if (!(m.years > 0)) return html`<div class="calc-box calc-warn">${icon('alert', 16)} حدد تاريخ بداية ونهاية صحيحين ليتم حساب الإيجار السنوي</div>`;
        return html`
          <div class="calc-box">
            <div><span>مجموع الدفعات</span><strong class="num">${money(m.total)}</strong>${m.vat ? html`<small class="muted">منها ضريبة ${money(m.vat)}</small>` : ''}</div>
            <div><span>مدة العقد</span><strong>${m.period}</strong></div>
            <div class="calc-main"><span>الإيجار السنوي المحسوب${m.vat ? ' (بدون الضريبة)' : ''}</span><strong class="num">${m.annual ? money(m.annual) : '—'}</strong></div>
          </div>`;
      };
      const updateManualSummary = () => { const box = manualBox.querySelector('[data-msum]'); if (box) setHTML(box, manualSummary()); };

      const renderManual = () => {
        setHTML(manualBox, html`
          <div class="manual-head"><strong>الدفعات اليدوية</strong><span class="muted small">تواريخ الدفعات = مواعيد الاستحقاق فقط، والإيجار السنوي يُحسب من مجموعها ومدة العقد</span></div>
          <div data-msum>${manualSummary()}</div>
          <div class="manual-rows" data-error-slot="manual">
            ${manualRows.map((r, i) => html`
              <div class="manual-row">
                <span class="manual-n">${i + 1}</span>
                <input class="input" type="date" data-mi="${i}" data-mk="dueDate" value="${r.dueDate}" aria-label="تاريخ الدفعة ${i + 1}">
                <input class="input num" data-mi="${i}" data-mk="amount" value="${r.amount}" inputmode="decimal" placeholder="المبلغ" aria-label="مبلغ الدفعة ${i + 1}">
                <input class="input num manual-vat" data-mi="${i}" data-mk="vat" value="${r.vat || ''}" inputmode="decimal" placeholder="منها ضريبة" aria-label="ضريبة الدفعة ${i + 1}" title="ضريبة القيمة المضافة ضمن المبلغ (اختياري)">
                <button type="button" class="icon-btn" data-remove="${i}" aria-label="حذف" ${manualRows.length < 2 ? 'disabled' : ''}>${icon('trash', 16)}</button>
              </div>`)}
          </div>
          <div class="manual-actions">
            <button type="button" class="btn btn-subtle btn-sm" data-add-row>${icon('plus', 16)} إضافة دفعة</button>
            ${manualRows.length > 1 ? html`<button type="button" class="btn btn-ghost btn-sm" data-split>توزيع التواريخ بالتساوي على مدة العقد</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-vat15 title="يحسب الضريبة لكل دفعة على أن المبالغ شاملة 15٪">المبالغ شاملة ضريبة 15٪</button>
          </div>`);
      };

      const refresh = () => {
        const v = formValues(form);
        const isManual = v.paymentType === 'manual';
        manualBox.hidden = !isManual;
        form.querySelectorAll('[data-fixed]').forEach((f) => { f.hidden = isManual; });
        form.querySelectorAll('[data-manual-only]').forEach((f) => { f.hidden = !isManual; });
        const end = contractEndDate(v.startDate, Number(v.durationYears) || 1);
        if (isManual) {
          if (!form.endDate.value && isValidISODate(v.startDate)) form.endDate.value = end;
          renderManual();
          setHTML(preview, html`<div class="preview-line">${icon('calendar', 16)} ينتهي العقد في <strong class="num">${formatDate(form.endDate.value, { long: true })}</strong></div>`);
          return;
        }
        const rent = toNumber(v.annualRent);
        const sched = Number.isNaN(rent) ? [] : generateSchedule({ startDate: v.startDate, durationYears: v.durationYears, paymentType: v.paymentType, annualRent: rent });
        setHTML(preview, html`
          <div class="preview-line">${icon('calendar', 16)} ينتهي العقد في <strong class="num">${formatDate(end, { long: true })}</strong></div>
          ${sched.length ? html`<div class="preview-line">${icon('wallet', 16)} <strong class="num">${sched.length}</strong> دفعة × <strong class="num">${money(sched[0].amount)}</strong> — إجمالي العقد <strong class="num">${money(rent * (Number(v.durationYears) || 1))}</strong></div>` : ''}`);
      };

      form.addEventListener('input', (e) => {
        if (e.target.dataset.mi !== undefined) {
          manualRows[+e.target.dataset.mi][e.target.dataset.mk] = e.target.value;
          updateManualSummary();
          return;
        }
        refresh();
      });
      form.addEventListener('change', (e) => { if (e.target.dataset.mi === undefined) refresh(); });
      on(manualBox, 'click', '[data-add-row]', () => {
        const last = manualRows[manualRows.length - 1];
        manualRows.push({ dueDate: last?.dueDate ? addMonths(last.dueDate, 1) : '', amount: '', vat: '' });
        renderManual();
      });
      on(manualBox, 'click', '[data-vat15]', () => {
        manualRows.forEach((r) => { const a = toNumber(r.amount); r.vat = a > 0 ? String(round2((a * 15) / 115)) : ''; });
        renderManual();
      });
      on(manualBox, 'click', '[data-remove]', (e, btn) => { manualRows.splice(+btn.dataset.remove, 1); renderManual(); });
      on(manualBox, 'click', '[data-split]', () => {
        // يوزّع تواريخ الاستحقاق بالتساوي من بداية العقد (المبالغ تبقى كما أدخلتها)
        const v = formValues(form);
        if (!isValidISODate(v.startDate) || !isValidISODate(v.endDate)) { toast('حدد تاريخ البداية والنهاية أولاً', 'warning'); return; }
        const n = manualRows.length;
        const totalMonths = Math.round(yearsBetween(v.startDate, v.endDate) * 12);
        const step = totalMonths >= n ? totalMonths / n : 0;
        const daysStep = step ? 0 : Math.floor((diffDays(v.startDate, v.endDate) + 1) / n);
        manualRows.forEach((r, i) => { r.dueDate = step ? addMonths(v.startDate, Math.round(step * i)) : addDays(v.startDate, daysStep * i); });
        renderManual();
      });

      refresh();

      el.querySelector('[data-save]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const v = formValues(form);
        const { errors: e1, record: r1 } = buildContract(v, { manualRows, existing, actor: actorName() });
        let errors = e1; let record = r1;
        if (!v.category) { errors = { ...(errors || {}), category: 'اختر التصنيف' }; record = null; }
        if (record && !existing && v.ejarNo && store.get('contracts').some((x) => x.ejarNo && x.ejarNo === v.ejarNo.trim())) {
          const ok = await confirmDialog({ title: 'عقد مكرر؟', message: `يوجد عقد مسجل بنفس رقم عقد إيجار (${v.ejarNo}). هل تريد حفظه مرة أخرى؟`, confirmText: 'حفظ على أي حال' });
          if (!ok) return;
        }
        if (errors) { showFieldErrors(form, errors); toast('تحقق من الحقول المظللة', 'warning'); return; }
        showFieldErrors(form, {});

        if (existing) {
          const counts = settledCounts(existing.installments, record.installments);
          const changed = record.installments.length !== existing.installments.length
            || record.installments.some((x, i) => x.dueDate !== existing.installments[i]?.dueDate || x.amount !== existing.installments[i]?.amount);
          if (counts.lost) {
            const ok = await confirmDialog({
              title: '⚠️ ستفقد حالات سداد',
              message: `هذا التعديل سيحذف ${counts.lost} دفعة مسددة (أو عليها مبالغ/إعفاء/خصم) لأن صفوفها لم تعد موجودة في الجدول. قبل التعديل: ${counts.before} — بعده: ${counts.after}. هل أنت متأكد؟`,
              confirmText: 'نعم، احفظ', danger: true,
            });
            if (!ok) return;
          } else if (counts.before && changed) {
            const ok = await confirmDialog({
              title: 'تغيير جدول الدفعات',
              message: `سيتم تحديث جدول الدفعات مع الإبقاء على حالات السداد (${counts.before} دفعة مسددة تبقى كما هي — تُربط بتاريخ استحقاقها). متابعة؟`,
              confirmText: 'متابعة',
            });
            if (!ok) return;
          }
        }

        try {
          if (existing) await contractsRepo.save(existing.id, record);
          else await contractsRepo.create(record);
          toast(existing ? 'تم حفظ التعديلات' : 'تم حفظ العقد بنجاح');
          close();
        } catch (err) {
          toast(friendlyError(err), 'danger');
        }
      }));
    },
  });
}

/**
 * مطابقة عقد مسجّل في المنصة مع ملف عقد إيجار PDF.
 *
 * القاعدة الذهبية: حالات السداد لا تتغير أبداً.
 * كل دفعة في المنصة تُربط بدفعة في ملف العقد، وتنتقل إليها حالتها كما هي
 * (مسددة، المبالغ المسجلة، الإعفاء، الخصم، التعثر، تاريخ ومن سجّل السداد).
 * تُصحّح فقط التواريخ والمبالغ والضريبة من ملف العقد.
 * إذا كانت هناك دفعة مسددة لا يقابلها شيء في ملف العقد → نمنع التطبيق ونوضح السبب.
 */
import { normalizeInstallments } from './installments.js';
import { computeAnnualRent, stripInternal } from './contracts.js';
import { diffDays, yearsBetween } from '../utils/dates.js';
import { round2 } from '../utils/numbers.js';

const hasStatus = (i) => i.paid || i.paidAmount > 0 || i.waived > 0 || i.discount > 0 || i.lateFlag;
const settled = (i) => i.paid || i.paidAmount > 0 || i.waived > 0 || i.discount > 0;
const sameMoney = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;

/** ربط الدفعات: بنفس الترتيب إذا تساوى العدد، وإلا بأقرب تاريخ (حتى 45 يوماً) */
function pairRows(oldRows, pdfRows) {
  const pairs = pdfRows.map(() => null);
  if (oldRows.length === pdfRows.length) return pdfRows.map((_, i) => oldRows[i]);
  const cand = [];
  oldRows.forEach((o, oi) => pdfRows.forEach((p, pi) => {
    const d = Math.abs(diffDays(o.dueDate, p.dueDate));
    if (Number.isFinite(d) && d <= 45) cand.push({ oi, pi, d });
  }));
  cand.sort((a, b) => a.d - b.d);
  const usedO = new Set();
  cand.forEach(({ oi, pi }) => { if (!pairs[pi] && !usedO.has(oi)) { pairs[pi] = oldRows[oi]; usedO.add(oi); } });
  return pairs;
}

/**
 * contract: عقد موحّد (normalizeContract) — data: ناتج parseEjar().data
 * يعيد { fields, rows, blockers, merged, before, after, changed }
 */
export function reconcileContract(contract, data) {
  const oldRows = [...normalizeInstallments(contract.installments)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pdfRows = [...data.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pairs = pairRows(oldRows, pdfRows);
  const paired = new Set(pairs.filter(Boolean));

  const rows = [];
  const rawMerged = pdfRows.map((p, i) => {
    const o = pairs[i];
    const base = { n: i + 1, dueDate: p.dueDate, amount: round2(p.amount), vat: round2(p.vat || 0) };
    if (!o) {
      rows.push({ kind: 'new', pdf: base, old: null });
      return { ...base, paid: false, lateFlag: false };
    }
    const dateSame = o.dueDate === p.dueDate;
    const amountSame = sameMoney(o.amount, p.amount) && sameMoney(o.vat, p.vat);
    rows.push({ kind: dateSame && amountSame ? 'same' : 'changed', dateSame, amountSame, pdf: base, old: o });
    return {
      ...base,
      // الحالة تنتقل كما هي
      paid: !!o.paid && !o.payments.length ? true : o.paidFlag,
      lateFlag: !!o.lateFlag,
      paidAt: o.paidAt || null,
      paidBy: o.paidBy || null,
      payments: o.payments,
      waived: o.waived,
      discount: o.discount,
      adjNote: o.adjNote,
    };
  });

  const blockers = [];
  if (oldRows.length !== pdfRows.length && oldRows.some(settled)) {
    blockers.push(`عدد الدفعات في المنصة (${oldRows.length}) يختلف عن ملف العقد (${pdfRows.length}) وفيه دفعات مسددة — لا يمكن ربط السداد تلقائياً بأمان. عدّل جدول الدفعات يدوياً من "تعديل العقد"`);
  }
  oldRows.filter((o) => !paired.has(o)).forEach((o) => {
    rows.push({ kind: hasStatus(o) ? 'orphan' : 'removed', pdf: null, old: o });
    if (settled(o)) blockers.push(`الدفعة المسجلة بتاريخ ${o.dueDate} ${o.paid ? 'مسددة' : 'عليها مبالغ'} ولا يقابلها أي دفعة في ملف العقد — راجعها يدوياً`);
  });

  const merged = normalizeInstallments(rawMerged);
  // مبلغ الإعفاء والخصم لا يجوز أن يتجاوز قيمة الدفعة الجديدة
  merged.forEach((m, i) => {
    const o = pairs[i];
    if (o && (o.waived || o.discount) && (m.waived !== o.waived || m.discount !== o.discount)) {
      blockers.push(`الإعفاء/الخصم على الدفعة ${m.dueDate} أكبر من قيمتها في ملف العقد`);
    }
  });

  const before = oldRows.filter(settled).length;
  const after = merged.filter(settled).length;
  if (after < before && !blockers.length) blockers.push(`عدد الدفعات المسددة سيتغير (${before} ← ${after}) — لن يتم التطبيق`);

  const F = (key, label, current, pdf, opts = {}) => ({ key, label, current: current ?? '', pdf: pdf ?? '', same: String(current ?? '').trim() === String(pdf ?? '').trim() || !String(pdf ?? '').trim(), ...opts });
  const fields = [
    F('startDate', 'تاريخ بداية العقد', contract.startDate, data.startDate),
    F('endDate', 'تاريخ نهاية العقد', contract.endDate, data.endDate),
    F('ejarNo', 'رقم عقد إيجار', contract.ejarNo, data.ejarNo),
    F('tenantName', 'اسم المستأجر', contract.tenantName, data.tenantName, { optional: true }),
    F('tenantPhone', 'جوال المستأجر', contract.tenantPhone, data.tenantPhone, { optional: true }),
    F('shopNumber', 'رقم المحل', contract.shopNumber, data.shopNumber, { optional: true }),
    F('area', 'المساحة', contract.area || '', data.area || '', { optional: true }),
  ];
  const fieldsChanged = fields.some((f) => !f.same && !f.optional);
  const rowsChanged = rows.some((r) => r.kind !== 'same');
  return { fields, rows, blockers, merged, before, after, changed: fieldsChanged || rowsChanged, optionalChanged: fields.some((f) => !f.same && f.optional) };
}

/** السجل المحفوظ بعد تطبيق التصحيحات */
export function buildReconciledRecord(contract, data, result, { includeOptional = false, actor = '' } = {}) {
  const pick = (key) => {
    const f = result.fields.find((x) => x.key === key);
    if (!f || f.same) return contract[key];
    if (f.optional && !includeOptional) return contract[key];
    return f.pdf;
  };
  const startDate = pick('startDate');
  const endDate = pick('endDate');
  const installments = result.merged;
  const record = {
    centerId: contract.centerId,
    shopNumber: String(pick('shopNumber') || contract.shopNumber).slice(0, 20),
    shopStatus: contract.shopStatus,
    brandName: contract.brandName,
    category: contract.category,
    isBrand: !!contract.isBrand,
    tenantName: pick('tenantName'),
    tenantPhone: pick('tenantPhone'),
    area: Number(pick('area')) || 0,
    annualRent: computeAnnualRent(installments, startDate, endDate) || contract.annualRent,
    startDate,
    durationYears: Math.round(yearsBetween(startDate, endDate) * 10000) / 10000 || contract.durationYears,
    endDate,
    paymentType: 'manual',
    installments: installments.map(stripInternal),
    notes: contract.notes || '',
    violations: contract.violations || '',
    createdBy: contract.createdBy,
    createdAt: contract.createdAt || Date.now(),
    updatedBy: actor,
    updatedAt: Date.now(),
  };
  const ejarNo = pick('ejarNo');
  if (ejarNo) record.ejarNo = String(ejarNo).slice(0, 40);
  if (contract.legacyId) record.legacyId = contract.legacyId;
  return record;
}

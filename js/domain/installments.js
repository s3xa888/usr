/**
 * منطق جدولة الدفعات وحالاتها — بدون أي اعتماد على الواجهة أو Firebase
 * (يسهل اختباره ونقله لاحقاً إلى الخادم أو تطبيق الجوال).
 */
import { APP_CONFIG } from '../config/app.config.js';
import { addMonths, daysUntil, todayISO } from '../utils/dates.js';
import { round2 } from '../utils/numbers.js';

export const paymentTypeById = (id) => APP_CONFIG.paymentTypes.find((p) => p.id === id);

/**
 * يولّد جدول الدفعات. المبالغ تُحسب بالهللات ويُضاف فرق التقريب على آخر دفعة
 * حتى يطابق المجموع قيمة العقد تماماً.
 */
export function generateSchedule({ startDate, durationYears, paymentType, annualRent }) {
  const type = paymentTypeById(paymentType);
  if (!type || !type.perYear || !startDate) return [];
  const years = Number(durationYears) || 1;
  const count = Math.max(1, Math.round(type.perYear * years));
  const step = 12 / type.perYear;
  const totalHalalas = Math.round((Number(annualRent) || 0) * years * 100);
  const base = Math.floor(totalHalalas / count);
  const remainder = totalHalalas - base * count;

  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    dueDate: addMonths(startDate, Math.round(step * i)),
    amount: (base + (i === count - 1 ? remainder : 0)) / 100,
    paid: false,
    lateFlag: false,
  }));
}

/**
 * يحافظ على حالات السداد القديمة عند إعادة توليد الجدول (بحسب الترتيب):
 * المبالغ المسددة، الإعفاء، الخصم، والتعثر.
 */
export function carryOverStatuses(oldList, newList) {
  const old = normalizeInstallments(oldList);
  const used = new Set();
  // 1) نفس تاريخ الاستحقاق  2) نفس الترتيب (إذا تغيّر التاريخ فقط)
  const match = new Array(newList.length).fill(null);
  newList.forEach((inst, i) => {
    const k = old.findIndex((o, j) => !used.has(j) && o.dueDate === inst.dueDate);
    if (k >= 0) { match[i] = old[k]; used.add(k); }
  });
  newList.forEach((inst, i) => {
    if (match[i] || used.has(i) || !old[i]) return;
    if (newList.some((n) => n.dueDate === old[i].dueDate)) return; // تاريخه موجود في صف آخر
    match[i] = old[i]; used.add(i);
  });
  return newList.map((inst, i) => {
    const prev = match[i];
    if (!prev) return inst;
    return finalize({
      ...inst,
      paidFlag: prev.paidFlag,
      lateFlag: !!prev.lateFlag,
      payments: prev.payments,
      waived: prev.waived,
      discount: prev.discount,
      adjNote: prev.adjNote,
      paidAt: prev.paidAt,
      paidBy: prev.paidBy,
    });
  });
}

const cents = (n) => Math.round((Number(n) || 0) * 100);

/** المبالغ المسجلة لدفعة (مخزنة ككائن مفاتيحه معرّفات) → مصفوفة مرتبة */
function normalizePayments(raw) {
  if (!raw) return [];
  return Object.entries(raw)
    .filter(([, p]) => p && Number(p.amount) > 0)
    .map(([id, p]) => ({ id, amount: round2(p.amount), date: p.date || '', method: p.method || '', note: p.note || '', by: p.by || '', at: Number(p.at) || 0 }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.at - b.at);
}

/**
 * الحسابات المشتقة لكل دفعة:
 *  الصافي المطلوب = قيمة الدفعة − الإعفاء − الخصم
 *  المسدد        = مجموع المبالغ المسجلة (أو كامل الصافي للدفعات القديمة المعلّمة "مسددة")
 *  المتبقي       = الصافي المطلوب − المسدد
 *  paid          = تمت تسويتها بالكامل (المتبقي صفر)
 */
function finalize(x) {
  const payments = x.payments || [];
  const amountC = cents(x.amount);
  const waivedC = Math.min(cents(x.waived), amountC);
  const discountC = Math.min(cents(x.discount), amountC - waivedC);
  const netC = amountC - waivedC - discountC;
  const paidC = payments.length ? payments.reduce((s, p) => s + cents(p.amount), 0) : (x.paidFlag ? netC : 0);
  const remainingC = Math.max(0, netC - paidC);
  const settled = remainingC === 0;
  return {
    ...x,
    payments,
    waived: waivedC / 100,
    discount: discountC / 100,
    net: netC / 100,
    paidAmount: paidC / 100,
    overpaid: Math.max(0, paidC - netC) / 100,
    remaining: remainingC / 100,
    paid: settled,
    partial: !settled && paidC > 0,
  };
}

/** Firebase قد يعيد المصفوفة ككائن — نوحّد الشكل دائماً */
export function normalizeInstallments(list) {
  if (!list) return [];
  const isArr = Array.isArray(list);
  const entries = isArr ? list.map((x, i) => [i, x]) : Object.entries(list).map(([k, x]) => [Number(k), x]);
  return entries
    .filter(([, x]) => Boolean(x))
    .map(([idx, x], i) => finalize({
      n: Number(x.n) || i + 1,
      dueDate: x.dueDate || '',
      amount: round2(x.amount),
      vat: round2(x.vat),
      paidFlag: !!x.paid, // يُعتمد فقط للدفعات القديمة التي لا تحتوي مبالغ مسجلة
      lateFlag: !!x.lateFlag,
      paidAt: x.paidAt || null,
      paidBy: x.paidBy || null,
      payments: Array.isArray(x.payments) ? x.payments : normalizePayments(x.payments),
      waived: Number(x.waived) || 0,
      discount: Number(x.discount) || 0,
      adjNote: x.adjNote || '',
      _index: x._index ?? (Number.isFinite(idx) ? idx : i),
    }));
}

/** حالة الدفعة بعد إضافة/حذف مبلغ أو تعديل الإعفاء والخصم (لحساب علامة "مسددة") */
export function previewInstallment(inst, changes = {}) {
  const next = { ...inst, ...changes };
  // عند حذف كل المبالغ المسجلة لا نعتمد علامة "مسددة" القديمة
  if ('payments' in changes && !changes.payments.length) next.paidFlag = false;
  return finalize(next);
}

export const STATE_META = {
  paid: { label: 'مسددة', tone: 'success' },
  waived: { label: 'معفاة', tone: 'info' },
  partial: { label: 'مسددة جزئياً', tone: 'warning' },
  paid_late: { label: 'مسددة بتأخير', tone: 'warning' },
  late: { label: 'متعثرة', tone: 'danger' },
  overdue: { label: 'مستحقة', tone: 'danger' },
  due_today: { label: 'مستحقة اليوم', tone: 'warning' },
  upcoming: { label: 'قادمة', tone: 'info' },
};

export function installmentState(inst, today = todayISO()) {
  if (inst.paid) {
    if (inst.paidAmount === 0 && inst.net === 0 && inst.amount > 0) return 'waived';
    return inst.lateFlag ? 'paid_late' : 'paid';
  }
  if (inst.lateFlag) return 'late';
  if (inst.partial) return 'partial';
  const d = daysUntil(inst.dueDate, today);
  if (d < 0) return 'overdue';
  if (d === 0) return 'due_today';
  return 'upcoming';
}

/** دفعة غير مسددة وحلّ موعدها (أو عُلّمت متعثرة) */
export const isOutstanding = (inst, today = todayISO()) =>
  !inst.paid && (inst.lateFlag || daysUntil(inst.dueDate, today) <= 0);

export function nextUnpaid(installments) {
  return normalizeInstallments(installments)
    .filter((i) => !i.paid)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;
}

export function scheduleSummary(installments, today = todayISO()) {
  const list = normalizeInstallments(installments);
  const sum = (arr, f = (i) => i.amount) => round2(arr.reduce((s, i) => s + f(i), 0));
  const paid = list.filter((i) => i.paid);
  const outstanding = list.filter((i) => isOutstanding(i, today));
  const upcoming = list.filter((i) => !i.paid && !isOutstanding(i, today));
  return {
    count: list.length,
    total: sum(list),
    paidCount: paid.length,
    paidTotal: sum(list, (i) => i.paidAmount),
    waivedTotal: sum(list, (i) => i.waived),
    discountTotal: sum(list, (i) => i.discount),
    vatTotal: sum(list, (i) => i.vat),
    partialCount: list.filter((i) => i.partial).length,
    outstandingCount: outstanding.length,
    outstandingTotal: sum(outstanding, (i) => i.remaining),
    upcomingCount: upcoming.length,
    upcomingTotal: sum(upcoming, (i) => i.remaining),
    lateFlagCount: list.filter((i) => i.lateFlag).length,
  };
}

/** عدد الدفعات التي عليها سداد/إعفاء/خصم قبل التعديل وبعده — للتحذير قبل الحفظ */
export function settledCounts(oldList, newList) {
  const has = (i) => i.paid || i.paidAmount > 0 || i.waived > 0 || i.discount > 0;
  const before = normalizeInstallments(oldList).filter(has).length;
  const after = normalizeInstallments(newList).filter(has).length;
  return { before, after, lost: Math.max(0, before - after) };
}

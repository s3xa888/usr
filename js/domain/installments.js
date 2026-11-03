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

/** يحافظ على حالات السداد القديمة عند إعادة توليد الجدول (بحسب الترتيب) */
export function carryOverStatuses(oldList, newList) {
  const old = normalizeInstallments(oldList);
  return newList.map((inst, i) => {
    const prev = old[i];
    if (!prev) return inst;
    return {
      ...inst,
      paid: !!prev.paid,
      lateFlag: !!prev.lateFlag,
      ...(prev.paidAt ? { paidAt: prev.paidAt } : {}),
      ...(prev.paidBy ? { paidBy: prev.paidBy } : {}),
    };
  });
}

/** Firebase قد يعيد المصفوفة ككائن — نوحّد الشكل دائماً */
export function normalizeInstallments(list) {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : Object.values(list);
  return arr
    .filter(Boolean)
    .map((x, i) => ({
      n: Number(x.n) || i + 1,
      dueDate: x.dueDate || '',
      amount: round2(x.amount),
      paid: !!x.paid,
      lateFlag: !!x.lateFlag,
      paidAt: x.paidAt || null,
      paidBy: x.paidBy || null,
      _index: Array.isArray(list) ? i : undefined,
    }))
    .map((x, i) => ({ ...x, _index: x._index ?? i }));
}

export const STATE_META = {
  paid: { label: 'مسددة', tone: 'success' },
  paid_late: { label: 'مسددة بتأخير', tone: 'warning' },
  late: { label: 'متعثرة', tone: 'danger' },
  overdue: { label: 'مستحقة', tone: 'danger' },
  due_today: { label: 'مستحقة اليوم', tone: 'warning' },
  upcoming: { label: 'قادمة', tone: 'info' },
};

export function installmentState(inst, today = todayISO()) {
  if (inst.paid) return inst.lateFlag ? 'paid_late' : 'paid';
  if (inst.lateFlag) return 'late';
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
  const sum = (arr) => round2(arr.reduce((s, i) => s + i.amount, 0));
  const paid = list.filter((i) => i.paid);
  const outstanding = list.filter((i) => isOutstanding(i, today));
  const upcoming = list.filter((i) => !i.paid && !isOutstanding(i, today));
  return {
    count: list.length,
    total: sum(list),
    paidCount: paid.length,
    paidTotal: sum(paid),
    outstandingCount: outstanding.length,
    outstandingTotal: sum(outstanding),
    upcomingCount: upcoming.length,
    upcomingTotal: sum(upcoming),
    lateFlagCount: list.filter((i) => i.lateFlag).length,
  };
}

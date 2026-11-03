/**
 * نموذج العقد: التحقق من المدخلات وبناء السجل المحفوظ.
 */
import { APP_CONFIG } from '../config/app.config.js';
import { contractEndDate, isValidISODate, todayISO, daysUntil, yearsBetween } from '../utils/dates.js';
import { toNumber, normalizePhone, normalizeDigits, round2 } from '../utils/numbers.js';
import { generateSchedule, carryOverStatuses, normalizeInstallments } from './installments.js';

export const statusById = (id) => APP_CONFIG.shopStatuses.find((s) => s.id === id) || APP_CONFIG.shopStatuses[0];

/** يحوّل السجل الخام من قاعدة البيانات لشكل موحّد */
export function normalizeContract(id, raw) {
  if (!raw) return null;
  const startDate = raw.startDate || '';
  const durationYears = Number(raw.durationYears) || 1;
  const endDate = raw.endDate || contractEndDate(startDate, durationYears);
  const installments = normalizeInstallments(raw.installments);
  const storedAnnualRent = Number(raw.annualRent) || 0;
  // الإيجار السنوي يُحسب دائماً من الدفعات الفعلية ومدة العقد (البداية ← النهاية)
  const computed = computeAnnualRent(installments, startDate, endDate);
  return {
    id,
    centerId: raw.centerId || '',
    shopNumber: String(raw.shopNumber ?? ''),
    shopStatus: raw.shopStatus || 'vacant',
    brandName: raw.brandName || '',
    category: raw.category || 'أخرى',
    isBrand: !!raw.isBrand,
    tenantName: raw.tenantName || '',
    tenantPhone: raw.tenantPhone || '',
    area: Number(raw.area) || 0,
    annualRent: computed || storedAnnualRent,
    storedAnnualRent,
    startDate,
    durationYears,
    endDate,
    paymentType: raw.paymentType || 'annual',
    installments,
    notes: raw.notes || '',
    violations: raw.violations || '',
    ejarNo: raw.ejarNo || '',
    legacyId: raw.legacyId || '',
    createdBy: raw.createdBy || '—',
    createdAt: raw.createdAt || null,
    updatedBy: raw.updatedBy || '—',
    updatedAt: raw.updatedAt || null,
  };
}

/**
 * يتحقق من بيانات النموذج ويعيد { errors, record }.
 * manualRows: [{dueDate, amount}] عند اختيار الدفع اليدوي.
 */
export function buildContract(input, { manualRows = [], existing = null, actor = '' } = {}) {
  const errors = {};
  const isManual = input.paymentType === 'manual';
  let annualRent = toNumber(input.annualRent);
  const area = input.area === '' ? 0 : toNumber(input.area);
  let durationYears = Number(input.durationYears) || 1;
  let endDate = contractEndDate(input.startDate, durationYears);
  if (isManual) {
    // الدفع اليدوي: المدة من تاريخي البداية والنهاية، والإيجار السنوي يُحسب من الدفعات
    endDate = input.endDate || '';
    durationYears = Math.round(yearsBetween(input.startDate, endDate) * 10000) / 10000;
  }

  if (!input.centerId) errors.centerId = 'اختر المركز التجاري';
  if (!normalizeDigits(input.shopNumber)) errors.shopNumber = 'أدخل رقم المحل';
  if (!input.brandName) errors.brandName = 'أدخل اسم النشاط / البراند';
  if (!input.tenantName) errors.tenantName = 'أدخل اسم المستأجر';
  const phone = normalizePhone(input.tenantPhone);
  if (!phone || phone.replace('+', '').length < 9) errors.tenantPhone = 'رقم جوال غير صحيح';
  if (Number.isNaN(area) || area < 0) errors.area = 'المساحة يجب أن تكون رقماً';
  if (!isManual && (Number.isNaN(annualRent) || annualRent <= 0)) errors.annualRent = 'أدخل قيمة إيجار صحيحة';
  if (!isValidISODate(input.startDate)) errors.startDate = 'اختر تاريخ البداية';
  if (isManual) {
    if (!isValidISODate(endDate)) errors.endDate = 'اختر تاريخ نهاية العقد';
    else if (durationYears <= 0) errors.endDate = 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية';
    else if (durationYears > APP_CONFIG.maxDurationYears) errors.endDate = `أقصى مدة ${APP_CONFIG.maxDurationYears} سنة`;
  } else if (durationYears < 1 || durationYears > APP_CONFIG.maxDurationYears) errors.durationYears = 'مدة غير صحيحة';

  let installments = [];
  if (input.paymentType === 'manual') {
    if (!manualRows.length) errors.manual = 'أضف دفعة واحدة على الأقل';
    manualRows.forEach((r, i) => {
      const amt = toNumber(r.amount);
      const vat = r.vat === undefined || String(r.vat).trim() === '' ? 0 : toNumber(r.vat);
      if (!isValidISODate(r.dueDate) || Number.isNaN(amt) || amt <= 0) errors.manual = `تحقق من تاريخ ومبلغ الدفعة رقم ${i + 1}`;
      else if (Number.isNaN(vat) || vat < 0 || vat >= amt) errors.manual = `قيمة الضريبة في الدفعة رقم ${i + 1} غير صحيحة`;
      installments.push({ n: i + 1, dueDate: r.dueDate, amount: round2(amt), vat: round2(vat || 0), paid: false, lateFlag: false });
    });
    installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).forEach((x, i) => { x.n = i + 1; });
  }

  if (isManual && !errors.manual && !errors.endDate && !errors.startDate) {
    annualRent = computeAnnualRent(installments, input.startDate, endDate);
    if (!(annualRent > 0)) errors.manual = 'تعذر حساب الإيجار السنوي — تحقق من الدفعات وتاريخ النهاية';
  }

  if (Object.keys(errors).length) return { errors, record: null };

  if (input.paymentType !== 'manual') {
    installments = generateSchedule({ startDate: input.startDate, durationYears, paymentType: input.paymentType, annualRent });
  }

  // عند التعديل: لا نعيد توليد الجدول إذا لم تتغير معطياته، وإن تغيرت نحافظ على حالات السداد
  if (existing) {
    const scheduleChanged =
      existing.startDate !== input.startDate ||
      existing.durationYears !== durationYears ||
      existing.endDate !== endDate ||
      existing.paymentType !== input.paymentType ||
      existing.storedAnnualRent !== annualRent ||
      input.paymentType === 'manual';
    installments = scheduleChanged ? carryOverStatuses(existing.installments, installments) : existing.installments;
  }

  const now = Date.now();
  const record = {
    centerId: input.centerId,
    shopNumber: normalizeDigits(input.shopNumber),
    shopStatus: input.shopStatus || 'vacant',
    brandName: input.brandName,
    category: input.category || 'أخرى',
    isBrand: input.isBrand === true || input.isBrand === 'true',
    tenantName: input.tenantName,
    tenantPhone: phone,
    area: area || 0,
    annualRent,
    startDate: input.startDate,
    durationYears,
    endDate,
    paymentType: input.paymentType,
    installments: installments.map(stripInternal),
    notes: input.notes || '',
    violations: input.violations || '',
    ...(String(input.ejarNo || '').trim() ? { ejarNo: String(input.ejarNo).trim().slice(0, 40) } : {}),
    ...(existing?.legacyId ? { legacyId: existing.legacyId } : {}),
    createdBy: existing ? existing.createdBy : actor,
    createdAt: existing ? existing.createdAt || now : now,
    updatedBy: existing ? actor : '—',
    updatedAt: now,
  };
  return { errors: null, record };
}

/** يزيل الحقول الداخلية (المحسوبة) والقيم الفارغة قبل الحفظ */
export function stripInternal(inst) {
  const out = { n: inst.n, dueDate: inst.dueDate, amount: round2(inst.amount), paid: !!inst.paid, lateFlag: !!inst.lateFlag };
  if (Number(inst.vat) > 0) out.vat = round2(inst.vat);
  if (inst.paidAt) out.paidAt = inst.paidAt;
  if (inst.paidBy) out.paidBy = inst.paidBy;
  if (inst.payments?.length) {
    out.payments = Object.fromEntries(inst.payments.map((p) => [p.id, paymentRecord(p)]));
  }
  if (Number(inst.waived) > 0) out.waived = round2(inst.waived);
  if (Number(inst.discount) > 0) out.discount = round2(inst.discount);
  if (inst.adjNote) out.adjNote = String(inst.adjNote).slice(0, 300);
  return out;
}

/** شكل المبلغ المسجل كما يُحفظ في قاعدة البيانات */
export function paymentRecord(p) {
  const out = { amount: round2(p.amount), date: p.date };
  if (p.method) out.method = String(p.method).slice(0, 30);
  if (p.note) out.note = String(p.note).slice(0, 200);
  if (p.by) out.by = String(p.by).slice(0, 80);
  if (p.at) out.at = Number(p.at);
  return out;
}

/** إجمالي الدفعات المسجلة في العقد (هللات لتفادي أخطاء الكسور) */
export const installmentsTotal = (list = []) => Math.round(list.reduce((s, i) => s + Math.round((Number(i.amount) || 0) * 100), 0)) / 100;

/**
 * الإيجار السنوي = مجموع الدفعات (بدون الضريبة) ÷ مدة العقد الفعلية بالسنوات (من تاريخ البداية حتى النهاية).
 * تواريخ الدفعات لا تدخل في الحساب — هي مواعيد استحقاق فقط.
 */
export function computeAnnualRent(installments, startDate, endDate) {
  const total = rentTotal(installments);
  const years = yearsBetween(startDate, endDate);
  if (!(total > 0) || !(years > 0)) return 0;
  return round2(total / years);
}

/** مجموع قيمة الإيجار بدون ضريبة القيمة المضافة (الضريبة ليست دخلاً للمؤجر) */
export const rentTotal = (list = []) => Math.round(list.reduce((s, i) => s + Math.round((Number(i.amount) || 0) * 100) - Math.round((Number(i.vat) || 0) * 100), 0)) / 100;

/** إجمالي العقد (بدون الضريبة) = مجموع دفعاته الفعلية (أو الإيجار × المدة إن لم تكن له دفعات) */
export const contractTotal = (c) => (c.installments?.length ? rentTotal(c.installments) : round2(c.annualRent * c.durationYears));

export function contractPhase(c, today = todayISO()) {
  if (c.startDate && daysUntil(c.startDate, today) > 0) return 'pending';
  if (c.endDate && daysUntil(c.endDate, today) < 0) return 'expired';
  return 'active';
}

export function matchesSearch(c, q, centerName = '') {
  if (!q) return true;
  const hay = [c.brandName, c.shopNumber, c.tenantName, c.tenantPhone, c.category, centerName, c.ejarNo].join(' ').toLowerCase();
  const terms = String(q).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t));
}

export const byShopNumber = (a, b) =>
  a.shopNumber.localeCompare(b.shopNumber, 'en', { numeric: true });

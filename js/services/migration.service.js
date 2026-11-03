/**
 * استيراد بيانات النسخة القديمة (v1.x — المسار yesur_data) إلى البنية الجديدة.
 * لا يتم استيراد كلمات المرور القديمة إطلاقاً (كانت محفوظة كنص مكشوف).
 */
import { get, update, remove, ref, push } from '../core/sdk.js';
import { db, path } from '../core/firebase.js';
import { APP_CONFIG } from '../config/app.config.js';
import { contractEndDate } from '../utils/dates.js';
import { toNumber, normalizeDigits, normalizePhone, round2 } from '../utils/numbers.js';
import { generateSchedule } from '../domain/installments.js';
import { store } from '../core/store.js';

const PAYMENT_MAP = { 'سنوية': 'annual', 'نصف سنوية': 'semiannual', 'ربع سنوية': 'quarterly', 'يدوية': 'manual', 'شهرية': 'monthly' };
const STATUS_MAP = { 'غير مؤجر': 'vacant', 'مؤجر ومغلق': 'leased_closed', 'مؤجر ومفتوح': 'leased_open' };
const CATEGORY_MAP = { 'مقهي': 'مقهى', 'العاب': 'ألعاب', 'اجهزه الكترونيه': 'أجهزة إلكترونية', 'مفروشات واثاث': 'مفروشات وأثاث', 'اخرى': 'أخرى' };

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {}));

export async function readLegacy() {
  const snap = await get(ref(db, APP_CONFIG.legacyRoot));
  if (!snap.exists()) return null;
  const data = snap.val();
  return {
    centers: asArray(data.centers),
    rentals: asArray(data.rentals),
    usernames: asArray(data.users).map((u) => u.username).filter(Boolean),
  };
}

export function convertLegacy(legacy) {
  const existingCenters = store.get('centers');
  const centerIds = {};
  const patch = {};
  let order = Date.now();

  const ensureCenter = (name) => {
    const n = String(name || 'مركز غير مسمى').trim();
    if (centerIds[n]) return centerIds[n];
    const found = existingCenters.find((c) => c.name === n);
    if (found) return (centerIds[n] = found.id);
    const id = push(ref(db, path('centers'))).key;
    patch[path('centers', id)] = { name: n, createdAt: Date.now(), order: order++ };
    return (centerIds[n] = id);
  };

  legacy.centers.forEach(ensureCenter);

  legacy.rentals.forEach((r) => {
    const paymentType = PAYMENT_MAP[r.paymentType] || 'annual';
    const durationYears = Number(r.contractDuration) || 1;
    const annualRent = toNumber(r.rentAmount) || 0;
    let installments = asArray(r.installments).map((i, idx) => ({
      n: idx + 1,
      dueDate: i.dueDate,
      amount: round2(toNumber(i.amount) || 0),
      paid: i.status === 'تم السداد' || i.status === 'مسدد',
      lateFlag: !!i.isOverdueFlag,
    }));
    if (!installments.length && paymentType !== 'manual') {
      installments = generateSchedule({ startDate: r.startDate, durationYears, paymentType, annualRent });
    }
    const id = push(ref(db, path('contracts'))).key;
    patch[path('contracts', id)] = {
      centerId: ensureCenter(r.centerName),
      shopNumber: normalizeDigits(r.shopNumber) || '0',
      shopStatus: STATUS_MAP[r.shopStatus] || 'leased_open',
      brandName: r.brandName || 'بدون اسم',
      category: CATEGORY_MAP[r.shopCategory] || r.shopCategory || 'أخرى',
      isBrand: r.isBrand === 'نعم',
      tenantName: r.ownerName || '',
      tenantPhone: normalizePhone(r.ownerPhone),
      area: toNumber(r.shopArea) || 0,
      annualRent,
      startDate: r.startDate,
      durationYears,
      endDate: r.endDate || contractEndDate(r.startDate, durationYears),
      paymentType,
      installments,
      notes: '',
      createdBy: r.addedBy || '—',
      createdAt: Number(r.id) || Date.now(),
      updatedBy: r.editedBy || '—',
      updatedAt: Date.now(),
      legacyId: String(r.id || ''),
    };
  });

  return { patch, centersCount: Object.keys(patch).filter((k) => k.includes('/centers/')).length, contractsCount: legacy.rentals.length };
}

export async function importLegacy(legacy) {
  const { patch, centersCount, contractsCount } = convertLegacy(legacy);
  // نكتب المراكز أولاً ثم العقود (قواعد الأمان تتحقق أن المركز موجود)
  const centersPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => k.includes('/centers/')));
  const contractsPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => k.includes('/contracts/')));
  if (Object.keys(centersPatch).length) await update(ref(db), centersPatch);
  if (Object.keys(contractsPatch).length) await update(ref(db), contractsPatch);
  return { centersCount, contractsCount };
}

/** حذف البيانات القديمة نهائياً (تحتوي كلمات مرور مكشوفة) */
export const deleteLegacy = () => remove(ref(db, APP_CONFIG.legacyRoot));

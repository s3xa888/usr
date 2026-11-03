import { APP_CONFIG } from '../config/app.config.js';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** يحوّل الأرقام العربية/الفارسية إلى إنجليزية ويزيل الفواصل */
export function normalizeDigits(input) {
  return String(input ?? '')
    .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
    .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '');
}

/** يحوّل أي إدخال إلى رقم، ويعيد NaN إذا لم يكن رقماً صالحاً */
export function toNumber(input) {
  if (typeof input === 'number') return input;
  const s = normalizeDigits(input);
  if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

export function money(amount, { withCurrency = true } = {}) {
  const n = Number(amount) || 0;
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return withCurrency ? `${s} ${APP_CONFIG.currency}` : s;
}

export function compactMoney(amount) {
  const n = Number(amount) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} مليون`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })} ألف`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export const int = (n) => (Number(n) || 0).toLocaleString('en-US');

export const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

/** تقريب مالي إلى هللتين */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** رقم جوال: أرقام فقط مع + اختيارية */
export const normalizePhone = (p) => normalizeDigits(p).replace(/[^\d+]/g, '');

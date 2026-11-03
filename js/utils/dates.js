/**
 * أدوات التواريخ — نتعامل مع التاريخ كنص "YYYY-MM-DD" بالتوقيت المحلي
 * لتجنب أخطاء فرق التوقيت (UTC) وانزلاق الأيام عند إضافة الأشهر.
 */

const pad = (n) => String(n).padStart(2, '0');

export function parseISODate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export const isValidISODate = (str) => {
  const p = parseISODate(str);
  if (!p) return false;
  const dt = new Date(p.y, p.m - 1, p.d);
  return dt.getFullYear() === p.y && dt.getMonth() === p.m - 1 && dt.getDate() === p.d;
};

export const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

export const todayISO = () => toISO(new Date());

const daysInMonth = (y, m /* 1-12 */) => new Date(y, m, 0).getDate();

/**
 * يضيف أشهراً مع تثبيت اليوم: 31 يناير + شهر = 28/29 فبراير (وليس 3 مارس).
 */
export function addMonths(iso, months) {
  const p = parseISODate(iso);
  if (!p) return '';
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(p.d, daysInMonth(y, m));
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function addDays(iso, days) {
  const p = parseISODate(iso);
  if (!p) return '';
  return toISO(new Date(p.y, p.m - 1, p.d + days));
}

/** عدد الأيام من a إلى b (موجب إذا b بعد a) */
export function diffDays(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  if (!a || !b) return NaN;
  const ua = Date.UTC(a.y, a.m - 1, a.d);
  const ub = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((ub - ua) / 86_400_000);
}

export const daysUntil = (iso, today = todayISO()) => diffDays(today, iso);

/** تاريخ نهاية العقد = البداية + السنوات − يوم */
export const contractEndDate = (startISO, years) => (startISO ? addDays(addMonths(startISO, Math.round(years * 12)), -1) : '');

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function formatDate(iso, { long = false } = {}) {
  const p = parseISODate(iso);
  if (!p) return '—';
  return long ? `${p.d} ${AR_MONTHS[p.m - 1]} ${p.y}` : `${p.y}/${pad(p.m)}/${pad(p.d)}`;
}

export function relativeDays(days) {
  if (Number.isNaN(days)) return '';
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غداً';
  if (days === -1) return 'أمس';
  const n = Math.abs(days);
  const unit = n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوم`;
  return days > 0 ? `بعد ${unit}` : `متأخرة ${unit}`;
}

/** عد تنازلي دقيق حتى نهاية يوم الاستحقاق */
export function countdown(iso, now = new Date()) {
  const p = parseISODate(iso);
  if (!p) return null;
  const end = new Date(p.y, p.m - 1, p.d, 23, 59, 59);
  let diff = end - now;
  const past = diff < 0;
  diff = Math.abs(diff);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { past, d, h, m, s };
}

export const formatTimestamp = (ms) => {
  if (!ms) return '—';
  const dt = new Date(ms);
  return `${toISO(dt).replace(/-/g, '/')} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

/**
 * المدة الفعلية بالسنوات (كسرية) من تاريخ البداية حتى تاريخ النهاية شاملاً اليوم الأخير.
 * تُحسب بالأشهر الكاملة ثم كسر الشهر المتبقي بالأيام، فلا تتأثر بالسنوات الكبيسة:
 * 2024-01-01 ← 2024-12-31 = سنة واحدة بالضبط، و 2025-01-01 ← 2025-06-30 = 0.5 سنة.
 */
export function yearsBetween(startISO, endISO) {
  if (!isValidISODate(startISO) || !isValidISODate(endISO)) return 0;
  const endEx = addDays(endISO, 1); // اليوم التالي للنهاية (نهاية حصرية)
  if (diffDays(startISO, endEx) <= 0) return 0;
  const s = parseISODate(startISO);
  const e = parseISODate(endEx);
  let months = (e.y - s.y) * 12 + (e.m - s.m) + 1;
  while (months > 0 && addMonths(startISO, months) > endEx) months--;
  const anchor = addMonths(startISO, months);
  const next = addMonths(startISO, months + 1);
  const rem = diffDays(anchor, endEx);
  const frac = rem > 0 ? rem / diffDays(anchor, next) : 0;
  return (months + frac) / 12;
}

/** وصف المدة بين تاريخين: "سنتان و6 أشهر و10 أيام" */
export function periodText(startISO, endISO) {
  if (!isValidISODate(startISO) || !isValidISODate(endISO)) return '—';
  const endEx = addDays(endISO, 1);
  if (diffDays(startISO, endEx) <= 0) return '—';
  const s = parseISODate(startISO);
  const e = parseISODate(endEx);
  let months = (e.y - s.y) * 12 + (e.m - s.m) + 1;
  while (months > 0 && addMonths(startISO, months) > endEx) months--;
  const days = diffDays(addMonths(startISO, months), endEx);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(y === 1 ? 'سنة' : y === 2 ? 'سنتان' : y <= 10 ? `${y} سنوات` : `${y} سنة`);
  if (m) parts.push(m === 1 ? 'شهر' : m === 2 ? 'شهران' : m <= 10 ? `${m} أشهر` : `${m} شهراً`);
  if (days) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومان' : days <= 10 ? `${days} أيام` : `${days} يوماً`);
  return parts.join(' و') || '—';
}

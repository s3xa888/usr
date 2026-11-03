/**
 * قراءة بيانات عقد "إيجار" من نص ملف PDF — دالة صافية بدون واجهة أو مكتبات.
 *
 * المدخلات: عناصر النص كما يستخرجها pdf.js مع مواقعها:
 *   [{ page, x, y, w, str }]   (y يزيد للأعلى كما في PDF)
 *
 * الفكرة: عقود إيجار مكتوبة بجدول ثابت بعمودين، وكل حقل له عنوان إنجليزي واضح
 * (Tenancy Start Date, Mobile No. ...). نبحث عن العنوان الإنجليزي ثم نقرأ القيمة
 * بجانبه — وهذا أدق من الاعتماد على النص العربي الذي تأتي حروفه مقطّعة.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUM_RE = /^-?\d[\d,]*(\.\d+)?$/;
const HAS_AR = /[؀-ۿﭐ-﷿ﹰ-﻿]/;

/** تحويل أشكال الحروف العربية المعروضة (ﻣ ﻄ ﺎ ...) إلى حروف عادية وإزالة التشكيل */
export function cleanText(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[‎‏‪-‮]/g, '');
}

const isDiacriticOnly = (s) => cleanText(s).trim() === '' && String(s).trim() !== '';

function prepare(items) {
  return items
    .filter((it) => it && typeof it.str === 'string' && it.str.trim() && !isDiacriticOnly(it.str))
    .map((it, i) => ({ ...it, i, str: cleanText(it.str), w: Number(it.w) || 0 }));
}

/** ترتيب القراءة: الصفحة ثم من الأعلى للأسفل */
const before = (a, b) => (a.page !== b.page ? a.page < b.page : a.y > b.y + 2);

function findLabel(items, re, { after = null, until = null } = {}) {
  return items.find((it) => re.test(it.str.trim()) && !HAS_AR.test(it.str)
    && (!after || before(after, it)) && (!until || before(it, until))) || null;
}

/** يجمع عناصر سطر واحد كنص (العربي من اليمين لليسار، والإنجليزي/الأرقام من اليسار لليمين) */
function joinLine(list) {
  const rtl = list.some((it) => HAS_AR.test(it.str));
  const sorted = [...list].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
  let out = '';
  sorted.forEach((it, k) => {
    if (k) {
      const prev = sorted[k - 1];
      const gap = rtl ? prev.x - (it.x + it.w) : it.x - (prev.x + prev.w);
      if (gap > 1.2 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
    }
    out += it.str;
  });
  return out.replace(/\s+/g, ' ').trim();
}

function joinLines(list) {
  const lines = [];
  [...list].sort((a, b) => b.y - a.y).forEach((it) => {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 3);
    if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
  });
  return lines.map((l) => joinLine(l.items)).filter(Boolean).join(' ').trim();
}

/**
 * قيمة الحقل: العناصر الواقعة يمين العنوان الإنجليزي في نفس العمود (نصف الصفحة)،
 * قبل العنوان العربي (آخر مجموعة عناصر في العمود).
 */
export function valueOf(items, label, { band = 12 } = {}) {
  if (!label) return '';
  const halfEnd = label.x < 298 ? 298 : 10000;
  const start = label.x + label.w + 2;
  const cand = items.filter((it) => it.page === label.page && it !== label && it.x >= start && it.x < halfEnd
    && Math.abs(it.y - label.y) <= band && !(it.str.trim() && !HAS_AR.test(it.str) && /^[A-Za-z]/.test(it.str.trim()) && it.x < start + 4));
  if (!cand.length) return '';
  // مجموعات أفقية: فجوة كبيرة تفصل القيمة عن العنوان العربي
  const byX = [...cand].sort((a, b) => a.x - b.x);
  const clusters = [];
  byX.forEach((it) => {
    const last = clusters[clusters.length - 1];
    const lastEnd = last ? Math.max(...last.map((x) => x.x + x.w)) : -1;
    if (last && it.x - lastEnd <= 12) last.push(it); else clusters.push([it]);
  });
  const labelCluster = clusters[clusters.length - 1];
  const isArabicLabel = labelCluster.some((it) => HAS_AR.test(it.str) || it.str.trim() === ':');
  const valueItems = (isArabicLabel ? clusters.slice(0, -1) : clusters).flat();
  // تجاهل الأسطر الإنجليزية التابعة للعنوان (مثل "name/Founder")
  return joinLines(valueItems.filter((it) => !(/^[A-Za-z/().:\s-]+$/.test(it.str) && it.x < start + 40 && !/^-$/.test(it.str.trim()))));
}

const num = (s) => {
  const t = String(s || '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return NUM_RE.test(t) ? Number(t) : NaN;
};
const validDate = (s) => {
  const m = DATE_RE.exec(String(s || '').trim());
  if (!m || +m[1] < 1900 || +m[1] > 2200) return '';
  return m[0];
};

/** "8/7/6/5/4/3/2/1" → "1-8" ، "3/5/6/7" → "3، 5-7" */
export function compactUnits(text) {
  const nums = [...new Set((String(text).match(/\d+/g) || []).map(Number))].sort((a, b) => a - b);
  if (!nums.length) return String(text || '').trim();
  const parts = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j - i >= 2 ? `${nums[i]}-${nums[j]}` : j > i ? `${nums[i]},${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return parts.join(',');
}

/** +9665XXXXXXXX → 05XXXXXXXX */
export function localPhone(p) {
  let d = String(p || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+966')) d = `0${d.slice(4)}`;
  else if (d.startsWith('00966')) d = `0${d.slice(5)}`;
  else if (d.startsWith('966') && d.length === 12) d = `0${d.slice(3)}`;
  return d;
}

/** جدول سداد الدفعات */
function parseSchedule(items) {
  const dueH = findLabel(items, /^Due Date\s*\(AD\)$/i);
  if (!dueH) return [];
  const sameRow = (re) => items.find((it) => it.page === dueH.page && Math.abs(it.y - dueH.y) <= 4 && re.test(it.str.trim()));
  const col = (it) => (it ? it.x + it.w / 2 : null);
  const cols = {
    due: col(dueH),
    total: col(sameRow(/^Total value$/i)),
    vat: col(sameRow(/^VAT$/i)),
    rent: col(sameRow(/^Rent value$/i)),
    no: col(sameRow(/^\.?No\.?$/i)),
  };
  const stop = findLabel(items, /^Parties Obligations$/i, { after: dueH });
  // تجميع العناصر في صفوف: نفس الصفحة وفرق ارتفاع صغير
  const body = items.filter((it) => before(dueH, it) && (!stop || before(it, stop)))
    .sort((a, b) => (a.page - b.page) || (b.y - a.y));
  const rows = [];
  body.forEach((it) => {
    const row = rows[rows.length - 1];
    if (row && row.page === it.page && Math.abs(row.y - it.y) <= 5) row.items.push(it);
    else rows.push({ page: it.page, y: it.y, items: [it] });
  });
  const nearest = (list, x, test) => {
    if (x == null) return null;
    let best = null;
    list.forEach((it) => { if (test(it.str.trim())) { const d = Math.abs(it.x + it.w / 2 - x); if (d < 30 && (!best || d < best.d)) best = { it, d }; } });
    return best?.it || null;
  };
  const out = [];
  rows.map((r) => r.items).forEach((list) => {
    const due = nearest(list, cols.due, (s) => !!validDate(s));
    const total = nearest(list, cols.total, (s) => NUM_RE.test(s));
    if (!due || !total) return;
    const vat = nearest(list, cols.vat, (s) => NUM_RE.test(s));
    const rent = nearest(list, cols.rent, (s) => NUM_RE.test(s));
    const n = nearest(list, cols.no, (s) => /^\d{1,3}$/.test(s));
    out.push({
      page: due.page, y: due.y,
      n: n ? Number(n.str) : 0,
      dueDate: validDate(due.str),
      amount: num(total.str),
      vat: vat ? num(vat.str) || 0 : 0,
      rent: rent ? num(rent.str) : NaN,
    });
  });
  out.sort((a, b) => (a.page - b.page) || (b.y - a.y));
  return out.map((r, i) => ({ n: r.n || i + 1, dueDate: r.dueDate, amount: r.amount, vat: r.vat, rent: r.rent }));
}

/**
 * يعيد { ok, data, warnings } حيث data جاهزة لنموذج العقد.
 */
export function parseEjar(rawItems) {
  const items = prepare(rawItems);
  const isEjar = findLabel(items, /^Tenancy Start Date$/i) && findLabel(items, /^Rent Payments Schedule$/i);
  if (!isEjar) return { ok: false, reason: 'not-ejar', data: null, warnings: [] };

  const warnings = [];
  const v = (re, opts) => valueOf(items, findLabel(items, re, opts));

  const ejarNo = v(/^Contract No\.?$/i).replace(/\s*\/\s*/g, ' / ');
  const startDate = validDate(v(/^Tenancy Start Date$/i));
  const endDate = validDate(v(/^Tenancy End Date$/i));

  // المستأجر: أول "Company" أو "Name" بعد قسم بيانات المستأجر
  const tenantSec = findLabel(items, /^Tenant Data$/i);
  const tenantRep = findLabel(items, /^Tenant Representative Data$/i, { after: tenantSec });
  const broker = findLabel(items, /^Brokerage Entity/i, { after: tenantSec });
  const nameLabel = findLabel(items, /^(Company|Name)$/i, { after: tenantSec, until: tenantRep || broker });
  const repName = tenantRep ? valueOf(items, findLabel(items, /^Name$/i, { after: tenantRep, until: broker })) : '';
  const tenantName = valueOf(items, nameLabel) || repName;
  const phone = localPhone(valueOf(items, findLabel(items, /^Mobile No\.?$/i, { after: tenantSec, until: broker })));

  // الوحدات
  const unitsSec = findLabel(items, /^Rental Units Data$/i);
  const finSec = findLabel(items, /^Financial Data$/i, { after: unitsSec });
  const inUnits = items.filter((it) => (!unitsSec || before(unitsSec, it)) && (!finSec || before(it, finSec)));
  const unitTexts = inUnits.filter((it) => /^Unit No\.?$/i.test(it.str.trim())).map((l) => valueOf(items, l));
  const areas = inUnits.filter((it) => /^Unit Area$/i.test(it.str.trim())).map((l) => num(valueOf(items, l))).filter((n) => n > 0);
  const shopNumber = compactUnits(unitTexts.join('/')).slice(0, 20);
  const area = Math.round(areas.reduce((s, n) => s + n, 0) * 100) / 100;

  // المالية والجدول
  const pdfAnnual = num(v(/^Annual Rent:?$/i));
  const pdfTotal = num(v(/^Total Contract value:?$/i));
  const installments = parseSchedule(items);
  const pdfCount = num(v(/^Number of Rent$/i));

  if (!startDate || !endDate) warnings.push('لم أتمكن من قراءة تاريخ بداية أو نهاية العقد — أدخله يدوياً');
  if (!tenantName) warnings.push('لم أتمكن من قراءة اسم المستأجر');
  if (!phone || phone.length < 9) warnings.push('لم أجد رقم جوال المستأجر في العقد');
  if (!installments.length) warnings.push('لم أتمكن من قراءة جدول الدفعات — أدخل الدفعات يدوياً');
  else {
    if (pdfCount > 0 && pdfCount !== installments.length) warnings.push(`عدد الدفعات في العقد ${pdfCount} لكن تمت قراءة ${installments.length} — راجع الجدول`);
    const total = Math.round(installments.reduce((s, r) => s + r.amount * 100, 0)) / 100;
    if (pdfTotal > 0 && Math.abs(total - pdfTotal) > 1) warnings.push(`مجموع الدفعات المقروءة (${total}) يختلف عن إجمالي العقد (${pdfTotal})`);
  }

  return {
    ok: true,
    warnings,
    pdfAnnual: Number.isFinite(pdfAnnual) ? pdfAnnual : null,
    data: {
      ejarNo,
      startDate,
      endDate,
      tenantName: tenantName.slice(0, 120),
      tenantPhone: phone,
      shopNumber,
      area: area || '',
      paymentType: 'manual',
      installments: installments.map((r) => ({ n: r.n, dueDate: r.dueDate, amount: r.amount, vat: r.vat || 0 })),
    },
  };
}

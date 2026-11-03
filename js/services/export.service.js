/**
 * التصدير: Excel (CSV بترميز يدعم العربية) وتقارير PDF عبر الطباعة.
 */
import { APP_CONFIG, labelOf } from '../config/app.config.js';
import { store, centerName } from '../core/store.js';
import { html, raw, esc } from '../utils/dom.js';
import { money } from '../utils/numbers.js';
import { formatDate, todayISO, toISO } from '../utils/dates.js';
import { STATE_META, installmentState } from '../domain/installments.js';

/* ============ CSV / Excel ============ */

/** يحمي من "حقن الصيغ" في Excel (خلية تبدأ بـ = أو + ...) */
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function downloadCSV(filename, headers, rows) {
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportContractsCSV(contracts, name = 'العقود') {
  const headers = ['المركز', 'الحالة', 'المحل', 'البراند', 'التصنيف', 'براند؟', 'المستأجر', 'الجوال', 'المساحة م²', 'الإيجار السنوي', 'طريقة الدفع', 'المدة (سنوات)', 'البداية', 'النهاية', 'أضيف بواسطة', 'آخر تعديل بواسطة'];
  const rows = contracts.map((c) => [
    centerName(c.centerId), labelOf(APP_CONFIG.shopStatuses, c.shopStatus), c.shopNumber, c.brandName, c.category,
    c.isBrand ? 'نعم' : 'لا', c.tenantName, c.tenantPhone, c.area, c.annualRent, labelOf(APP_CONFIG.paymentTypes, c.paymentType),
    c.durationYears, c.startDate, c.endDate, c.createdBy, c.updatedBy,
  ]);
  downloadCSV(`يسر_${name}_${todayISO()}.csv`, headers, rows);
}

/* ============ طباعة / PDF ============ */

function brandHeader(subtitle) {
  const b = store.get('branding') || {};
  const logo = b.logo || 'assets/logo.svg';
  return html`
    <header class="r-head">
      <div class="r-brand">
        <img src="${logo}" alt="">
        <div><h1>${b.name || APP_CONFIG.appName}</h1><p>${subtitle}</p></div>
      </div>
      <div class="r-meta">تاريخ الإصدار<br><strong>${formatDate(todayISO(), { long: true })}</strong></div>
    </header>`;
}

const REPORT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif; color: #0f172a; margin: 0; font-size: 12px; direction: rtl; }
  .r-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 18px; }
  .r-brand { display: flex; gap: 12px; align-items: center; }
  .r-brand img { width: 48px; height: 48px; object-fit: contain; border-radius: 10px; }
  .r-brand h1 { margin: 0; font-size: 18px; }
  .r-brand p { margin: 2px 0 0; color: #64748b; }
  .r-meta { text-align: left; color: #64748b; font-size: 11px; }
  .r-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
  .r-box b { color: #475569; font-weight: 600; }
  h2 { font-size: 14px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f1f5f9; color: #475569; font-weight: 600; font-size: 11px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: center; }
  .num { font-variant-numeric: tabular-nums; }
  .total { display: flex; justify-content: space-between; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 12px 16px; font-size: 14px; font-weight: 700; }
  .tag { padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; }
  .t-danger { background: #fee2e2; color: #b91c1c; } .t-warning { background: #fef3c7; color: #b45309; }
  .t-success { background: #dcfce7; color: #15803d; } .t-info { background: #e0f2fe; color: #0369a1; }
  .section { page-break-inside: avoid; margin-bottom: 22px; }
  footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; color: #94a3b8; font-size: 10px; }
`;

export function printDocument(title, bodyHtml) {
  let frame = document.getElementById('print-frame');
  if (!frame) {
    frame = Object.assign(document.createElement('iframe'), { id: 'print-frame', title: 'print' });
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;';
    document.body.appendChild(frame);
  }
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="stylesheet" href="${new URL('css/fonts.css', location.href)}"><style>${REPORT_CSS}</style></head>
    <body>${bodyHtml}<footer>صدر إلكترونياً من ${esc(store.get('branding')?.name || APP_CONFIG.appName)}</footer></body></html>`);
  doc.close();
  const go = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
  (doc.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 150));
}

function entitlementSection(entry) {
  const c = entry.contract;
  return html`
    <div class="section">
      <div class="r-box">
        <div><b>النشاط:</b> ${c.brandName} — محل ${c.shopNumber}</div>
        <div><b>المركز:</b> ${centerName(c.centerId)}</div>
        <div><b>المستأجر:</b> ${c.tenantName}</div>
        <div><b>الجوال:</b> <span class="num">${c.tenantPhone}</span></div>
      </div>
      <table>
        <thead><tr><th>رقم الدفعة</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>الحالة</th></tr></thead>
        <tbody>${entry.items.map((i) => {
          const meta = STATE_META[installmentState(i)];
          return html`<tr><td>#${i.n}</td><td class="num">${formatDate(i.dueDate)}</td><td class="num">${money(i.amount)}</td><td><span class="tag t-${meta.tone}">${meta.label}</span></td></tr>`;
        })}</tbody>
      </table>
      <div class="total"><span>إجمالي المستحق</span><span class="num">${money(entry.total)}</span></div>
    </div>`;
}

export function printEntitlements(entries, title = 'تقرير الاستحقاقات') {
  const grand = entries.reduce((s, e) => s + e.total, 0);
  const body = html`
    ${brandHeader(title)}
    ${entries.map(entitlementSection)}
    ${entries.length > 1 ? html`<div class="total"><span>الإجمالي العام (${entries.length} نشاط)</span><span class="num">${money(grand)}</span></div>` : ''}`;
  printDocument(title, String(body));
}

export function printStatement(contract) {
  const rows = contract.installments.map((i) => {
    const meta = STATE_META[installmentState(i)];
    return html`<tr><td>#${i.n}</td><td class="num">${formatDate(i.dueDate)}</td><td class="num">${money(i.amount)}</td>
      <td><span class="tag t-${meta.tone}">${meta.label}</span></td><td class="num">${i.paidAt ? formatDate(toISO(new Date(i.paidAt))) : '—'}</td></tr>`;
  });
  const body = html`
    ${brandHeader('كشف حساب عقد')}
    <div class="r-box">
      <div><b>النشاط:</b> ${contract.brandName} — محل ${contract.shopNumber}</div>
      <div><b>المركز:</b> ${centerName(contract.centerId)}</div>
      <div><b>المستأجر:</b> ${contract.tenantName}</div>
      <div><b>الجوال:</b> <span class="num">${contract.tenantPhone}</span></div>
      <div><b>مدة العقد:</b> ${formatDate(contract.startDate)} ← ${formatDate(contract.endDate)}</div>
      <div><b>الإيجار السنوي:</b> <span class="num">${money(contract.annualRent)}</span></div>
    </div>
    <h2>جدول الدفعات</h2>
    <table><thead><tr><th>#</th><th>الاستحقاق</th><th>المبلغ</th><th>الحالة</th><th>تاريخ السداد</th></tr></thead><tbody>${rows}</tbody></table>`;
  printDocument(`كشف ${contract.brandName}`, String(body));
}

export { raw };

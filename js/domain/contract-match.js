/**
 * البحث عن عقد مسجّل مسبقاً يطابق ملف عقد إيجار — بعدة معايير،
 * لأن اسم المستأجر وجواله في عقد إيجار قد يختلفان عن المسجل في المنصة.
 */
import { diffDays } from '../utils/dates.js';

const unitSet = (s) => {
  const out = new Set();
  String(s || '').split(/[,،/\s]+/).forEach((part) => {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) { for (let i = +m[1]; i <= +m[2] && i - +m[1] < 200; i++) out.add(i); }
    else (part.match(/\d+/g) || []).forEach((n) => out.add(+n));
  });
  return out;
};
const words = (s) => new Set(String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').split(/\s+/).filter((w) => w.length > 2));
const near = (a, b, days) => a && b && Math.abs(diffDays(a, b)) <= days;

/** يعيد قائمة [{ contract, score, reasons[] }] مرتبة من الأقرب */
export function findMatchingContracts(contracts, data) {
  const pdfUnits = unitSet(data.shopNumber);
  const pdfWords = words(data.tenantName);
  const pdfAmt = data.installments?.[0]?.amount || 0;
  return contracts.map((c) => {
    let score = 0;
    const reasons = [];
    if (data.ejarNo && c.ejarNo && c.ejarNo === data.ejarNo) { score += 100; reasons.push('نفس رقم عقد إيجار'); }
    const cu = unitSet(c.shopNumber);
    const overlap = [...pdfUnits].filter((u) => cu.has(u)).length;
    if (overlap && overlap === pdfUnits.size && overlap === cu.size) { score += 35; reasons.push('نفس رقم المحل'); }
    else if (overlap) { score += 20; reasons.push('رقم محل متقارب'); }
    if (data.tenantPhone && c.tenantPhone && c.tenantPhone.slice(-9) === data.tenantPhone.slice(-9)) { score += 30; reasons.push('نفس الجوال'); }
    const shared = [...pdfWords].filter((w) => words(c.tenantName).has(w) || words(c.brandName).has(w)).length;
    if (shared) { score += Math.min(20, shared * 10); reasons.push('تشابه في الاسم'); }
    if (c.startDate === data.startDate) { score += 20; reasons.push('نفس تاريخ البداية'); }
    else if (near(c.startDate, data.startDate, 31)) { score += 10; reasons.push('تاريخ بداية متقارب'); }
    if (c.endDate === data.endDate) { score += 15; reasons.push('نفس تاريخ النهاية'); }
    else if (near(c.endDate, data.endDate, 31)) { score += 7; }
    if (data.installments?.length && c.installments.length === data.installments.length) { score += 5; }
    if (pdfAmt && c.installments.some((i) => Math.abs(i.amount - pdfAmt) / pdfAmt < 0.02 || (i.vat === 0 && Math.abs(i.amount * 1.15 - pdfAmt) / pdfAmt < 0.02))) { score += 10; reasons.push('مبلغ دفعة مشابه'); }
    return { contract: c, score, reasons };
  }).filter((x) => x.score >= 25).sort((a, b) => b.score - a.score).slice(0, 5);
}

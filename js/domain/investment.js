/**
 * حسابات العائد على الاستثمار لكل مركز تجاري — دوال صافية.
 *
 *  الدخل السنوي      = مجموع الإيجار السنوي للعقود السارية والقادمة (غير المنتهية) في المركز
 *  إيجار الأرض       = قيمة الإيجار السنوي للأرض (صفر إذا كانت ملكاً)
 *  الصافي السنوي     = الدخل السنوي − إيجار الأرض
 *  رأس المال         = تكلفة الإنشاء + إيجار السنة الحالية
 *  نسبة العائد       = الصافي السنوي ÷ رأس المال
 *  صافي مدة الاستثمار = الصافي السنوي × سنوات الاستثمار − تكلفة الإنشاء
 *  سنوات الاسترداد   = تكلفة الإنشاء ÷ الصافي السنوي
 */
import { round2 } from '../utils/numbers.js';
import { contractPhase } from './contracts.js';

export function normalizeInvestment(raw) {
  const inv = raw || {};
  const ownership = inv.ownership === 'leased' ? 'leased' : 'owned';
  return {
    configured: !!raw,
    ownership,
    landRent: ownership === 'leased' ? Number(inv.landRent) || 0 : 0,
    buildCost: Number(inv.buildCost) || 0,
    years: Number(inv.years) || 0,
  };
}

export function centerInvestment(center, contracts) {
  const inv = normalizeInvestment(center.investment);
  const list = contracts.filter((c) => c.centerId === center.id && contractPhase(c) !== 'expired');
  const income = round2(list.reduce((s, c) => s + (Number(c.annualRent) || 0), 0));
  const net = round2(income - inv.landRent);
  const capital = round2(inv.buildCost + inv.landRent);
  const roi = capital > 0 ? net / capital : null;
  const totalNet = inv.years ? round2(net * inv.years - inv.buildCost) : null;
  const payback = net > 0 && inv.buildCost > 0 ? inv.buildCost / net : null;
  return { center, inv, contractsCount: list.length, income, net, capital, roi, totalNet, payback };
}

export function investmentTotals(rows) {
  const sum = (f) => round2(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0));
  const income = sum((r) => r.income);
  const landRent = sum((r) => r.inv.landRent);
  const buildCost = sum((r) => r.inv.buildCost);
  const net = round2(income - landRent);
  const capital = round2(buildCost + landRent);
  return { income, landRent, buildCost, net, capital, roi: capital > 0 ? net / capital : null };
}

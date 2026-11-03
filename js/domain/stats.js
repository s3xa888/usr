/**
 * الإحصائيات والتقارير — دوال صافية تعمل على قائمة العقود.
 */
import { todayISO, daysUntil } from '../utils/dates.js';
import { round2 } from '../utils/numbers.js';
import { isOutstanding, scheduleSummary } from './installments.js';
import { contractTotal, contractPhase } from './contracts.js';

const sum = (arr, f) => round2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0));

export function overview(contracts, today = todayISO()) {
  const active = contracts.filter((c) => contractPhase(c, today) !== 'expired');
  let outstandingTotal = 0, outstandingCount = 0, next30Total = 0, next30Count = 0, collectedTotal = 0;
  contracts.forEach((c) => {
    c.installments.forEach((i) => {
      if (i.paid) { collectedTotal += i.amount; return; }
      if (isOutstanding(i, today)) { outstandingTotal += i.amount; outstandingCount++; return; }
      const d = daysUntil(i.dueDate, today);
      if (d > 0 && d <= 30) { next30Total += i.amount; next30Count++; }
    });
  });
  const statusCounts = { vacant: 0, leased_closed: 0, leased_open: 0 };
  contracts.forEach((c) => { statusCounts[c.shopStatus] = (statusCounts[c.shopStatus] || 0) + 1; });
  return {
    contractsCount: contracts.length,
    activeCount: active.length,
    annualIncome: sum(active, (c) => c.annualRent),
    totalContractsValue: sum(contracts, contractTotal),
    outstandingTotal: round2(outstandingTotal),
    outstandingCount,
    next30Total: round2(next30Total),
    next30Count,
    collectedTotal: round2(collectedTotal),
    statusCounts,
    defaultersCount: contracts.filter((c) => c.installments.some((i) => isOutstanding(i, today))).length,
  };
}

export function incomeByCenter(centers, contracts) {
  return centers.map((center) => {
    const list = contracts.filter((c) => c.centerId === center.id);
    return {
      center,
      count: list.length,
      annual: sum(list, (c) => c.annualRent),
      total: sum(list, contractTotal),
      leased: list.filter((c) => c.shopStatus !== 'vacant').length,
    };
  });
}

export function countBy(contracts, keyFn) {
  const out = {};
  contracts.forEach((c) => { const k = keyFn(c); out[k] = (out[k] || 0) + 1; });
  return out;
}

/** المتعثرون: عقود فيها دفعات مستحقة غير مسددة أو معلّمة متعثرة */
export function defaulters(contracts, today = todayISO()) {
  return contracts
    .map((c) => {
      const s = scheduleSummary(c.installments, today);
      return { contract: c, count: s.outstandingCount, total: s.outstandingTotal, flagged: c.installments.filter((i) => !i.paid && i.lateFlag).length };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.total - a.total);
}

/** الاستحقاقات: لكل عقد قائمة دفعاته المستحقة/المتأخرة */
export function entitlements(contracts, today = todayISO()) {
  return contracts
    .map((c) => {
      const items = c.installments.filter((i) => isOutstanding(i, today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return { contract: c, items, total: sum(items, (i) => i.amount), oldest: items[0]?.dueDate || '' };
    })
    .filter((x) => x.items.length)
    .sort((a, b) => a.oldest.localeCompare(b.oldest));
}

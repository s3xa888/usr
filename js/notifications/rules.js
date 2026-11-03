/**
 * قواعد توليد التنبيهات — نفس المنطق موجود في functions/src/rules.js للخادم.
 * لإضافة نوع تنبيه جديد (مثلاً: انتهاء السجل التجاري) أضف دالة هنا وفي الخادم.
 */
import { APP_CONFIG } from '../config/app.config.js';
import { daysUntil, todayISO } from '../utils/dates.js';

export const ALERT_TYPES = {
  installment_due: { label: 'دفعة قادمة' },
  installment_overdue: { label: 'دفعة متأخرة' },
  contract_ending: { label: 'قرب انتهاء عقد' },
};

export function resolveWindows(general = {}) {
  return {
    windowDays: Number(general.windowDays) || APP_CONFIG.alerts.windowDays,
    urgentDays: Number(general.urgentDays) || APP_CONFIG.alerts.urgentDays,
    contractEndDays: Number(general.contractEndDays) || APP_CONFIG.alerts.contractEndDays,
  };
}

export function buildAlerts(contracts, centerNameOf, windows, today = todayISO()) {
  const out = [];
  for (const c of contracts) {
    const where = `محل ${c.shopNumber} · ${centerNameOf(c.centerId)}`;
    for (const inst of c.installments) {
      if (inst.paid) continue;
      const days = daysUntil(inst.dueDate, today);
      const overdue = days < 0 || inst.lateFlag;
      if (!overdue && days > windows.windowDays) continue;
      out.push({
        key: `i_${c.id}_${inst.n}_${inst.dueDate}`,
        type: overdue ? 'installment_overdue' : 'installment_due',
        severity: overdue ? 'danger' : days <= windows.urgentDays ? 'warning' : 'info',
        contractId: c.id,
        title: c.brandName,
        subtitle: where,
        amount: inst.remaining,
        date: inst.dueDate,
        days,
        installment: inst.n,
      });
    }
    if (c.endDate) {
      const days = daysUntil(c.endDate, today);
      if (days >= 0 && days <= windows.contractEndDays) {
        out.push({
          key: `e_${c.id}_${c.endDate}`,
          type: 'contract_ending',
          severity: days <= 30 ? 'warning' : 'info',
          contractId: c.id,
          title: c.brandName,
          subtitle: where,
          date: c.endDate,
          days,
        });
      }
    }
  }
  const rank = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.days - b.days);
}

export function alertMessage(a) {
  const n = Math.abs(a.days);
  if (a.type === 'contract_ending') return a.days === 0 ? 'ينتهي العقد اليوم' : `ينتهي العقد بعد ${n} يوم`;
  if (a.type === 'installment_overdue') return a.days < 0 ? `دفعة متأخرة ${n} يوم` : 'دفعة معلّمة متعثرة';
  return a.days === 0 ? 'دفعة مستحقة اليوم' : `دفعة مستحقة بعد ${n} يوم`;
}

/** التصنيفات: الأساسية من الإعدادات + الخاصة التي يضيفها المدير */
import { APP_CONFIG } from '../config/app.config.js';
import { store } from '../core/store.js';
import { html } from '../utils/dom.js';

export const CUSTOM_GROUP = 'تصنيفات مضافة';

export const customCategories = () => {
  const list = store.get('generalSettings')?.customCategories;
  const arr = Array.isArray(list) ? list : Object.values(list || {});
  return arr.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
};

export function categoryGroups() {
  const base = APP_CONFIG.categoryGroups;
  const known = new Set(base.flatMap((g) => g.items));
  const custom = customCategories().filter((x) => !known.has(x));
  return custom.length ? [...base.slice(0, -1), { group: CUSTOM_GROUP, items: custom }, base[base.length - 1]] : base;
}

/** مجموعة التصنيف (للإحصائيات) */
export function categoryGroupOf(cat) {
  for (const g of categoryGroups()) if (g.items.includes(cat)) return g.group;
  return cat ? CUSTOM_GROUP : 'أخرى';
}

/** قائمة اختيار مجمّعة */
export function categorySelect(selected = '', name = 'category') {
  const groups = categoryGroups();
  const all = groups.flatMap((g) => g.items);
  const extra = selected && !all.includes(selected) ? selected : '';
  return html`<select class="input" name="${name}">
    <option value="" ${selected ? '' : 'selected'} disabled>اختر التصنيف…</option>
    ${extra ? html`<option value="${extra}" selected>${extra}</option>` : ''}
    ${groups.map((g) => html`<optgroup label="${g.group}">${g.items.map((it) => html`<option value="${it}" ${it === selected ? 'selected' : ''}>${it}</option>`)}</optgroup>`)}
  </select>`;
}

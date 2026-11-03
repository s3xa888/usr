/**
 * أدوات DOM آمنة.
 * كل قيمة تمر عبر html`` تُهرَّب تلقائياً (حماية من XSS)،
 * إلا إذا غُلّفت عمداً بـ raw().
 */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}

class SafeHtml {
  constructor(str) { this.str = str; }
  toString() { return this.str; }
}

export const raw = (str) => new SafeHtml(String(str ?? ''));

function serialize(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.str;
  if (Array.isArray(v)) return v.map(serialize).join('');
  return esc(v);
}

/** قالب HTML يهرّب القيم تلقائياً ويعيد SafeHtml */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += serialize(values[i]);
  });
  return new SafeHtml(out);
}

export function setHTML(el, content) {
  if (el) el.innerHTML = serialize(content);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** ربط حدث بعناصر تطابق المحدد داخل جذر (event delegation) */
export function on(root, event, selector, handler) {
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

/** يقرأ قيم نموذج كاملاً كقاموس بحسب name */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

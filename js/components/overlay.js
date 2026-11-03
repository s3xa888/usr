/**
 * النوافذ المنبثقة، التأكيد، والإشعارات السريعة (Toast).
 */
import { html, setHTML, $ } from '../utils/dom.js';
import { icon } from './icons.js';

/* ================= Modal ================= */
const stack = [];

/**
 * openModal({ title, subtitle, size: 'sm'|'md'|'lg', body, footer, onMount, onClose })
 * يعيد { el, close }
 */
export function openModal({ title, subtitle = '', size = 'md', body = '', footer = '', onMount, onClose, dismissible = true }) {
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  setHTML(wrap, html`
    <div class="modal-backdrop" data-close="backdrop"></div>
    <section class="modal modal-${size}" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="modal-head">
        <div><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
        <button class="icon-btn" data-close aria-label="إغلاق">${icon('x', 20)}</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? html`<footer class="modal-foot">${footer}</footer>` : ''}
    </section>`);
  root.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stack.splice(stack.indexOf(api), 1);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 180);
    if (!stack.length) document.body.classList.remove('no-scroll');
    onClose?.();
  };
  const api = { el: wrap, close, dismissible };
  stack.push(api);

  wrap.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close]');
    if (!t) return;
    if (t.dataset.close === 'backdrop' && !dismissible) return;
    close();
  });
  onMount?.(wrap.querySelector('.modal'), close);
  setTimeout(() => wrap.querySelector('[autofocus], input:not([type=hidden]):not([readonly]), select, textarea')?.focus(), 60);
  return api;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});

export const closeAllModals = () => [...stack].forEach((m) => m.close());

/* ================= Confirm / Prompt ================= */
export function confirmDialog({ title = 'تأكيد', message = '', confirmText = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title,
      size: 'sm',
      body: html`<p class="confirm-text">${message}</p>`,
      footer: html`<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button><button class="btn btn-ghost" data-close>إلغاء</button>`,
      onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => { result = true; close(); }),
      onClose: () => resolve(result),
    });
  });
}

export function promptDialog({ title, label, value = '', confirmText = 'حفظ' }) {
  return new Promise((resolve) => {
    let result = null;
    openModal({
      title,
      size: 'sm',
      body: html`<form class="stack" data-form><label class="field"><span>${label}</span><input class="input" name="v" value="${value}" required autofocus></label></form>`,
      footer: html`<button class="btn btn-primary" data-ok>${confirmText}</button><button class="btn btn-ghost" data-close>إلغاء</button>`,
      onMount: (el, close) => {
        const submit = (e) => { e?.preventDefault(); const v = el.querySelector('input').value.trim(); if (v) { result = v; close(); } };
        el.querySelector('[data-ok]').addEventListener('click', submit);
        el.querySelector('[data-form]').addEventListener('submit', submit);
      },
      onClose: () => resolve(result),
    });
  });
}

/* ================= Toast ================= */
export function toast(message, tone = 'success', ms = 3200) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.setAttribute('role', 'status');
  const ic = { success: 'check', danger: 'alert', warning: 'alert', info: 'info' }[tone] || 'info';
  setHTML(el, html`${icon(ic, 18)}<span>${message}</span>`);
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, ms);
}

/** يعطّل زر الحفظ أثناء العملية ويعرض مؤشر انتظار */
export async function withBusy(button, fn) {
  if (!button) return fn();
  if (button.disabled) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-busy');
  try { return await fn(); }
  finally { button.disabled = false; button.classList.remove('is-busy'); button.innerHTML = original; }
}

export const showFieldErrors = (form, errors = {}) => {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('.has-error').forEach((e) => e.classList.remove('has-error'));
  Object.entries(errors).forEach(([name, msg]) => {
    const input = form.querySelector(`[name="${name}"]`) || $(`[data-error-slot="${name}"]`, form);
    const field = input?.closest('.field') || input;
    if (!field) return;
    field.classList.add('has-error');
    const small = document.createElement('small');
    small.className = 'field-error';
    small.textContent = msg;
    field.appendChild(small);
  });
  form.querySelector('.has-error input, .has-error select')?.focus();
};

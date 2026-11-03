/**
 * هيكل التطبيق: القائمة الجانبية، الشريط العلوي، شريط التبويبات في الجوال، ولوحة التنبيهات.
 */
import { APP_CONFIG } from '../config/app.config.js';
import { store, can } from '../core/store.js';
import { allPages, navigate } from '../core/router.js';
import { toggleTheme, resolvedTheme } from '../core/theme.js';
import { html, setHTML, on, $ } from '../utils/dom.js';
import { icon } from './icons.js';
import { logout } from '../services/auth.service.js';
import { notificationCenter } from '../notifications/notification-center.js';
import { alertItem } from '../pages/dashboard.js';
import { emptyState } from './ui.js';
import { closeAllModals } from './overlay.js';
import { openContractDetails } from '../pages/contract-details.js';

let el;
const unsubs = [];
const bind = (...args) => unsubs.push(on(...args));

export const logoSrc = () => store.get('branding')?.logo || 'assets/logo.svg';
export const appName = () => store.get('branding')?.name || APP_CONFIG.appName;

const visiblePages = () => allPages().filter((p) => p.nav && (!p.guard || p.guard()));

function sidebar() {
  const p = store.get('profile') || {};
  const role = p.role === 'owner' ? 'المالك' : p.role === 'admin' ? 'مدير نظام' : 'حساب تابع';
  return html`
    <div class="side-brand">
      <img class="brand-logo" src="${logoSrc()}" alt="">
      <div><strong data-app-name>${appName()}</strong><small>${APP_CONFIG.tagline}</small></div>
    </div>
    <nav class="side-nav">
      ${visiblePages().map((pg) => html`<a href="#/${pg.id}" data-nav="${pg.id}">${icon(pg.icon, 19)}<span>${pg.title}</span>${pg.id === 'entitlements' ? html`<em class="nav-count" data-ent-count hidden></em>` : ''}</a>`)}
    </nav>
    <div class="side-user">
      <span class="avatar">${(p.displayName || p.username || '?').slice(0, 1)}</span>
      <div><strong>${p.displayName || p.username}</strong><small>${role}</small></div>
      <button class="icon-btn" data-logout title="تسجيل الخروج">${icon('logout', 18)}</button>
    </div>`;
}

export function mountShell(root) {
  el = root;
  setHTML(el, html`
    <aside class="sidebar" data-sidebar>${sidebar()}</aside>
    <div class="side-scrim" data-close-side></div>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn only-mobile" data-open-side aria-label="القائمة">${icon('menu', 22)}</button>
        <img class="brand-logo only-mobile topbar-logo" src="${logoSrc()}" alt="">
        <h1 class="topbar-title" data-title></h1>
        <div class="topbar-actions">
          <span class="conn" data-conn title="حالة الاتصال"><i></i><span>متصل</span></span>
          <button class="icon-btn" data-theme-toggle title="تبديل المظهر">${icon(resolvedTheme() === 'dark' ? 'sun' : 'moon', 19)}</button>
          <button class="icon-btn bell" data-bell title="التنبيهات">${icon('bell', 20)}<em class="bell-count" data-bell-count hidden></em></button>
        </div>
      </header>
      <main class="content" id="page" tabindex="-1"></main>
    </div>
    <nav class="tabbar">
      ${visiblePages().filter((p) => p.tab).map((pg) => html`<a href="#/${pg.id}" data-nav="${pg.id}">${icon(pg.icon, 21)}<span>${pg.title}</span></a>`)}
      <button data-open-side>${icon('grid', 21)}<span>المزيد</span></button>
    </nav>
    <aside class="panel" data-panel aria-label="التنبيهات">
      <header class="panel-head"><h2>${icon('bell', 18)} التنبيهات</h2><button class="icon-btn" data-close-panel aria-label="إغلاق">${icon('x', 20)}</button></header>
      <div class="panel-body" data-panel-body></div>
      <footer class="panel-foot"><a class="btn btn-ghost btn-sm" href="#/settings/notify" data-close-panel>${icon('settings', 16)} إعدادات الإشعارات</a></footer>
    </aside>
    <div class="side-scrim panel-scrim" data-close-panel></div>`);

  const closeSide = () => el.classList.remove('side-open');
  const closePanel = () => el.classList.remove('panel-open');
  bind(el, 'click', '[data-open-side]', () => el.classList.add('side-open'));
  bind(el, 'click', '[data-close-side]', closeSide);
  bind(el, 'click', '[data-nav]', closeSide);
  bind(el, 'click', '[data-logout]', () => logout());
  bind(el, 'click', '[data-theme-toggle]', (e, b) => { toggleTheme(); setHTML(b, icon(resolvedTheme() === 'dark' ? 'sun' : 'moon', 19)); });
  bind(el, 'click', '[data-bell]', () => { renderPanel(); el.classList.add('panel-open'); });
  bind(el, 'click', '[data-close-panel]', closePanel);
  bind(el, 'click', '[data-panel] [data-open]', (e, b) => { closePanel(); openContractDetails(b.dataset.open); });
  bind(el, 'click', '[data-panel] [data-dismiss]', (e, b) => notificationCenter.dismiss(b.dataset.dismiss));
  const openPanel = () => { renderPanel(); el.classList.add('panel-open'); };
  const onKey = (e) => { if (e.key === 'Escape') { closePanel(); closeSide(); } };
  document.addEventListener('yusr:open-alerts', openPanel);
  document.addEventListener('keydown', onKey);
  unsubs.push(() => document.removeEventListener('yusr:open-alerts', openPanel), () => document.removeEventListener('keydown', onKey));

  unsubs.push(store.on('alerts', () => { updateBadges(); if (el.classList.contains('panel-open')) renderPanel(); }));
  unsubs.push(store.on('connected', updateConn));
  unsubs.push(store.on(['branding', 'profile', 'users'], refreshSidebar));
  updateBadges();
  updateConn();
}

function renderPanel() {
  const alerts = store.get('alerts');
  setHTML($('[data-panel-body]', el), alerts.length
    ? html`<ul class="alert-list">${alerts.map((a) => alertItem(a))}</ul>`
    : emptyState({ ic: 'check', title: 'لا توجد تنبيهات', text: 'سنخبرك هنا بالدفعات القادمة والمتأخرة' }));
}

function updateBadges() {
  const alerts = store.get('alerts');
  const urgent = alerts.filter((a) => a.severity !== 'info').length;
  const b = $('[data-bell-count]', el);
  if (b) { b.hidden = !alerts.length; b.textContent = alerts.length > 99 ? '99+' : alerts.length; b.classList.toggle('hot', urgent > 0); }
  const n = $('[data-ent-count]', el);
  const overdue = alerts.filter((a) => a.type === 'installment_overdue').length;
  if (n) { n.hidden = !overdue; n.textContent = overdue; }
}

function updateConn() {
  const c = $('[data-conn]', el);
  if (!c) return;
  const ok = store.get('connected');
  c.classList.toggle('off', !ok);
  c.querySelector('span').textContent = ok ? 'متصل' : 'غير متصل — سيتم الحفظ عند عودة الاتصال';
}

function refreshSidebar() {
  const side = $('[data-sidebar]', el);
  if (!side) return;
  const active = side.querySelector('.active')?.dataset.nav;
  setHTML(side, sidebar());
  if (active) side.querySelector(`[data-nav="${active}"]`)?.classList.add('active');
  el.querySelectorAll('.topbar-logo').forEach((img) => { img.src = logoSrc(); });
  updateBadges();
}

export function onPageChange(page) {
  $('[data-title]', el).textContent = page.title;
  document.title = `${page.title} · ${appName()}`;
  el.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page.id));
  el.classList.remove('side-open', 'panel-open');
  closeAllModals();
}

export function unmountShell() {
  unsubs.splice(0).forEach((u) => u());
  if (el) el.innerHTML = '';
}


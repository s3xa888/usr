/**
 * موجّه صفحات بسيط يعتمد على # في الرابط (يعمل على الاستضافة وتطبيق iOS بدون إعداد خادم).
 *
 * كل صفحة وحدة تصدّر:
 *   { id, title, icon, nav, guard?, deps?: string[], mount(el, params), update?(), unmount?() }
 */
import { store } from './store.js';

const routes = new Map();
let current = null;
let container = null;
let unsub = null;
let onChange = () => {};
let scheduled = false;

export function registerPage(page) { routes.set(page.id, page); }
export const allPages = () => [...routes.values()];
export const currentPage = () => current;

export function navigate(id, params = '') {
  const hash = `#/${id}${params ? `/${params}` : ''}`;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function parse() {
  const [, id = 'dashboard', ...rest] = (location.hash || '#/dashboard').split('/');
  return { id, params: rest.join('/') };
}

function render() {
  const { id, params } = parse();
  let page = routes.get(id) || routes.get('dashboard');
  if (page.guard && !page.guard()) page = routes.get('dashboard');

  if (current?.unmount) current.unmount();
  if (unsub) unsub();
  current = page;
  // عنصر جديد لكل صفحة حتى لا تتراكم مستمعات الأحداث بين الصفحات
  const host = document.createElement('div');
  host.className = `page page-${page.id}`;
  container.replaceChildren(host);
  window.scrollTo(0, 0);
  page.mount(host, params);
  onChange(page);

  if (page.deps?.length && page.update) {
    unsub = store.on(page.deps, () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; if (current === page) page.update(); });
    });
  }
}

export function startRouter(el, changeCb) {
  container = el;
  onChange = changeCb || onChange;
  window.addEventListener('hashchange', render);
  render();
}

export function stopRouter() {
  window.removeEventListener('hashchange', render);
  if (current?.unmount) current.unmount();
  if (unsub) unsub();
  current = null;
}

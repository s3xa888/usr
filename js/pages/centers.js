/** المراكز التجارية */
import { store, can } from '../core/store.js';
import { html, setHTML, on, $ } from '../utils/dom.js';
import { int, compactMoney, pct } from '../utils/numbers.js';
import { incomeByCenter } from '../domain/stats.js';
import { centersRepo } from '../services/repositories.js';
import { friendlyError } from '../services/errors.js';
import { pageHeader, emptyState, loadingBlock } from '../components/ui.js';
import { promptDialog, confirmDialog, toast, withBusy } from '../components/overlay.js';
import { icon } from '../components/icons.js';
import { navigate } from '../core/router.js';

let root;

const errMsg = (err) => (err?.code === 'duplicate' ? 'يوجد مركز بنفس الاسم' : err?.code === 'has-contracts' ? 'لا يمكن حذف مركز عليه عقود. انقل العقود أو احذفها أولاً' : friendlyError(err));

function render() {
  const box = $('[data-grid]', root);
  if (!store.get('loaded').centers) { setHTML(box, loadingBlock()); return; }
  const data = incomeByCenter(store.get('centers'), store.get('contracts'));
  if (!data.length) { setHTML(box, html`<div class="card">${emptyState({ ic: 'building', title: 'لا توجد مراكز تجارية', text: can.admin() ? 'أضف أول مركز من الأعلى' : '' })}</div>`); return; }
  setHTML(box, html`<div class="center-grid">${data.map((x) => html`
    <article class="center-card">
      <button class="center-open" data-open="${x.center.id}">
        <span class="center-ic">${icon('building', 22)}</span>
        <h3>${x.center.name}</h3>
        <div class="center-stats">
          <div><strong class="num">${int(x.count)}</strong><span>عقد</span></div>
          <div><strong class="num">${pct(x.leased, x.count)}٪</strong><span>إشغال</span></div>
          <div><strong class="num">${compactMoney(x.annual)}</strong><span>سنوياً</span></div>
        </div>
      </button>
      ${can.admin() ? html`<footer>
        <button class="btn btn-ghost btn-sm" data-rename="${x.center.id}">${icon('edit', 15)} تعديل الاسم</button>
        <button class="btn btn-ghost btn-sm text-danger" data-delete="${x.center.id}">${icon('trash', 15)} حذف</button>
      </footer>` : ''}
    </article>`)}</div>`);
}

export default {
  id: 'centers',
  title: 'المراكز التجارية',
  icon: 'building',
  nav: true,
  deps: ['centers', 'contracts', 'loaded'],
  mount(el) {
    root = el;
    setHTML(el, html`
      ${pageHeader({ title: 'المراكز التجارية', subtitle: 'أضف مراكزك وتابع أداء كل مركز' })}
      ${can.admin() ? html`
        <form class="card inline-form" data-add>
          <span class="inline-form-ic">${icon('plus', 18)}</span>
          <input class="input" name="name" placeholder="اسم المركز التجاري الجديد" required maxlength="120">
          <button class="btn btn-primary">إضافة المركز</button>
        </form>` : ''}
      <div data-grid></div>`);
    render();

    $('[data-add]', el)?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      withBusy(form.querySelector('button'), async () => {
        try { await centersRepo.add(form.name.value); form.reset(); toast('تمت إضافة المركز'); }
        catch (err) { toast(errMsg(err), 'danger'); }
      });
    });
    on(el, 'click', '[data-open]', (e, b) => navigate('contracts', b.dataset.open));
    on(el, 'click', '[data-rename]', async (e, b) => {
      const center = store.get('centers').find((c) => c.id === b.dataset.rename);
      const name = await promptDialog({ title: 'تعديل اسم المركز', label: 'الاسم الجديد', value: center.name });
      if (!name || name === center.name) return;
      try { await centersRepo.rename(center.id, name); toast('تم تعديل الاسم'); } catch (err) { toast(errMsg(err), 'danger'); }
    });
    on(el, 'click', '[data-delete]', async (e, b) => {
      const center = store.get('centers').find((c) => c.id === b.dataset.delete);
      if (store.get('contracts').some((c) => c.centerId === center.id)) { toast(errMsg({ code: 'has-contracts' }), 'warning'); return; }
      if (await confirmDialog({ title: 'حذف المركز', message: `هل تريد حذف "${center.name}"؟`, confirmText: 'حذف', danger: true })) {
        try { await centersRepo.remove(center.id); toast('تم حذف المركز'); } catch (err) { toast(errMsg(err), 'danger'); }
      }
    });
  },
  update: render,
};

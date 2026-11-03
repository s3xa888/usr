/** المراكز التجارية */
import { store, can } from '../core/store.js';
import { html, setHTML, on, $ } from '../utils/dom.js';
import { int, compactMoney, pct } from '../utils/numbers.js';
import { incomeByCenter } from '../domain/stats.js';
import { centersRepo } from '../services/repositories.js';
import { friendlyError } from '../services/errors.js';
import { pageHeader, emptyState, loadingBlock } from '../components/ui.js';
import { promptDialog, confirmDialog, toast, withBusy, openModal } from '../components/overlay.js';
import { createMap, searchPlace, parseCoords, googleMapsLink } from '../components/map.js';
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
      <footer>
        <button class="btn btn-ghost btn-sm ${x.center.location ? 'text-primary' : ''}" data-map="${x.center.id}">${icon(x.center.location ? 'pin' : 'map', 15)} ${x.center.location ? 'الموقع' : can.admin() ? 'تحديد الموقع' : 'الموقع'}</button>
        ${can.admin() ? html`
        <button class="btn btn-ghost btn-sm" data-rename="${x.center.id}">${icon('edit', 15)} تعديل الاسم</button>
        <button class="btn btn-ghost btn-sm text-danger" data-delete="${x.center.id}">${icon('trash', 15)} حذف</button>` : ''}
      </footer>
    </article>`)}</div>`);
}

/** نافذة الخريطة التفاعلية لمركز تجاري */
export function openCenterMap(centerId) {
  const center = store.get('centers').find((c) => c.id === centerId);
  if (!center) return;
  const editable = can.admin();
  let picked = center.location ? { ...center.location } : null;
  let mapApi = null;

  const coordsText = () => (picked ? `${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}` : 'لم يتم تحديد الموقع');

  openModal({
    title: `موقع ${center.name}`,
    subtitle: editable ? 'اضغط على الخريطة أو اسحب الدبوس، أو ابحث بالاسم، أو الصق إحداثيات / رابط خرائط Google' : '',
    size: 'lg',
    body: html`
      ${editable ? html`
        <form class="map-search" data-search>
          <input class="input" name="q" placeholder="ابحث عن المكان أو الصق الإحداثيات (24.71, 46.67)" autocomplete="off">
          <button class="btn btn-subtle">${icon('search', 16)} بحث</button>
          <button type="button" class="btn btn-ghost" data-locate title="موقعي الحالي">${icon('locate', 16)}<span class="hide-sm">موقعي</span></button>
        </form>
        <ul class="map-results" data-results hidden></ul>` : ''}
      <div class="map-box" data-map-el><div class="loading-block"><span class="spinner"></span> جارِ تحميل الخريطة…</div></div>
      <div class="map-meta">
        <span class="muted small num" dir="ltr" data-coords>${coordsText()}</span>
        <a class="btn btn-ghost btn-sm" data-gmaps target="_blank" rel="noopener noreferrer" ${picked ? html`href="${googleMapsLink(picked)}"` : 'hidden'}>${icon('map', 15)} فتح في خرائط Google</a>
      </div>`,
    footer: editable
      ? html`<button class="btn btn-primary" data-save-loc>${icon('check', 18)} حفظ الموقع</button>
          ${center.location ? html`<button class="btn btn-ghost text-danger" data-clear-loc>${icon('trash', 16)} إزالة الموقع</button>` : ''}
          <button class="btn btn-ghost" data-close>إغلاق</button>`
      : html`<button class="btn btn-ghost" data-close>إغلاق</button>`,
    onClose: () => mapApi?.destroy(),
    async onMount(el, close) {
      const mapEl = el.querySelector('[data-map-el]');
      const coordsEl = el.querySelector('[data-coords]');
      const gmaps = el.querySelector('[data-gmaps]');
      const results = el.querySelector('[data-results]');
      const onChange = (loc) => {
        picked = loc;
        coordsEl.textContent = coordsText();
        if (loc) { gmaps.href = googleMapsLink(loc); gmaps.hidden = false; } else gmaps.hidden = true;
      };
      const goTo = (loc) => { mapApi?.setMarker(loc, { fly: true, notify: true }); };

      if (!editable && !picked) {
        setHTML(mapEl, emptyState({ ic: 'map', title: 'لم يُحدَّد موقع هذا المركز بعد', text: 'يمكن لمدير النظام تحديده من هنا' }));
        return;
      }
      try {
        mapEl.innerHTML = '';
        mapApi = await createMap(mapEl, { location: picked, editable, onChange });
      } catch {
        setHTML(mapEl, emptyState({ ic: 'alert', title: 'تعذر تحميل الخريطة', text: 'تحقق من اتصال الإنترنت ثم أعد المحاولة' }));
        return;
      }
      if (!editable) return;

      el.querySelector('[data-search]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = e.currentTarget.q.value.trim();
        if (!q) return;
        const coords = parseCoords(q);
        if (coords) { results.hidden = true; goTo(coords); return; }
        await withBusy(e.currentTarget.querySelector('button:not([type=button])'), async () => {
          try {
            const list = await searchPlace(q);
            results.hidden = false;
            setHTML(results, list.length
              ? list.map((r, i) => html`<li><button type="button" data-pick="${i}">${icon('pin', 14)} <span>${r.label}</span></button></li>`)
              : html`<li class="muted small">لا توجد نتائج — جرّب اسماً آخر أو اضغط على الخريطة مباشرة</li>`);
            results.onclick = (ev) => { const b = ev.target.closest('[data-pick]'); if (!b) return; goTo(list[+b.dataset.pick]); results.hidden = true; };
          } catch { toast('تعذر البحث حالياً، اضغط على الخريطة لتحديد الموقع', 'warning'); }
        });
      });
      el.querySelector('[data-locate]').addEventListener('click', () => {
        if (!navigator.geolocation) { toast('المتصفح لا يدعم تحديد الموقع', 'warning'); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => toast('تعذر الوصول لموقعك — تأكد من السماح بالموقع للمتصفح', 'warning'),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
      el.querySelector('[data-save-loc]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        if (!picked) { toast('حدد الموقع على الخريطة أولاً', 'warning'); return; }
        try { await centersRepo.setLocation(center.id, picked); toast('تم حفظ موقع المركز'); close(); }
        catch (err) { toast(errMsg(err), 'danger'); }
      }));
      el.querySelector('[data-clear-loc]')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'إزالة الموقع', message: `هل تريد إزالة موقع "${center.name}" من الخريطة؟`, confirmText: 'إزالة', danger: true }))) return;
        try { await centersRepo.setLocation(center.id, null); toast('تمت إزالة الموقع'); close(); }
        catch (err) { toast(errMsg(err), 'danger'); }
      });
    },
  });
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
    on(el, 'click', '[data-map]', (e, b) => openCenterMap(b.dataset.map));
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

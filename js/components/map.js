/**
 * خرائط تفاعلية مجانية: Leaflet + OpenStreetMap (بدون مفتاح API).
 * تُحمَّل المكتبة عند فتح الخريطة فقط حتى لا تبطئ المنصة.
 */
const V = '1.9.4';
const JS_URL = `https://cdn.jsdelivr.net/npm/leaflet@${V}/dist/leaflet.js`;
const CSS_URL = `https://cdn.jsdelivr.net/npm/leaflet@${V}/dist/leaflet.css`;
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** مركز افتراضي: الرياض */
export const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };

let loading = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ||= new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: CSS_URL, crossOrigin: 'anonymous' })).dataset.leaflet = '1';
    }
    const s = Object.assign(document.createElement('script'), { src: JS_URL, async: true, crossOrigin: 'anonymous' });
    s.onload = () => resolve(window.L);
    s.onerror = () => { loading = null; reject(new Error('map-load-failed')); };
    document.head.appendChild(s);
  });
  return loading;
}

const pinIcon = (L) => L.divIcon({
  className: 'map-pin',
  html: '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7.5-6.6-7.5-12.2A7.5 7.5 0 0 1 19.5 9.8C19.5 15.4 12 22 12 22z" fill="currentColor" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="9.8" r="2.8" fill="#fff"/></svg>',
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

/**
 * ينشئ خريطة داخل عنصر.
 * editable: الضغط على الخريطة أو سحب الدبوس يغيّر الموقع ويستدعي onChange({lat,lng}).
 */
export async function createMap(el, { location = null, editable = false, onChange = () => {} } = {}) {
  const L = await loadLeaflet();
  const start = location || DEFAULT_CENTER;
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], location ? 16 : 11);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  let marker = null;

  const setMarker = (loc, { fly = false, notify = false } = {}) => {
    if (!loc) { marker?.remove(); marker = null; if (notify) onChange(null); return; }
    if (!marker) {
      marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(L), draggable: editable, keyboard: false }).addTo(map);
      if (editable) marker.on('dragend', () => { const p = marker.getLatLng(); onChange({ lat: p.lat, lng: p.lng }); });
    } else marker.setLatLng([loc.lat, loc.lng]);
    if (fly) map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    if (notify) onChange({ lat: loc.lat, lng: loc.lng });
  };

  if (location) setMarker(location);
  if (editable) map.on('click', (e) => setMarker({ lat: e.latlng.lat, lng: e.latlng.lng }, { notify: true }));

  // النافذة المنبثقة تتحرك عند الفتح — نعيد حساب الحجم بعد استقرارها
  setTimeout(() => map.invalidateSize(), 220);

  return {
    map,
    setMarker,
    destroy: () => map.remove(),
  };
}

/** البحث عن مكان بالاسم عبر Nominatim (مجاني) */
export async function searchPlace(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ar&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('search-failed');
  const data = await res.json();
  return data.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name }));
}

/** يقبل "24.71, 46.67" أو رابط خرائط Google يحتوي @lat,lng أو q=lat,lng */
export function parseCoords(text) {
  const s = String(text || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const m = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s) || /[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s) || /^\s*(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export const googleMapsLink = (loc) => `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;

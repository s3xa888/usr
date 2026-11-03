/**
 * الرسوم البيانية (Chart.js) — تُحمَّل فقط عند فتح صفحة التقارير.
 */
const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js';
let loading = null;

export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  loading ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: CHART_URL, async: true, crossOrigin: 'anonymous' });
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { loading = null; reject(new Error('chart-load-failed')); };
    document.head.appendChild(s);
  });
  return loading;
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** لوحة ألوان متمايزة تعمل على الخلفيتين الفاتحة والداكنة */
export const PALETTE = ['#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#0ea5e9', '#84cc16', '#f97316', '#a855f7', '#64748b'];

export async function renderChart(canvas, config) {
  const Chart = await loadChart();
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const text = css('--text-2') || '#64748b';
  const grid = css('--border') || '#e2e8f0';
  Chart.defaults.font.family = css('--font') || 'sans-serif';
  Chart.defaults.color = text;
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', rtl: true, labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
      tooltip: { rtl: true, textDirection: 'rtl' },
    },
  };
  if (config.type === 'bar') {
    base.scales = {
      x: { grid: { display: false }, ticks: { color: text } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: text, precision: 0 } },
    };
  }
  return new Chart(canvas, { ...config, options: deepMerge(base, config.options || {}) });
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a[k] || {}, v) : v;
  return out;
}

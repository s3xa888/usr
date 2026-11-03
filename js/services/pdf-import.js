/**
 * استيراد عقد من ملف PDF صادر من منصة "إيجار".
 * الملف يُقرأ داخل المتصفح فقط — لا يُرفع لأي خادم ولا يُحفظ، ولا توجد أي تكلفة.
 */
import { parseEjar } from '../domain/ejar-parser.js';
import { computeAnnualRent } from '../domain/contracts.js';
import { money } from '../utils/numbers.js';
import { store } from '../core/store.js';

const V = '6.2.108';
const BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/legacy/build`;

let pdfjsPromise = null;
function loadPdfJs() {
  pdfjsPromise ||= import(`${BASE}/pdf.min.mjs`).then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
    return mod;
  }).catch((err) => { pdfjsPromise = null; throw err; });
  return pdfjsPromise;
}

/** يستخرج عناصر النص مع مواقعها من كل الصفحات */
export async function readPdfItems(file) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  const items = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      tc.items.forEach((it) => { if (it.str) items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, str: it.str }); });
      page.cleanup();
    }
  } finally { (task.destroy ? task.destroy() : doc.destroy?.())?.catch?.(() => {}); }
  return items;
}

/**
 * يعيد { ok, reason?, data, warnings, source }
 * reason: 'not-pdf' | 'too-large' | 'no-text' | 'not-ejar' | 'load-failed'
 */
export async function importEjarPdf(file) {
  if (!file || !/pdf$/i.test(file.type || file.name)) return { ok: false, reason: 'not-pdf' };
  if (file.size > 15 * 1024 * 1024) return { ok: false, reason: 'too-large' };
  let items;
  try { items = await readPdfItems(file); }
  catch (err) { console.error(err); return { ok: false, reason: 'load-failed' }; }
  if (items.filter((i) => i.str.trim()).length < 30) return { ok: false, reason: 'no-text' };

  const r = parseEjar(items);
  if (!r.ok) return r;
  const warnings = [...r.warnings];
  const d = r.data;
  const computed = computeAnnualRent(d.installments, d.startDate, d.endDate);
  if (r.pdfAnnual && computed && Math.abs(computed - r.pdfAnnual) > 1) {
    warnings.push(`الإيجار السنوي المحسوب (${money(computed)}) يختلف عن المذكور في العقد (${money(r.pdfAnnual)}) — راجع الدفعات والتواريخ`);
  }
  if (d.ejarNo && store.get('contracts').some((c) => c.ejarNo === d.ejarNo)) {
    warnings.push(`يوجد عقد مسجل مسبقاً بنفس الرقم (${d.ejarNo})`);
  }
  return { ok: true, data: d, warnings, source: d.ejarNo ? `عقد إيجار رقم ${d.ejarNo}` : file.name };
}

export const IMPORT_ERRORS = {
  'not-pdf': 'اختر ملف PDF',
  'too-large': 'حجم الملف كبير جداً (الحد 15 ميجابايت)',
  'no-text': 'الملف لا يحتوي نصاً قابلاً للقراءة (قد يكون صورة ممسوحة ضوئياً)',
  'not-ejar': 'هذا الملف لا يبدو عقداً صادراً من منصة إيجار',
  'load-failed': 'تعذر قراءة الملف — تحقق من الإنترنت ثم أعد المحاولة',
};

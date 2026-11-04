/* يعمل قبل تحميل التطبيق: يطبق المظهر المحفوظ فوراً (بدون وميض)،
   ويعرض رسالة واضحة إذا تعذر تحميل المنصة (انقطاع إنترنت مثلاً). */
(function () {
  try {
    var t = localStorage.getItem('yusr_theme') || 'light';
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = 'light'; }

  // إصلاح الشاشة البيضاء: إذا فشل اتصال WebSocket مرة واحدة، تحفظ مكتبة Firebase علامة
  // في المتصفح وتتحول في كل فتح لاحق إلى "long-polling" — وهذا كان محجوباً بسياسة الأمان (CSP)
  // فيعلق الاتصال للأبد. نمسح العلامة عند كل تشغيل ليُجرَّب WebSocket أولاً دائماً.
  try { localStorage.removeItem('firebase:previous_websocket_failure'); } catch (e) {}

  // تظهر الرسالة إذا لم تُعرض أي شاشة فعلية (دخول/المنصة/خطأ) خلال 15 ثانية
  setTimeout(function () {
    if (window.__yusrShown) return;
    var el = document.getElementById('boot-msg');
    if (el) {
      el.textContent = 'تعذر تحميل المنصة. تحقق من اتصال الإنترنت ثم أعد المحاولة.';
      var b = document.getElementById('boot-retry');
      if (b) { b.hidden = false; b.onclick = function () { location.reload(); }; }
    }
  }, 15000);
})();

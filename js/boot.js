/* يعمل قبل تحميل التطبيق: يطبق المظهر المحفوظ فوراً (بدون وميض)،
   ويعرض رسالة واضحة إذا تعذر تحميل المكتبات (انقطاع إنترنت مثلاً). */
(function () {
  try {
    var t = localStorage.getItem('yusr_theme') || 'light';
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = 'light'; }

  setTimeout(function () {
    if (window.__yusrReady) return;
    var el = document.getElementById('boot-msg');
    if (el) {
      el.textContent = 'تعذر تحميل المنصة. تحقق من اتصال الإنترنت ثم أعد المحاولة.';
      var b = document.getElementById('boot-retry');
      if (b) { b.hidden = false; b.onclick = function () { location.reload(); }; }
    }
  }, 15000);
})();

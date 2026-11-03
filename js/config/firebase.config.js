/**
 * إعدادات الاتصال بمشروع Firebase.
 *
 * ⚠️ مهم: هذه القيم ليست "كلمة سر" — Google تصمّمها لتكون ظاهرة في أي تطبيق ويب أو جوال.
 * الحماية الحقيقية تأتي من:
 *   1) قواعد الأمان  database.rules.json  (منشورة على Firebase)
 *   2) تسجيل الدخول عبر Firebase Authentication
 *   3) تقييد المفتاح على نطاق موقعك من Google Cloud Console
 *   4) Firebase App Check (اختياري — فعّله من app.config.js)
 * التفاصيل كاملة في  docs/SECURITY.md
 *
 * هذا الملف مستثنى من Git (.gitignore). عند نقل المشروع لجهاز آخر انسخ
 * firebase.config.example.js باسم firebase.config.js وضع قيمك.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDj_BoyeRyjtBy6lrGmfscoIVmHU74GWIk',
  authDomain: 'uosr-ed44d.firebaseapp.com',
  databaseURL: 'https://uosr-ed44d-default-rtdb.firebaseio.com',
  projectId: 'uosr-ed44d',
  storageBucket: 'uosr-ed44d.firebasestorage.app',
  messagingSenderId: '1058267445871',
  appId: '1:1058267445871:web:228dec08531f5430566b9a',
  measurementId: 'G-MWK7ESRGDV',
};

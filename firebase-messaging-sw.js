/* Service Worker لاستقبال إشعارات Push والمنصة مغلقة (Firebase Cloud Messaging).
 * إعدادات Firebase تُمرَّر من الصفحة عبر الرابط، فلا داعي لتكرارها هنا. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

firebase.messaging().onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'منصة يُسر', { body: n.body || '', icon: 'assets/logo.svg', dir: 'rtl', lang: 'ar' });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./#/dashboard'));
});

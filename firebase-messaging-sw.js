/* H군 푸시 서비스 워커. 기존 sw.js와 별도 파일이며 동일 scope로 등록 시 기존 SW를 교체합니다. */
importScripts('https://www.gstatic.com/firebasejs/12.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging-compat.js');
firebase.initializeApp({
 apiKey:"AIzaSyDdDxvqtHium8R8NnaD5V07iZhBjUyhZmg",
 authDomain:"junmo-29054.firebaseapp.com",
 projectId:"junmo-29054",
 messagingSenderId:"271729254438",
 appId:"1:271729254438:web:cd6d48c1b3b0f743cf46e7"
});
firebase.messaging();
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
   const url=new URL('./',self.registration.scope).href;
   const existing=windows.find(w=>w.url.startsWith(url));
   return existing?existing.focus():clients.openWindow(url);
 }));
});

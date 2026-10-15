
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyCbLaMMyURD7j6l84qnbDi9Eaol9oABiVE",
  authDomain: "student-permissions-web.firebaseapp.com",
  projectId: "student-permissions-web",
  storageBucket: "student-permissions-web.firebasestorage.app",
  messagingSenderId: "717967595505",
  appId: "1:717967595505:web:2c3cc66527b23a6b5c1650"
});

const messaging = firebase.messaging();

// Optional: handle background data-only messages.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "College Permission";
  const options = {
    body: payload.notification?.body || "You have a new update.",
    icon: "/icon-192.png"
  };

  return self.registration.showNotification(title, options);
});

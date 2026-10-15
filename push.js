import { initializeApp, getApps } from
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
  getFirestore, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
  getMessaging, getToken, isSupported
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyCbLaMMyURD7j6l84qnbDi9Eaol9oABiVE",
  authDomain: "student-permissions-web.firebaseapp.com",
  projectId: "student-permissions-web",
  storageBucket: "student-permissions-web.firebasestorage.app",
  messagingSenderId: "717967595505",
  appId: "1:717967595505:web:2c3cc66527b23a6b5c1650"
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// Firebase Console లోని Web Push certificates నుంచి తీసుకున్న public VAPID key
const VAPID_KEY = "BDiJmkevr_HPOjJdEQk9tySWP16bObFiQ8le8oOZVOQ7p89KzrPr_JYLLPz3VqJrErTfnWVH9HKpnCL9xtO4Pus";

document.getElementById("enablePush")?.addEventListener(
  "click",
  async () => {
    try {
      if (!(await isSupported())) {
        alert("Push notifications are not supported.");
        return;
      }

      if (!auth.currentUser) {
        alert("Please log in first.");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        alert("Please allow notifications.");
        return;
      }

      const registration =
        await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );

      const messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        alert("Could not register this device.");
        return;
      }

      const user = auth.currentUser;

      await setDoc(
        doc(db, "users", user.uid, "fcmTokens", token),
        {
          token,
          updatedAt: serverTimestamp()
        }
      );

      alert("Push notifications enabled!");
    } catch (error) {
      console.error(error);
      alert("Setup failed. Check the browser console.");
    }
  }
);


import {
  getMessaging,
  getToken,
  isSupported,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const VAPID_KEY =
  "BDiJmkevr_HPOjJdEQk9tySWP16bObFiQ8le8oOZVOQ7p89KzrPr_JYLLPz3VqJrErTfnWVH9HKpnCL9xtO4Pus";

let messaging = null;
let messageListenerAdded = false;

async function enablePush() {
  try {
    if (!window.CPS_FIREBASE) {
      alert("Firebase is not ready. Refresh the page and try again.");
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      alert("This browser does not support push notifications.");
      return;
    }

    if (!(await isSupported())) {
      alert("Push notifications are not supported in this browser.");
      return;
    }

    const sessionText = localStorage.getItem("cps_currentUser");

    if (!sessionText) {
      alert("Please log in first.");
      return;
    }

    const user = JSON.parse(sessionText);
    const role = String(user.role || "").toLowerCase();

    let userId = "";

    if (role === "student") userId = user.regNo;
    if (role === "teacher") userId = user.teacherId;
    if (role === "hod") userId = user.hodId;
    if (role === "security") userId = user.securityId;

    if (!userId) {
      alert("Could not identify your logged-in account.");
      return;
    }

    if (!/^[A-Za-z0-9_-]+$/.test(VAPID_KEY)) {
      alert("Invalid VAPID key. Copy it again from Firebase Console.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      alert("Please allow notifications in your browser settings.");
      return;
    }

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    await navigator.serviceWorker.ready;

    const { db } = window.CPS_FIREBASE;

    messaging = getMessaging();

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      alert("Could not register this device.");
      return;
    }

    // Store token under the existing role-based user document.
    // Firestore Rules must explicitly permit this write.
    const documentId = `${role}_${userId}`;

    await setDoc(
      doc(db, "users", documentId, "fcmTokens", token),
      {
        token,
        role,
        userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    if (!messageListenerAdded) {
      onMessage(messaging, (payload) => {
        const title =
          payload.notification?.title || "College Permission";

        const body =
          payload.notification?.body || "You have a new update.";

        // Show an in-page alert while the website is open.
        alert(`${title}\n${body}`);
      });

      messageListenerAdded = true;
    }

    alert("Push notifications enabled successfully!");
  } catch (error) {
    console.error("Push notification setup failed:", error);
    alert(`Setup failed: ${error.message}`);
  }
}

document.getElementById("enablePush")?.addEventListener(
  "click",
  enablePush
);

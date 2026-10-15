// ================================================================
// 8. FCM PUSH NOTIFICATIONS
// ================================================================

import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const VAPID_KEY =
  "BDiJmkevr_HPOjJdEQk9tySWP16bObFiQ8le8oOZVOQ7p89KzrPr_JYLLPz3VqJrErTfnWVH9HKpnCL9xtO4Pus";

let fcmInitialized = false;
let foregroundListenerAdded = false;

async function initFCM() {
  if (fcmInitialized) return;

  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("This browser does not support web push notifications.");
      return;
    }

    // Verify the VAPID key contains only ASCII characters.
    if (!/^[A-Za-z0-9_-]+$/.test(VAPID_KEY)) {
      console.error(
        "Invalid VAPID key. Copy the Web Push public key again from Firebase Console."
      );
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("Notification permission was not granted.");
      return;
    }

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.warn("FCM did not return a token.");
      return;
    }

    window.CPS_FCM_TOKEN = token;
    console.log("FCM token generated successfully.");

    await saveFcmTokenToFirestore(token);

    if (!foregroundListenerAdded) {
      onMessage(messaging, (payload) => {
        console.log("Foreground push received:", payload);

        const title =
          payload.notification?.title || "College Permission";

        const body =
          payload.notification?.body || "You have a new update.";

        // Website is open: display a notification.
        if (Notification.permission === "granted") {
          new Notification(title, {
            body,
            icon: "/icon-192.png"
          });
        }
      });

      foregroundListenerAdded = true;
    }

    fcmInitialized = true;
    console.log("FCM initialization completed.");
  } catch (error) {
    console.error("FCM initialization failed:", error);
  }
}

async function saveFcmTokenToFirestore(token) {
  try {
    const session = localStorage.getItem("cps_currentUser");

    if (!session) {
      console.warn(
        "FCM token generated, but no logged-in user was found. Call CPS_INIT_FCM after login."
      );
      return;
    }

    const user = JSON.parse(session);
    const role = String(user.role || "").toLowerCase();

    let userId = "";

    if (role === "student") userId = user.regNo;
    if (role === "teacher") userId = user.teacherId;
    if (role === "hod") userId = user.hodId;
    if (role === "security") userId = user.securityId;

    if (!userId) {
      console.warn("Could not identify the logged-in user.");
      return;
    }

    const docId = `${role}_${userId}`;

    await setDoc(
      doc(db, "users", docId),
      {
        role,
        userId,
        fullName: user.fullName || "",
        fcmToken: token,
        tokenUpdatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    console.log("FCM token saved successfully for:", docId);
  } catch (error) {
    console.error(
      "Could not save FCM token. Check Firestore Rules:",
      error
    );
  }
}

// Keep this function available so login code can call it.
window.CPS_INIT_FCM = initFCM;

// Initialize after the existing Firebase boot process.
if (window.CPS_BOOT_DONE) {
  initFCM();
} else {
  window.addEventListener("cps-boot-ready", initFCM, { once: true });
}

/* ================================================================
   firebase-boot.js
   Firebase sync + real-time Firestore updates
   FCM registration is handled separately in push.js
================================================================ */

import { initializeApp, getApps } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 1. Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCbLaMMyURD7j6l84qnbDi9Eaol9oABiVE",
  authDomain: "student-permissions-web.firebaseapp.com",
  projectId: "student-permissions-web",
  storageBucket: "student-permissions-web.firebasestorage.app",
  messagingSenderId: "717967595505",
  appId: "1:717967595505:web:2c3cc66527b23a6b5c1650"
};

// 2. Initialize Firebase
const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);

// Make Firebase available to push.js
window.CPS_FIREBASE = { app, db, auth };

// 3. Collections synchronized with localStorage
const SYNCED_KEYS = [
  "cps_students",
  "cps_teachers",
  "cps_hods",
  "cps_security",
  "cps_permissions",
  "cps_gateLog",
  "cps_auditLog"
];

function keyToCollection(key) {
  return key.replace("cps_", "");
}

// 4. Bootstrap Firestore data
async function bootstrapFromFirestore() {
  console.log("Firebase boot: loading data...");

  try {
    for (const key of SYNCED_KEYS) {
      try {
        const collectionName = keyToCollection(key);
        const snapshot = await getDocs(
          collection(db, collectionName)
        );

        const rows = snapshot.docs.map(document => ({
          id: document.id,
          ...document.data()
        }));

        if (rows.length > 0 || !localStorage.getItem(key)) {
          originalSetItem(key, JSON.stringify(rows));
        }

        console.log(`${key}: ${rows.length} records loaded`);
      } catch (error) {
        console.warn(
          `Could not load ${key}:`,
          error.message
        );
      }
    }

    window.CPS_BOOT_DONE = true;
    window.dispatchEvent(new Event("cps-boot-ready"));

    console.log("Firebase boot completed.");

    startRealtimeListeners();
  } catch (error) {
    console.error("Firebase bootstrap failed:", error);
    window.CPS_BOOT_DONE = true;
    window.dispatchEvent(new Event("cps-boot-ready"));
  }
}

// 5. Generate document ID
function makeDocId(row) {
  if (row.permissionId) return row.permissionId;
  if (row.regNo) return row.regNo;
  if (row.teacherId) return row.teacherId;
  if (row.hodId) return row.hodId;
  if (row.securityId) return row.securityId;

  return (
    "doc_" +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

// 6. Push localStorage changes to Firestore
let suppressRemoteUntil = 0;

function suppressRemoteFor(milliseconds = 1200) {
  suppressRemoteUntil = Date.now() + milliseconds;
}

async function pushToFirestore(key, value) {
  try {
    suppressRemoteFor();

    const collectionName = keyToCollection(key);
    const rows = JSON.parse(value || "[]");

    const snapshot = await getDocs(
      collection(db, collectionName)
    );

    const existingIds = snapshot.docs.map(document => document.id);
    const newIds = new Set();

    for (const row of rows) {
      const documentId = row.id || makeDocId(row);

      newIds.add(documentId);

      const { id, ...dataToSave } = row;

      await setDoc(
        doc(db, collectionName, documentId),
        dataToSave,
        { merge: true }
      );
    }

    for (const existingId of existingIds) {
      if (!newIds.has(existingId)) {
        await deleteDoc(
          doc(db, collectionName, existingId)
        );
      }
    }
  } catch (error) {
    console.warn(
      `Firestore sync failed for ${key}:`,
      error.message
    );
  }
}

// 7. Hook localStorage methods
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

localStorage.setItem = function (key, value) {
  originalSetItem(key, value);

  if (
    SYNCED_KEYS.includes(key) &&
    window.CPS_BOOT_DONE
  ) {
    pushToFirestore(key, value).catch(console.error);
  }
};

localStorage.removeItem = function (key) {
  originalRemoveItem(key);

  if (
    SYNCED_KEYS.includes(key) &&
    window.CPS_BOOT_DONE
  ) {
    pushToFirestore(key, "[]").catch(console.error);
  }
};

// 8. Real-time Firestore listeners
let listenersStarted = false;

function startRealtimeListeners() {
  if (listenersStarted) return;

  listenersStarted = true;

  for (const key of SYNCED_KEYS) {
    const collectionName = keyToCollection(key);

    try {
      onSnapshot(
        collection(db, collectionName),
        snapshot => {
          if (Date.now() < suppressRemoteUntil) return;

          const rows = snapshot.docs.map(document => ({
            id: document.id,
            ...document.data()
          }));

          const json = JSON.stringify(rows);
          const current = localStorage.getItem(key) || "[]";

          if (current !== json) {
            originalSetItem(key, json);

            window.dispatchEvent(
              new CustomEvent("cps-data-updated", {
                detail: {
                  key,
                  collectionName,
                  count: rows.length
                }
              })
            );
          }
        },
        error => {
          console.warn(
            `Realtime listener failed for ${collectionName}:`,
            error.message
          );
        }
      );
    } catch (error) {
      console.warn(
        `Could not start listener for ${collectionName}:`,
        error.message
      );
    }
  }

  console.log("Firestore realtime listeners started.");
}

// 9. Authentication and boot sequence
onAuthStateChanged(auth, async user => {
  if (user) {
    await bootstrapFromFirestore();
  }
});

signInAnonymously(auth).catch(error => {
  console.error("Anonymous authentication failed:", error);

  window.CPS_BOOT_DONE = true;
  window.dispatchEvent(new Event("cps-boot-ready"));
});

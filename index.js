// functions/index.js
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { setGlobalOptions } = require("firebase-functions/v2");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

setGlobalOptions({ maxInstances: 10 });

// ================================================================
// Helper: Get FCM token for a user (role + userId)
// ================================================================
async function getTokenForUser(role, userId) {
  if (!userId) return null;
  const docId = `${role}_${userId}`;
  const doc = await db.collection("users").doc(docId).get();
  if (!doc.exists) return null;
  return doc.data().fcmToken || null;
}

// ================================================================
// Helper: Send notification
// ================================================================
async function sendNotification(token, title, body, data = {}) {
  if (!token) {
    console.log("⚠️ No token — skipping:", title);
    return;
  }
  try {
    await messaging.send({
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png"
        }
      }
    });
    console.log("✅ Sent:", title, "→", token.slice(0, 20) + "...");
  } catch (err) {
    console.warn("❌ Send failed:", err.message);
  }
}

// ================================================================
// 1. New permission request → Teacher + HOD కి notification
// ================================================================
exports.onPermissionCreated = onDocumentCreated("permissions/{permId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const p = snap.data();
  const permId = event.params.permId;

  console.log("🔔 New permission:", permId, "| Student:", p.fullName);

  const title = "🔔 New Permission Request";
  const body = `${p.fullName || "Student"} (${p.regNo || ""}) requested permission. Reason: ${p.reason || "N/A"}`;

  // Teacher కి పంపండి — same branch teachers
  const teachersSnap = await db.collection("users")
    .where("role", "==", "teacher")
    .get();

  for (const doc of teachersSnap.docs) {
    const t = doc.data();
    const tDept = (t.department || "").toUpperCase();
    const pBranch = (p.branch || "").toUpperCase();
    if (tDept && pBranch && tDept !== pBranch) continue;
    if (t.fcmToken) {
      await sendNotification(t.fcmToken, title, body, { permId, type: "new_request" });
    }
  }

  // HOD కి పంపండి — same branch HODs
  const hodsSnap = await db.collection("users")
    .where("role", "==", "hod")
    .get();

  for (const doc of hodsSnap.docs) {
    const h = doc.data();
    const hDepts = (h.department || "").toUpperCase().split(/[,/&|]+/).map(s => s.trim());
    const pBranch = (p.branch || "").toUpperCase();
    if (hDepts.length > 0 && !hDepts.includes(pBranch)) continue;
    if (h.fcmToken) {
      await sendNotification(h.fcmToken, title, body, { permId, type: "new_request" });
    }
  }
});

// ================================================================
// 2. Permission status update → relevant persons కి notification
// ================================================================
exports.onPermissionUpdated = onDocumentUpdated("permissions/{permId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const permId = event.params.permId;

  if (before.status === after.status) return; // status change లేదు

  console.log("🔔 Status change:", permId, "|", before.status, "→", after.status);

  const studentToken = await getTokenForUser("student", after.regNo);

  // Teacher approve
  if (after.status === "teacher_verified" && before.status !== "teacher_verified") {
    await sendNotification(studentToken,
      "🔔 Permission Update",
      `Your request ${permId} was approved by teacher. Awaiting HOD approval.`,
      { permId, type: "teacher_approved" });
  }

  // Teacher reject
  if (after.status === "teacher_rejected") {
    await sendNotification(studentToken,
      "🔔 Permission Rejected",
      `Your request ${permId} was rejected by teacher. Reason: ${after.rejectionReason || "N/A"}`,
      { permId, type: "teacher_rejected" });
  }

  // HOD approve
  if (after.status === "hod_approved") {
    await sendNotification(studentToken,
      "✅ Permission Approved",
      `Your request ${permId} has been approved by HOD. View your QR slip.`,
      { permId, type: "hod_approved" });
  }

  // HOD reject
  if (after.status === "hod_rejected") {
    await sendNotification(studentToken,
      "🔔 Permission Rejected",
      `Your request ${permId} was rejected by HOD. Reason: ${after.hodRejectionReason || "N/A"}`,
      { permId, type: "hod_rejected" });
  }

  // Student cancel
  if (after.status === "cancelled") {
    const teacherToken = await getTokenForUser("teacher", after.verifiedBy || "");
    if (teacherToken) {
      await sendNotification(teacherToken,
        "🔔 Request Cancelled",
        `${after.fullName} cancelled request ${permId}.`,
        { permId, type: "cancelled" });
    }
  }
});
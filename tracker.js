// ============================================================
// tracker.js — Page visit / session tracker backed by Firestore
// ============================================================
// Include this on ANY page you want tracked:
//   <script type="module" src="tracker.js"></script>
//
// It will:
//  1. Create a "session" document the moment the page loads.
//  2. Send a heartbeat every 15s while the tab is open/visible
//     (used by admin.html to compute "live now" — last 3 min).
//  3. Update final duration when the user leaves the page.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: Replace with your own Firebase config later.
const firebaseConfig = {
  apiKey: "AIzaSyAZ8vwzJlm9NINID0mOL8vNoDIZ3jV8JEE",
  authDomain: "reasoning-c9da6.firebaseapp.com",
  databaseURL: "https://reasoning-c9da6-default-rtdb.firebaseio.com",
  projectId: "reasoning-c9da6",
  storageBucket: "reasoning-c9da6.firebasestorage.app",
  messagingSenderId: "577618824685",
  appId: "1:577618824685:web:4523d90d58b265b24babe4",
  measurementId: "G-2S6C68TRRJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

// Page name = current file name (e.g. "index.html", "Page 1.html")
function getPageName() {
  const path = window.location.pathname;
  let name = path.substring(path.lastIndexOf("/") + 1);
  if (!name) name = "index.html";
  return decodeURIComponent(name);
}

// Unique id for this browser (kept in localStorage) — lets us
// (optionally) tell returning visitors apart in the future.
function getVisitorId() {
  let vid = localStorage.getItem("tracker_visitor_id");
  if (!vid) {
    vid = "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("tracker_visitor_id", vid);
  }
  return vid;
}

// Unique id for THIS page load / session.
function makeSessionId() {
  return "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

// YYYY-MM-DD key in local time, used for daily bucket queries.
function dateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// -----------------------------------------------------------
// Session tracking
// -----------------------------------------------------------

const pageName = getPageName();
const visitorId = getVisitorId();
const sessionId = makeSessionId();
const startTime = new Date();

const sessionRef = doc(collection(db, "sessions"), sessionId);

let sessionCreated = false;
let lastKnownDuration = 0;

async function createSession() {
  try {
    await setDoc(sessionRef, {
      page: pageName,
      visitorId,
      startTime: serverTimestamp(),
      startTimeClient: Timestamp.fromDate(startTime),
      lastHeartbeat: serverTimestamp(),
      hour: startTime.getHours(),
      dateKey: dateKey(startTime),
      duration: 0,
      userAgent: navigator.userAgent
    });
    sessionCreated = true;
  } catch (err) {
    console.error("[tracker.js] Failed to create session doc:", err);
  }
}

async function sendHeartbeat() {
  if (!sessionCreated) return;
  lastKnownDuration = Math.round((Date.now() - startTime.getTime()) / 1000);
  try {
    await updateDoc(sessionRef, {
      lastHeartbeat: serverTimestamp(),
      duration: lastKnownDuration
    });
  } catch (err) {
    console.error("[tracker.js] Heartbeat failed:", err);
  }
}

// Kick things off
createSession().then(() => {
  // First heartbeat shortly after creation, then every 15s.
  sendHeartbeat();
  setInterval(sendHeartbeat, 15000);
});

// Also send a heartbeat whenever the tab becomes visible again
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    sendHeartbeat();
  }
});

// Best-effort final update when the user leaves/hides the tab.
// The Firestore SDK's underlying fetch can be unreliable during
// unload, so we ALSO rely on the periodic 15s heartbeat above to
// keep "duration" reasonably accurate even if this final call
// never completes. "pagehide" fires more reliably than
// "beforeunload" on mobile browsers.
window.addEventListener("pagehide", () => {
  sendHeartbeat();
});
window.addEventListener("beforeunload", () => {
  sendHeartbeat();
});

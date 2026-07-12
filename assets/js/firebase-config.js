/* ============================================================
   JAYA WENTER APP — firebase-config.js
   Konfigurasi koneksi ke Firebase
   ============================================================

   CARA SETUP:
   1. Buka https://console.firebase.google.com
   2. Buat project baru → nama: "jaya-wenter-app"
   3. Buka Project Settings → General → Your apps → Add app → Web
   4. Salin firebaseConfig dari Firebase dan ganti di bawah ini
   5. Aktifkan Firestore Database (mode production)
   6. Aktifkan Authentication → Email/Password
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ── GANTI DENGAN CONFIG FIREBASE ANDA ── */
const firebaseConfig = {
  apiKey:            "AIzaSyBSP8W4_U3ltb0CROkEf_7k7k53VcSmq1E",
  authDomain:        "jaya-wenter-apps.firebaseapp.com",
  projectId:         "jaya-wenter-apps",
  storageBucket:     "jaya-wenter-apps.firebasestorage.app",
  messagingSenderId: "1049529642527",
  appId:             "1:1049529642527:web:dcb3f821f2bb6e28d62f2a"
};
/* ─────────────────────────────────────── */

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;

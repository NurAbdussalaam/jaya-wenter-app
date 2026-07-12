/* ============================================================
   DEPRECATED — functions/index.js
   File ini TIDAK digunakan dalam arsitektur v3.0+.
   Digantikan oleh folder /api (Express.js di Render).
   Lihat Blueprint Fase 1 untuk implementasi backend baru.
   Pertahankan file ini hanya sebagai referensi logika lama.
   ============================================================ */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const cors = require("cors")({ origin: true });

// ── CREATE AGEN ──
exports.createAgen = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { email, password, username, nama_lengkap, nomor_wa } = req.body;

      const userRecord = await admin.auth().createUser({ email, password });

      await admin.firestore().collection("users").doc(userRecord.uid).set({
        username, nama_lengkap, nomor_wa,
        role: "agen",
        aktif: true,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true, uid: userRecord.uid });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });
});

// ── RESET PASSWORD ──
exports.resetPassword = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, passwordBaru } = req.body;
      await admin.auth().updateUser(uid, { password: passwordBaru });
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });
});

// ── DELETE AGEN ──
exports.deleteAgen = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid } = req.body;
      await admin.auth().deleteUser(uid);
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });
});

/**
 * routes/permissions.js
 * Endpoint manajemen RBAC: roles dan permission override per user.
 * Semua endpoint hanya untuk owner.
 */

const express = require('express');
const admin   = require('firebase-admin');
const router  = express.Router();
const { verifyToken, requireOwner } = require('../middleware/auth');

// ── GET /api/permissions/roles ────────────────────────────────
// List semua role beserta array permissions.
router.get('/roles', verifyToken, requireOwner, async (req, res) => {
  try {
    const snap = await admin.firestore()
      .collection('roles')
      .orderBy('nama')
      .get();

    const roles = snap.docs.map(doc => ({
      id:          doc.id,
      nama:        doc.data().nama,
      label:       doc.data().label,
      permissions: doc.data().permissions || [],
      is_system:   doc.data().is_system || false
    }));

    res.json({ success: true, roles });

  } catch (err) {
    console.error('[GET /permissions/roles]', err);
    res.json({ success: false, message: err.message });
  }
});

// ── POST /api/permissions/update-role ────────────────────────
// Update permissions sebuah role.
// Body: { role_id, permissions: [] }
router.post('/update-role', verifyToken, requireOwner, async (req, res) => {
  try {
    const { role_id, permissions } = req.body;

    if (!role_id || !Array.isArray(permissions)) {
      return res.json({ success: false, message: 'role_id dan permissions (array) wajib diisi' });
    }

    const roleDoc = await admin.firestore().collection('roles').doc(role_id).get();
    if (!roleDoc.exists) {
      return res.json({ success: false, message: 'Role tidak ditemukan' });
    }

    await admin.firestore().collection('roles').doc(role_id).update({
      permissions,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[POST /permissions/update-role]', err);
    res.json({ success: false, message: err.message });
  }
});

// ── POST /api/permissions/add-role ───────────────────────────
// Tambah role baru (finance, supervisor, dll).
// Body: { nama, label, permissions: [] }
router.post('/add-role', verifyToken, requireOwner, async (req, res) => {
  try {
    const { nama, label, permissions } = req.body;

    if (!nama || !label || !Array.isArray(permissions)) {
      return res.json({ success: false, message: 'nama, label, dan permissions (array) wajib diisi' });
    }

    // Cek nama tidak duplikat
    const existing = await admin.firestore()
      .collection('roles')
      .where('nama', '==', nama.toLowerCase().trim())
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.json({ success: false, message: `Role '${nama}' sudah ada` });
    }

    const docRef = await admin.firestore().collection('roles').add({
      nama:        nama.toLowerCase().trim(),
      label:       label.trim(),
      permissions,
      is_system:   false,
      created_by:  req.user.uid,
      created_at:  admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, role_id: docRef.id });

  } catch (err) {
    console.error('[POST /permissions/add-role]', err);
    res.json({ success: false, message: err.message });
  }
});

// ── DELETE /api/permissions/role/:roleId ─────────────────────
// Hapus role custom. Role is_system tidak bisa dihapus.
router.delete('/role/:roleId', verifyToken, requireOwner, async (req, res) => {
  try {
    const { roleId } = req.params;

    const roleDoc = await admin.firestore().collection('roles').doc(roleId).get();
    if (!roleDoc.exists) {
      return res.json({ success: false, message: 'Role tidak ditemukan' });
    }

    if (roleDoc.data().is_system) {
      return res.json({ success: false, message: 'Role sistem tidak dapat dihapus' });
    }

    await admin.firestore().collection('roles').doc(roleId).delete();

    res.json({ success: true });

  } catch (err) {
    console.error('[DELETE /permissions/role]', err);
    res.json({ success: false, message: err.message });
  }
});

// ── POST /api/permissions/user-override ──────────────────────
// Set permissions_override untuk user tertentu.
// Body: { uid, permissions_override: [] }
router.post('/user-override', verifyToken, requireOwner, async (req, res) => {
  try {
    const { uid, permissions_override } = req.body;

    if (!uid || !Array.isArray(permissions_override)) {
      return res.json({ success: false, message: 'uid dan permissions_override (array) wajib diisi' });
    }

    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.json({ success: false, message: 'User tidak ditemukan' });
    }

    await admin.firestore().collection('users').doc(uid).update({
      permissions_override: permissions_override.length > 0 ? permissions_override : null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[POST /permissions/user-override]', err);
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;

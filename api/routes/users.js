/**
 * routes/users.js
 * CRUD user via Firebase Admin SDK.
 * Semua endpoint: verifyToken + requireOwner.
 */
const express = require('express');
const admin   = require('firebase-admin');
const router  = express.Router();
const { verifyToken, requireOwner } = require('../middleware/auth');

function usernameToEmail(username) {
  return `${username.toLowerCase().trim()}@jayawenter.local`;
}

// POST /api/users/create
router.post('/create', verifyToken, requireOwner, async (req, res) => {
  try {
    const { username, password, nama_lengkap, nomor_wa, role, agent_id, agent_nama, wilayah } = req.body;

    if (!username || !password || !nama_lengkap || !role) {
      return res.json({ success: false, message: 'username, password, nama_lengkap, role wajib diisi' });
    }

    const validRoles = ['owner', 'admin', 'kurir', 'agen_owner', 'agen_staff'];
    if (!validRoles.includes(role)) {
      return res.json({ success: false, message: `Role tidak valid. Pilih: ${validRoles.join(', ')}` });
    }

    // Auto-generate agent_id jika role agen_owner dan agent_id tidak dikirim
    let resolvedAgentId = agent_id || null;
    let resolvedAgentNama = agent_nama || null;

    if (role === 'agen_owner' && !agent_id) {
      const agentRef = admin.firestore().collection('agents').doc();
      resolvedAgentId = agentRef.id;
      resolvedAgentNama = nama_lengkap.trim();
      await agentRef.set({
        nama: nama_lengkap.trim(),
        nomor_wa: nomor_wa?.trim() || '',
        aktif: true,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    if ((role === 'agen_owner' || role === 'agen_staff') && !resolvedAgentId) {
      return res.json({ success: false, message: 'agent_id wajib untuk role agen_staff' });
    }

    const email = usernameToEmail(username);

    // Cek username sudah dipakai
    try {
      await admin.auth().getUserByEmail(email);
      return res.json({ success: false, message: 'Username sudah digunakan' });
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }

    const userRecord = await admin.auth().createUser({ email, password });

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      username: username.toLowerCase().trim(),
      nama_lengkap: nama_lengkap.trim(),
      nomor_wa: nomor_wa?.trim() || '',
      role,
      agent_id:   resolvedAgentId,
      agent_nama: resolvedAgentNama || null,
      wilayah:    (role === 'kurir' && wilayah) ? wilayah.trim() : null,
      permissions_override: null,
      aktif: true,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // Upsert agent_contacts jika agen
    if (resolvedAgentId && (role === 'agen_owner' || role === 'agen_staff')) {
      await admin.firestore().collection('agent_contacts').doc(userRecord.uid).set({
        agent_id: resolvedAgentId,
        user_id: userRecord.uid,
        name: nama_lengkap.trim(),
        phone: nomor_wa?.trim() || '',
        role: role === 'agen_owner' ? 'OWNER' : 'STAFF',
        active: true,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, uid: userRecord.uid });
  } catch (err) {
    console.error('[POST /users/create]', err);
    res.json({ success: false, message: err.message });
  }
});

// POST /api/users/reset-password
router.post('/reset-password', verifyToken, requireOwner, async (req, res) => {
  try {
    const { uid, passwordBaru } = req.body;
    if (!uid || !passwordBaru) {
      return res.json({ success: false, message: 'uid dan passwordBaru wajib diisi' });
    }
    if (passwordBaru.length < 6) {
      return res.json({ success: false, message: 'Password minimal 6 karakter' });
    }
    await admin.auth().updateUser(uid, { password: passwordBaru });
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /users/reset-password]', err);
    res.json({ success: false, message: err.message });
  }
});

// POST /api/users/delete
router.post('/delete', verifyToken, requireOwner, async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) return res.json({ success: false, message: 'uid wajib diisi' });
    if (uid === req.user.uid) {
      return res.json({ success: false, message: 'Tidak dapat menghapus akun sendiri' });
    }
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('users').doc(uid).delete();
    await admin.firestore().collection('agent_contacts').doc(uid).delete().catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /users/delete]', err);
    res.json({ success: false, message: err.message });
  }
});

// POST /api/users/toggle-aktif
router.post('/toggle-aktif', verifyToken, requireOwner, async (req, res) => {
  try {
    const { uid, aktif } = req.body;
    if (!uid || typeof aktif !== 'boolean') {
      return res.json({ success: false, message: 'uid dan aktif (boolean) wajib diisi' });
    }
    if (uid === req.user.uid) {
      return res.json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri' });
    }
    await admin.firestore().collection('users').doc(uid).update({
      aktif,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    await admin.firestore().collection('agent_contacts').doc(uid).update({
      active: aktif,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /users/toggle-aktif]', err);
    res.json({ success: false, message: err.message });
  }
});

// GET /api/users/list
router.get('/list', verifyToken, requireOwner, async (req, res) => {
  try {
    const { role } = req.query;
    let ref = admin.firestore().collection('users');
    const snap = role
      ? await ref.where('role', '==', role).orderBy('nama_lengkap').get()
      : await ref.orderBy('nama_lengkap').get();

    const users = snap.docs.map(doc => ({
      uid:          doc.id,
      username:     doc.data().username,
      nama_lengkap: doc.data().nama_lengkap,
      nomor_wa:     doc.data().nomor_wa,
      role:         doc.data().role,
      agent_id:     doc.data().agent_id,
      agent_nama:   doc.data().agent_nama,
      wilayah:      doc.data().wilayah,
      aktif:        doc.data().aktif
    }));

    res.json({ success: true, users });
  } catch (err) {
    console.error('[GET /users/list]', err);
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;


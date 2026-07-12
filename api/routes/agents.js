/**
 * routes/agents.js
 * Endpoint manajemen agen: assign kurir default dan temporary courier.
 * Semua endpoint hanya untuk owner.
 */

const express = require('express');
const admin   = require('firebase-admin');
const router  = express.Router();
const { verifyToken, requireOwner } = require('../middleware/auth');

// ── POST /api/agents/assign-courier ──────────────────────────
// Set default_courier_id pada agen.
// Body: { agent_id, courier_id, courier_nama }
router.post('/assign-courier', verifyToken, requireOwner, async (req, res) => {
  try {
    const { agent_id, courier_id, courier_nama } = req.body;

    if (!agent_id || !courier_id || !courier_nama) {
      return res.json({ success: false, message: 'agent_id, courier_id, courier_nama wajib diisi' });
    }

    // Pastikan agent ada
    const agentDoc = await admin.firestore().collection('agents').doc(agent_id).get();
    if (!agentDoc.exists) {
      return res.json({ success: false, message: 'Agen tidak ditemukan' });
    }

    // Pastikan courier adalah user aktif dengan role kurir
    const courierDoc = await admin.firestore().collection('users').doc(courier_id).get();
    if (!courierDoc.exists || courierDoc.data().role !== 'kurir') {
      return res.json({ success: false, message: 'Kurir tidak ditemukan atau role bukan kurir' });
    }

    await admin.firestore().collection('agents').doc(agent_id).update({
      default_courier_id:   courier_id,
      default_courier_nama: courier_nama,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[POST /agents/assign-courier]', err);
    res.json({ success: false, message: err.message });
  }
});

// ── POST /api/agents/temp-courier ────────────────────────────
// Set kurir pengganti sementara untuk agen.
// Body: { agent_id, courier_id, courier_nama, berlaku_dari, berlaku_sampai, alasan }
router.post('/temp-courier', verifyToken, requireOwner, async (req, res) => {
  try {
    const {
      agent_id, courier_id, courier_nama,
      berlaku_dari, berlaku_sampai, alasan
    } = req.body;

    if (!agent_id || !courier_id || !courier_nama || !berlaku_dari || !berlaku_sampai || !alasan) {
      return res.json({
        success: false,
        message: 'agent_id, courier_id, courier_nama, berlaku_dari, berlaku_sampai, alasan wajib diisi'
      });
    }

    // Validasi tanggal
    if (berlaku_dari > berlaku_sampai) {
      return res.json({ success: false, message: 'berlaku_dari tidak boleh setelah berlaku_sampai' });
    }

    // Pastikan agen ada
    const agentDoc = await admin.firestore().collection('agents').doc(agent_id).get();
    if (!agentDoc.exists) {
      return res.json({ success: false, message: 'Agen tidak ditemukan' });
    }

    const tempCourier = {
      courier_id,
      courier_nama,
      berlaku_dari,
      berlaku_sampai,
      alasan: alasan.trim()
    };

    await admin.firestore().collection('agents').doc(agent_id).update({
      temp_courier: tempCourier,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[POST /agents/temp-courier]', err);
    res.json({ success: false, message: err.message });
  }
});

// ── DELETE /api/agents/temp-courier/:agentId ─────────────────
// Batalkan temporary courier assignment sebelum tanggal berakhir.
router.delete('/temp-courier/:agentId', verifyToken, requireOwner, async (req, res) => {
  try {
    const { agentId } = req.params;

    const agentDoc = await admin.firestore().collection('agents').doc(agentId).get();
    if (!agentDoc.exists) {
      return res.json({ success: false, message: 'Agen tidak ditemukan' });
    }

    await admin.firestore().collection('agents').doc(agentId).update({
      temp_courier: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[DELETE /agents/temp-courier]', err);
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;

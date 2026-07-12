/**
 * middleware/auth.js
 * Verifikasi Firebase ID Token dari header Authorization.
 */
const admin = require('firebase-admin');

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
    }
    const userData = userDoc.data();
    if (!userData.aktif) {
      return res.status(403).json({ success: false, message: 'Akun tidak aktif' });
    }
    req.user = { uid: decoded.uid, ...userData };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid: ' + err.message });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Hanya owner yang diizinkan' });
  }
  next();
}

function requireOwnerOrAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  next();
}

module.exports = { verifyToken, requireOwner, requireOwnerOrAdmin };

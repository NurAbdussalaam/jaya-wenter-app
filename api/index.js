/**
 * api/index.js
 * Entry point Backend API Jaya Wenter.
 * Deploy sebagai Vercel Serverless Function.
 *
 * Arsitektur: Express.js + Firebase Admin SDK
 * Auth: Firebase ID Token via Authorization: Bearer header
 */

const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');

// ── Inisialisasi Firebase Admin ───────────────────────────────
// Service Account diambil dari environment variable FIREBASE_SERVICE_ACCOUNT
// JANGAN hardcode credential di sini.
let serviceAccount;
let initializationError = null;
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('Environment variable FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi');
  }
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error('[FATAL] FIREBASE_SERVICE_ACCOUNT tidak valid atau tidak diset.');
  console.error('Pastikan env var sudah diset di Vercel Project Settings.');
  initializationError = err;
}

if (!initializationError) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[Firebase Admin] Initialized — project:', serviceAccount.project_id);
  } catch (err) {
    console.error('[FATAL] Firebase Admin gagal diinisialisasi:', err);
    initializationError = err;
  }
}

// ── Express Setup ─────────────────────────────────────────────
const app = express();

// CORS — izinkan frontend Vercel; ALLOWED_ORIGIN dapat dikunci di environment.
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Kembalikan error konfigurasi sebagai JSON agar client tidak menerima HTML.
app.use((req, res, next) => {
  if (initializationError) {
    return res.status(500).json({
      success: false,
      message: initializationError.message
    });
  }
  next();
});

// Log setiap request (sederhana, tidak butuh library berat)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/health',      require('./routes/health'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/agents',      require('./routes/agents'));
app.use('/api/permissions', require('./routes/permissions'));

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Endpoint tidak ditemukan: ${req.method} ${req.path}` });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// ── Local server / Vercel handler ─────────────────────────────
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Jaya Wenter API] Running on port ${PORT}`);
    console.log(`[CORS] Allowed origin: ${allowedOrigin}`);
    console.log('[Routes] /api/health, /api/users, /api/agents, /api/permissions');
  });
}

// Vercel invokes the exported Express app as the serverless handler.
module.exports = app;

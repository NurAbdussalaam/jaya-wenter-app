/**
 * tools/backup-firestore.js
 * Backup seluruh collection Firestore ke file JSON lokal.
 *
 * ✅ Kompatibel dengan Firebase Spark Plan (gratis)
 * ✅ Tidak memerlukan Blaze Plan atau Google Cloud Storage
 * ✅ Berjalan di Node.js lokal (Windows / Mac / Linux)
 *
 * Cara menjalankan:
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' node tools/backup-firestore.js
 *   atau
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node tools/backup-firestore.js
 *
 * Hasil backup disimpan di: backups/backup-YYYY-MM-DD-HH-mm.json
 */

const admin  = require('firebase-admin');
const fs     = require('fs');
const path   = require('path');

// ── Inisialisasi Firebase Admin ───────────────────────────────
function initFirebase() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(sa) });
      return sa.project_id;
    } catch {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT tidak valid JSON');
      process.exit(1);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return 'unknown-project';
  } else {
    console.error('❌ Set FIREBASE_SERVICE_ACCOUNT atau GOOGLE_APPLICATION_CREDENTIALS');
    console.error('   Contoh: FIREBASE_SERVICE_ACCOUNT=\'{"type":"service_account",...}\' node tools/backup-firestore.js');
    process.exit(1);
  }
}

// ── Daftar semua collection yang dibackup ────────────────────
// Urutan tidak penting — semua akan dibackup
const COLLECTIONS = [
  // Schema lama (existing)
  'users',
  'orders',
  'hutang',
  'pembayaran',
  'keuangan',
  'jadwal',
  'settings',
  // Schema baru (Blueprint v4.1 — mungkin belum ada, akan di-skip otomatis)
  'agents',
  'roles',
  'permissions',
  'tagihan',
  'invoices',
  'kunjungan',
  'setoran_kurir',
  'pelanggan',
  'customers',
  'agent_contacts',
  'audit_log',
  'batch_jobs',
];

// ── Helper: format tanggal untuk nama file ───────────────────
function getTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
       + `-${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

// ── Helper: konversi Firestore Timestamp ke ISO string ───────
function serializeValue(val) {
  if (val === null || val === undefined) return val;
  if (val && typeof val.toDate === 'function') return { _type: 'Timestamp', value: val.toDate().toISOString() };
  if (Array.isArray(val)) return val.map(serializeValue);
  if (typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val)) out[k] = serializeValue(val[k]);
    return out;
  }
  return val;
}

// ── Backup satu collection ───────────────────────────────────
async function backupCollection(db, collectionName) {
  try {
    const snap = await db.collection(collectionName).get();
    if (snap.empty) return { name: collectionName, docs: [], count: 0, skipped: false };

    const docs = {};
    for (const doc of snap.docs) {
      docs[doc.id] = serializeValue(doc.data());

      // Backup subcollection orders/history jika ada
      if (collectionName === 'orders') {
        const histSnap = await doc.ref.collection('history').get();
        if (!histSnap.empty) {
          docs[doc.id]._subcollections = { history: {} };
          for (const h of histSnap.docs) {
            docs[doc.id]._subcollections.history[h.id] = serializeValue(h.data());
          }
        }
      }
    }

    return { name: collectionName, docs, count: snap.size, skipped: false };
  } catch (err) {
    // Collection tidak ada = skip (tidak error)
    if (err.code === 5 || err.message?.includes('NOT_FOUND')) {
      return { name: collectionName, docs: {}, count: 0, skipped: true };
    }
    throw err;
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  JAYA WENTER — Backup Firestore');
  console.log('═══════════════════════════════════════════════\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}`);
  console.log(`Collections yang akan dibackup: ${COLLECTIONS.length}\n`);

  const result = {
    metadata: {
      backup_date:  new Date().toISOString(),
      project_id:   projectId,
      tool_version: '1.0.0',
      collections:  COLLECTIONS.length
    },
    data: {}
  };

  let totalDocs   = 0;
  let totalCols   = 0;
  let skippedCols = 0;

  for (const colName of COLLECTIONS) {
    process.stdout.write(`  Backup ${colName.padEnd(20)}`);
    const col = await backupCollection(db, colName);

    if (col.skipped) {
      console.log(`⬜ skip (belum ada)`);
      skippedCols++;
    } else {
      console.log(`✅ ${col.count} dokumen`);
      result.data[colName] = col.docs;
      totalDocs += col.count;
      totalCols++;
    }
  }

  // Simpan ke file
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename  = `backup-${getTimestamp()}.json`;
  const filepath  = path.join(backupDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf8');

  const sizeKB = (fs.statSync(filepath).size / 1024).toFixed(1);

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  ✅ Backup selesai`);
  console.log(`  Collections : ${totalCols} berhasil, ${skippedCols} di-skip`);
  console.log(`  Total dokumen: ${totalDocs}`);
  console.log(`  File        : backups/${filename}`);
  console.log(`  Ukuran      : ${sizeKB} KB`);
  console.log('═══════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Backup gagal:', err.message);
  process.exit(1);
});

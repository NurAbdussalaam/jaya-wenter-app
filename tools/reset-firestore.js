/**
 * tools/reset-firestore.js
 * Hapus seluruh collection Firestore development.
 *
 * ✅ Kompatibel dengan Firebase Spark Plan (gratis)
 *
 * ⚠️  PERINGATAN KERAS:
 *     Script ini akan MENGHAPUS PERMANEN seluruh data di Firestore.
 *     Tidak dapat di-undo. Backup dulu sebelum reset.
 *
 * Cara menjalankan:
 *   node tools/reset-firestore.js
 *
 * Anda harus mengetik YES untuk konfirmasi.
 */

const admin    = require('firebase-admin');
const readline = require('readline');

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
    process.exit(1);
  }
}

// ── Daftar collection yang akan dihapus ──────────────────────
const COLLECTIONS_TO_DELETE = [
  // Schema lama
  'users',
  'orders',
  'hutang',
  'pembayaran',
  'keuangan',
  'jadwal',
  'settings',
  'pelanggan',
  // Schema baru (jika sudah ada dari migrasi)
  'agents',
  'roles',
  'permissions',
  'tagihan',
  'invoices',
  'kunjungan',
  'setoran_kurir',
  'customers',
  'agent_contacts',
  'audit_log',
  'batch_jobs',
];

// ── Helper: konfirmasi interaktif ─────────────────────────────
function konfirmasi(pertanyaan) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pertanyaan, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ── Hapus semua dokumen dalam satu collection ─────────────────
// Firestore tidak bisa hapus collection langsung — harus hapus per dokumen
async function deleteCollection(db, colName, batchSize = 100) {
  let total = 0;
  while (true) {
    const snap = await db.collection(colName).limit(batchSize).get();
    if (snap.empty) break;

    // Hapus subcollection orders/history terlebih dahulu
    if (colName === 'orders') {
      for (const doc of snap.docs) {
        const histSnap = await doc.ref.collection('history').get();
        if (!histSnap.empty) {
          const subBatch = db.batch();
          histSnap.docs.forEach(h => subBatch.delete(h.ref));
          await subBatch.commit();
        }
      }
    }

    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;
  }
  return total;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  JAYA WENTER — Reset Firestore (Development)');
  console.log('═══════════════════════════════════════════════\n');

  console.log('⚠️  ⚠️  ⚠️  PERINGATAN KERAS  ⚠️  ⚠️  ⚠️');
  console.log('');
  console.log('Script ini akan MENGHAPUS PERMANEN semua data di Firestore.');
  console.log('Tindakan ini TIDAK DAPAT DI-UNDO.');
  console.log('');
  console.log('Collection yang akan dihapus:');
  COLLECTIONS_TO_DELETE.forEach(c => console.log(`  - ${c}`));
  console.log('');
  console.log('Pastikan sudah melakukan backup terlebih dahulu:');
  console.log('  node tools/backup-firestore.js');
  console.log('');

  // Konfirmasi pertama
  const jawaban1 = await konfirmasi('Apakah Anda yakin ingin menghapus seluruh data? Ketik YES: ');
  if (jawaban1 !== 'YES') {
    console.log('\n✅ Reset dibatalkan. Data tidak ada yang dihapus.');
    process.exit(0);
  }

  // Konfirmasi kedua (double-check)
  const jawaban2 = await konfirmasi('Konfirmasi ulang — ketik YES sekali lagi untuk melanjutkan: ');
  if (jawaban2 !== 'YES') {
    console.log('\n✅ Reset dibatalkan. Data tidak ada yang dihapus.');
    process.exit(0);
  }

  console.log('\nMemulai reset database...\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Terhubung ke project: ${projectId}\n`);

  let totalDeleted = 0;
  let totalSkipped = 0;
  let totalFailed  = 0;

  for (const colName of COLLECTIONS_TO_DELETE) {
    process.stdout.write(`  Hapus ${colName.padEnd(20)}`);
    try {
      const count = await deleteCollection(db, colName);
      if (count === 0) {
        console.log('⬜ kosong / tidak ada');
        totalSkipped++;
      } else {
        console.log(`🗑️  ${count} dokumen dihapus`);
        totalDeleted += count;
      }
    } catch (err) {
      console.log(`❌ Gagal: ${err.message}`);
      totalFailed++;
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  🗑️  Reset selesai`);
  console.log(`  Total dihapus : ${totalDeleted} dokumen`);
  console.log(`  Di-skip       : ${totalSkipped} collection (sudah kosong)`);
  if (totalFailed > 0) {
    console.log(`  ❌ Gagal      : ${totalFailed} collection`);
  }
  console.log('\n  Database sudah bersih. Jalankan seed untuk isi ulang:');
  console.log('  node tools/seed-firestore.js');
  console.log('═══════════════════════════════════════════════');

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Reset gagal:', err.message);
  process.exit(1);
});

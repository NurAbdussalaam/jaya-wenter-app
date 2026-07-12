/**
 * tools/restore-firestore.js
 * Restore Firestore dari file JSON hasil backup.
 *
 * ✅ Kompatibel dengan Firebase Spark Plan (gratis)
 *
 * Cara menjalankan:
 *   node tools/restore-firestore.js backups/backup-2026-07-03-14-30.json
 *
 * PERINGATAN: Restore akan MENIMPA data yang sudah ada di Firestore.
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
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

// ── Helper: konfirmasi interaktif ────────────────────────────
function konfirmasi(pertanyaan) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pertanyaan, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ── Helper: deserialisasi Timestamp dari JSON ────────────────
function deserializeValue(val) {
  if (val === null || val === undefined) return val;
  if (val && val._type === 'Timestamp') {
    return admin.firestore.Timestamp.fromDate(new Date(val.value));
  }
  if (Array.isArray(val)) return val.map(deserializeValue);
  if (typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val)) {
      if (k === '_subcollections') continue; // skip — restore subcol terpisah
      out[k] = deserializeValue(val[k]);
    }
    return out;
  }
  return val;
}

// ── Restore satu collection ──────────────────────────────────
async function restoreCollection(db, colName, docs) {
  const ids = Object.keys(docs);
  if (ids.length === 0) return 0;

  let count = 0;
  // Proses dalam batch 499 (limit Firestore)
  const chunks = [];
  for (let i = 0; i < ids.length; i += 499) chunks.push(ids.slice(i, i + 499));

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const docId of chunk) {
      const data = deserializeValue(docs[docId]);
      batch.set(db.collection(colName).doc(docId), data);
      count++;
    }
    await batch.commit();
  }

  // Restore subcollection orders/history jika ada
  for (const docId of ids) {
    const subCols = docs[docId]?._subcollections;
    if (!subCols) continue;
    for (const [subColName, subDocs] of Object.entries(subCols)) {
      const subIds = Object.keys(subDocs);
      if (subIds.length === 0) continue;
      const subChunks = [];
      for (let i = 0; i < subIds.length; i += 499) subChunks.push(subIds.slice(i, i + 499));
      for (const chunk of subChunks) {
        const batch = db.batch();
        for (const subId of chunk) {
          const data = deserializeValue(subDocs[subId]);
          batch.set(db.collection(colName).doc(docId).collection(subColName).doc(subId), data);
        }
        await batch.commit();
      }
    }
  }

  return count;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const backupFile = process.argv[2];

  console.log('═══════════════════════════════════════════════');
  console.log('  JAYA WENTER — Restore Firestore');
  console.log('═══════════════════════════════════════════════\n');

  // Validasi argument
  if (!backupFile) {
    console.error('❌ Sertakan path file backup.');
    console.error('   Contoh: node tools/restore-firestore.js backups/backup-2026-07-03-14-30.json');
    process.exit(1);
  }

  const filepath = path.resolve(backupFile);
  if (!fs.existsSync(filepath)) {
    console.error(`❌ File tidak ditemukan: ${filepath}`);
    process.exit(1);
  }

  // Baca file backup
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    console.error('❌ File backup tidak valid JSON');
    process.exit(1);
  }

  const { metadata, data } = backup;
  const collections = Object.keys(data);
  const totalDocs   = collections.reduce((sum, c) => sum + Object.keys(data[c]).length, 0);

  console.log(`File backup  : ${path.basename(filepath)}`);
  console.log(`Tanggal backup: ${new Date(metadata.backup_date).toLocaleString('id-ID')}`);
  console.log(`Project      : ${metadata.project_id}`);
  console.log(`Collections  : ${collections.length}`);
  console.log(`Total dokumen: ${totalDocs}`);

  console.log('\n⚠️  PERINGATAN: Restore akan MENIMPA data yang sudah ada di Firestore!');
  console.log('   Collections yang akan di-restore:');
  for (const col of collections) {
    const count = Object.keys(data[col]).length;
    console.log(`   - ${col.padEnd(20)} ${count} dokumen`);
  }

  const jawaban = await konfirmasi('\nKetik YES untuk melanjutkan (atau tekan Enter untuk batal): ');
  if (jawaban !== 'YES') {
    console.log('\n✅ Restore dibatalkan.');
    process.exit(0);
  }

  console.log('\nMemulai restore...\n');
  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Terhubung ke project: ${projectId}\n`);

  let totalRestored = 0;
  let totalFailed   = 0;

  for (const colName of collections) {
    process.stdout.write(`  Restore ${colName.padEnd(20)}`);
    try {
      const count = await restoreCollection(db, colName, data[colName]);
      console.log(`✅ ${count} dokumen`);
      totalRestored += count;
    } catch (err) {
      console.log(`❌ Gagal: ${err.message}`);
      totalFailed++;
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  ✅ Restore selesai`);
  console.log(`  Total dokumen di-restore: ${totalRestored}`);
  if (totalFailed > 0) console.log(`  ❌ Collections gagal    : ${totalFailed}`);
  console.log('═══════════════════════════════════════════════');

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Restore gagal:', err.message);
  process.exit(1);
});

/**
 * tools/migrate/4_migrate_pembayaran.js
 * STEP 4: Update collection `pembayaran` — ganti hutang_id → tagihan_id.
 *
 * Yang dilakukan:
 *   - Tambah field tagihan_id dari tagihan_mapping.json
 *   - Tambah field invoice_id (untuk Mode B)
 *   - Tambah field baru: mode_tagihan, diterima_via, is_disetor, payment_mode, dll
 *   - Data lama diasumsikan sudah disetor (is_disetor: true)
 *
 * Prasyarat: Jalankan step 3 dulu (tagihan_mapping.json harus ada)
 *
 * Cara menjalankan:
 *   node tools/migrate/4_migrate_pembayaran.js
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

function initFirebase() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    return sa.project_id;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return 'unknown';
  }
  console.error('❌ Set FIREBASE_SERVICE_ACCOUNT atau GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FASE 2 — Step 4: Migrate Pembayaran (Update FK)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Baca mapping tagihan
  const tagihanMappingPath = path.join(__dirname, 'tagihan_mapping.json');
  if (!fs.existsSync(tagihanMappingPath)) {
    console.error('❌ tagihan_mapping.json tidak ditemukan. Jalankan step 3 dulu.');
    process.exit(1);
  }
  const tagihanMapping = JSON.parse(fs.readFileSync(tagihanMappingPath, 'utf8'));
  console.log(`Mapping: ${Object.keys(tagihanMapping).length} tagihan\n`);

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  const bayarSnap = await db.collection('pembayaran').get();
  if (bayarSnap.empty) {
    console.log('ℹ️  Tidak ada data pembayaran.');
    process.exit(0);
  }
  console.log(`Total pembayaran: ${bayarSnap.size}\n`);

  let diupdate = 0, diskip = 0;

  // Proses dalam batch 499
  const docs   = bayarSnap.docs;
  const CHUNK  = 499;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const batch = db.batch();

    for (const bayarDoc of chunk) {
      const b = bayarDoc.data();

      // Cari tagihan_id dari mapping
      const mapped = tagihanMapping[b.hutang_id];
      if (!mapped) {
        console.log(`  ⚠️  Skip pembayaran ${bayarDoc.id.slice(0,8)}... — hutang_id '${b.hutang_id}' tidak ada di mapping`);
        diskip++;
        continue;
      }

      // Ambil agent_id dari tagihan
      let agentId = b.agent_id || null;
      if (!agentId) {
        try {
          const tagihanDoc = await db.collection('tagihan').doc(mapped.tagihan_id).get();
          agentId = tagihanDoc.data()?.agent_id || null;
        } catch { /* biarkan null */ }
      }

      batch.update(bayarDoc.ref, {
        // FK baru
        tagihan_id:          mapped.tagihan_id,
        invoice_id:          mapped.invoice_id || null,

        // Field baru sesuai schema blueprint
        agent_id:            agentId,
        mode_tagihan:        mapped.invoice_id ? 'B' : 'A',
        metode:              b.metode || 'tunai',
        diterima_via:        'owner',   // data lama: diasumsikan diterima owner
        kurir_id:            null,
        is_disetor:          true,      // data lama: diasumsikan sudah disetor
        disetor_at:          b.created_at || null,
        kunjungan_id:        null,

        // Future payment mode (Addendum G) — field siap, belum aktif
        payment_mode:           'COURIER',
        payment_proof_url:      null,
        uploaded_at:            null,
        uploaded_by:            null,
        verification_status:    null,
        verified_by:            null,
        verified_at:            null,
        verification_note:      null,

        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      diupdate++;
    }

    await batch.commit();
    process.stdout.write(`  Progress: ${Math.min(i + CHUNK, docs.length)}/${docs.length}\r`);
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ✅ Step 4 selesai`);
  console.log(`  Diupdate : ${diupdate} pembayaran`);
  if (diskip) console.log(`  ⚠️  Di-skip: ${diskip} pembayaran (hutang_id tidak ada di mapping)`);
  console.log('\n  Lanjut ke Step 5:');
  console.log('  node tools/migrate/5_setup_rbac.js');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

/**
 * tools/migrate/2_migrate_orders.js
 * STEP 2: Update collection `orders`.
 *
 * Yang dilakukan:
 *   - Ganti agen_uid → agent_id (dari agent_mapping.json)
 *   - Update status lama → 9 status baru
 *   - Tambah field audit: is_deleted, edit_count, owner_note, batch_id
 *   - Tambah field tracking parsial: total_received, total_completed, dll
 *
 * Prasyarat: Jalankan step 1 dulu (agent_mapping.json harus ada)
 *
 * Cara menjalankan:
 *   node tools/migrate/2_migrate_orders.js
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

// Mapping status lama → status baru (9 status)
const STATUS_MAP = {
  'pending'  : 'MENUNGGU_DIJEMPUT',
  'dijemput' : 'SUDAH_DIJEMPUT',
  'diproses' : 'SEDANG_DIPROSES',
  'selesai'  : 'SUDAH_DIANTAR',   // selesai lama = sudah diantar
  'MENUNGGU_DIJEMPUT'  : 'MENUNGGU_DIJEMPUT',  // sudah baru, skip
  'SUDAH_DIJEMPUT'     : 'SUDAH_DIJEMPUT',
  'SEDANG_DIPROSES'    : 'SEDANG_DIPROSES',
  'SEBAGIAN_SELESAI'   : 'SEBAGIAN_SELESAI',
  'SELESAI_DIKERJAKAN' : 'SELESAI_DIKERJAKAN',
  'SEDANG_DIANTAR'     : 'SEDANG_DIANTAR',
  'SUDAH_DIANTAR'      : 'SUDAH_DIANTAR',
  'SELESAI'            : 'SELESAI',
  'TERTUNDA'           : 'TERTUNDA',
  'DIBATALKAN'         : 'DIBATALKAN',
};

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FASE 2 — Step 2: Migrate Orders');
  console.log('═══════════════════════════════════════════════════════\n');

  // Baca mapping
  const mappingPath = path.join(__dirname, 'agent_mapping.json');
  if (!fs.existsSync(mappingPath)) {
    console.error('❌ agent_mapping.json tidak ditemukan. Jalankan step 1 dulu.');
    process.exit(1);
  }
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  console.log(`Mapping: ${Object.keys(mapping).length} agen\n`);

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  const ordersSnap = await db.collection('orders').get();
  console.log(`Total orders: ${ordersSnap.size}\n`);

  let diupdate = 0, diskip = 0, gagal = 0;
  const statusSummary = {};

  // Proses dalam batch 499
  const docs = ordersSnap.docs;
  const CHUNK = 499;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const batch = db.batch();

    for (const orderDoc of chunk) {
      const o = orderDoc.data();

      // Cari agent_id dari mapping
      const agentId = mapping[o.agen_uid];
      if (!agentId && !o.agent_id) {
        console.log(`  ⚠️  Skip order ${orderDoc.id} — agen_uid '${o.agen_uid}' tidak ada di mapping`);
        diskip++;
        continue;
      }

      // Status baru
      const statusBaru = STATUS_MAP[o.status] || 'MENUNGGU_DIJEMPUT';
      statusSummary[`${o.status} → ${statusBaru}`] = (statusSummary[`${o.status} → ${statusBaru}`] || 0) + 1;

      const totalPieces = o.total_pieces || 0;

      const updates = {
        // FK baru
        agent_id:   agentId || o.agent_id,
        agent_nama: o.agen_nama || '',

        // Status baru
        status: statusBaru,

        // Soft delete fields
        is_deleted:       false,
        deleted_at:       null,
        deleted_by_uid:   null,
        deleted_by_name:  null,
        deleted_reason:   null,

        // Audit fields
        edit_count:       0,
        agen_edit_count:  0,
        owner_edit_count: 0,
        updated_by_uid:   null,
        updated_by_name:  null,
        updated_at:       admin.firestore.FieldValue.serverTimestamp(),

        // Owner note (Addendum B)
        owner_note:         null,
        owner_note_at:      null,
        owner_note_by:      null,
        owner_note_by_name: null,

        // Batch processing (Addendum C)
        batch_id: null,

        // Tracking parsial (Addendum A)
        total_received:   totalPieces,
        total_completed:  statusBaru === 'SELESAI' || statusBaru === 'SUDAH_DIANTAR' ? totalPieces : 0,
        total_delivered:  statusBaru === 'SELESAI' || statusBaru === 'SUDAH_DIANTAR' ? totalPieces : 0,
        remaining_process:  statusBaru === 'SELESAI' || statusBaru === 'SUDAH_DIANTAR' ? 0 : totalPieces,
        remaining_delivery: 0,
      };

      batch.update(orderDoc.ref, updates);
      diupdate++;
    }

    await batch.commit();
    process.stdout.write(`  Progress: ${Math.min(i + CHUNK, docs.length)}/${docs.length}\r`);
  }

  console.log('\n');
  console.log('  Status yang dikonversi:');
  Object.entries(statusSummary).forEach(([k,v]) => console.log(`    ${k}: ${v} order`));

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  ✅ Step 2 selesai`);
  console.log(`  Diupdate : ${diupdate} orders`);
  if (diskip) console.log(`  ⚠️  Di-skip : ${diskip} orders (agen_uid tidak ada di mapping)`);
  if (gagal)  console.log(`  ❌ Gagal   : ${gagal} orders`);
  console.log('\n  Lanjut ke Step 3:');
  console.log('  node tools/migrate/3_migrate_tagihan.js');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(gagal > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

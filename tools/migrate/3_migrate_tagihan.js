/**
 * tools/migrate/3_migrate_tagihan.js
 * STEP 3: Migrasi collection `hutang` → `tagihan` + `invoices`.
 *
 * Yang dilakukan:
 *   - Buat dokumen tagihan dari setiap hutang
 *   - Tentukan mode: A (ada nama_pelanggan) atau B (tidak ada)
 *   - Untuk mode B: buat juga 1 invoice di collection invoices
 *   - Simpan mapping hutang_id → {tagihan_id, invoice_id}
 *
 * Prasyarat: Jalankan step 1 dulu (agent_mapping.json harus ada)
 *
 * Cara menjalankan:
 *   node tools/migrate/3_migrate_tagihan.js
 *
 * Output: tools/migrate/tagihan_mapping.json
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

function tanggalDariTimestamp(ts) {
  if (!ts) return new Date().toISOString().split('T')[0];
  if (ts.toDate) return ts.toDate().toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FASE 2 — Step 3: Migrate Hutang → Tagihan + Invoices');
  console.log('═══════════════════════════════════════════════════════\n');

  // Baca mapping agents
  const agentMappingPath = path.join(__dirname, 'agent_mapping.json');
  if (!fs.existsSync(agentMappingPath)) {
    console.error('❌ agent_mapping.json tidak ditemukan. Jalankan step 1 dulu.');
    process.exit(1);
  }
  const agentMapping = JSON.parse(fs.readFileSync(agentMappingPath, 'utf8'));

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  const hutangSnap = await db.collection('hutang').get();
  if (hutangSnap.empty) {
    console.log('ℹ️  Tidak ada data hutang. Mungkin sudah pernah dimigrasi atau memang kosong.');
    process.exit(0);
  }
  console.log(`Total hutang: ${hutangSnap.size}\n`);

  const tagihanMapping = {}; // { hutang_id → { tagihan_id, invoice_id } }
  let berhasil = 0, gagal = 0;
  let modeA = 0, modeB = 0;

  for (const hutangDoc of hutangSnap.docs) {
    const h = hutangDoc.data();
    const hutangId = hutangDoc.id;

    // Cari agent_id
    const agentId = agentMapping[h.agen_uid];
    if (!agentId) {
      console.log(`  ⚠️  Skip hutang ${hutangId} — agen_uid '${h.agen_uid}' tidak ada di mapping`);
      gagal++;
      continue;
    }

    // Ambil nama_agen dari collection agents
    let agentNama = h.agen_nama || '';
    if (!agentNama) {
      try {
        const agentDoc = await db.collection('agents').doc(agentId).get();
        agentNama = agentDoc.data()?.nama_agen || '';
      } catch { /* pakai string kosong */ }
    }

    const mode = h.nama_pelanggan ? 'A' : 'B';
    const nilaiHutang    = h.nilai_hutang    || 0;
    const nilaiTerbayar  = h.nilai_terbayar  || 0;
    const nilaiSisa      = nilaiHutang - nilaiTerbayar;
    const statusTagihan  = h.status === 'lunas' ? 'lunas'
                         : nilaiTerbayar > 0    ? 'sebagian'
                                                : 'aktif';

    try {
      // Buat dokumen tagihan
      const tagihanRef = db.collection('tagihan').doc();
      await tagihanRef.set({
        agent_id:        agentId,
        agent_nama:      agentNama,
        mode:            mode,
        nama_pelanggan:  mode === 'A' ? (h.nama_pelanggan || null) : null,
        total_nominal:   nilaiHutang,
        total_terbayar:  nilaiTerbayar,
        total_sisa:      nilaiSisa,
        status:          statusTagihan,
        created_by_uid:  'migration_fase2',
        created_by_name: 'Migrasi Fase 2',
        created_at:      h.created_at || admin.firestore.FieldValue.serverTimestamp(),
        updated_at:      admin.firestore.FieldValue.serverTimestamp()
      });

      let invoiceId = null;

      // Mode B: buat 1 invoice (hutang lama = 1 invoice)
      if (mode === 'B') {
        const invoiceRef = db.collection('invoices').doc();
        const tanggalInvoice = tanggalDariTimestamp(h.created_at);
        const urutan = h.created_at?.toMillis?.() || Date.now();

        await invoiceRef.set({
          tagihan_id:      tagihanRef.id,
          agent_id:        agentId,
          agent_nama:      agentNama,
          order_id:        null,
          invoice_number:  `INV-MIGRATED-${hutangId.slice(-8).toUpperCase()}`,
          nominal:         nilaiHutang,
          terbayar:        nilaiTerbayar,
          sisa:            nilaiSisa,
          status:          h.status === 'lunas' ? 'lunas'
                         : nilaiTerbayar > 0    ? 'sebagian'
                                                : 'belum',
          tanggal_invoice: tanggalInvoice,
          urutan_fifo:     urutan,
          created_at:      h.created_at || admin.firestore.FieldValue.serverTimestamp(),
          updated_at:      admin.firestore.FieldValue.serverTimestamp()
        });
        invoiceId = invoiceRef.id;
        modeB++;
      } else {
        modeA++;
      }

      tagihanMapping[hutangId] = {
        tagihan_id: tagihanRef.id,
        invoice_id: invoiceId
      };

      berhasil++;
      console.log(`  ✅ hutang/${hutangId.slice(0,8)}... → tagihan/${tagihanRef.id.slice(0,8)}... (mode ${mode})`);

    } catch (err) {
      console.log(`  ❌ hutang/${hutangId.slice(0,8)}... — ${err.message}`);
      gagal++;
    }
  }

  // Simpan mapping
  const tagihanMappingPath = path.join(__dirname, 'tagihan_mapping.json');
  fs.writeFileSync(tagihanMappingPath, JSON.stringify(tagihanMapping, null, 2), 'utf8');

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  ✅ Step 3 selesai`);
  console.log(`  Berhasil : ${berhasil} tagihan`);
  console.log(`  Mode A   : ${modeA} (per pelanggan)`);
  console.log(`  Mode B   : ${modeB} (invoice FIFO) + ${modeB} invoices dibuat`);
  if (gagal) console.log(`  ❌ Gagal  : ${gagal}`);
  console.log(`  Mapping  : tools/migrate/tagihan_mapping.json`);
  console.log('\n  Lanjut ke Step 4:');
  console.log('  node tools/migrate/4_migrate_pembayaran.js');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(gagal > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

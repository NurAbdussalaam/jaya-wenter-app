/**
 * tools/migrate/1_migrate_agents.js
 * STEP 1: Buat collection `agents` dari users yang role='agen'.
 *
 * Yang dilakukan:
 *   - Buat dokumen baru di collection `agents` untuk setiap user agen
 *   - Tentukan mode_tagihan (A/B) dari pola hutang existing
 *   - Update users: tambah agent_id, ganti role 'agen' → 'agen_owner'
 *   - Simpan mapping uid→agent_id ke file JSON (dipakai step berikutnya)
 *
 * Cara menjalankan:
 *   node tools/migrate/1_migrate_agents.js
 *
 * Output: tools/migrate/agent_mapping.json
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

// Generate kode agen: AG001, AG002, ...
function generateKodeAgen(index) {
  return `AG${String(index).padStart(3, '0')}`;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FASE 2 — Step 1: Migrate Users Agen → Collection Agents');
  console.log('═══════════════════════════════════════════════════════\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  // Ambil semua user role agen
  const usersSnap = await db.collection('users').where('role', '==', 'agen').get();
  if (usersSnap.empty) {
    console.log('⚠️  Tidak ada user dengan role "agen". Cek collection users.');
    process.exit(0);
  }
  console.log(`Ditemukan ${usersSnap.size} user agen.\n`);

  const mapping = {}; // { uid → agent_id }
  let counter = 1;
  let berhasil = 0;
  let gagal    = 0;

  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    const uid = userDoc.id;

    process.stdout.write(`  Migrasi: ${(u.nama_lengkap || u.username).padEnd(25)}`);

    try {
      // Tentukan mode_tagihan dari hutang existing
      const hutangSnap = await db.collection('hutang')
        .where('agen_uid', '==', uid)
        .limit(10)
        .get();

      const adaNamaPelanggan = hutangSnap.docs.some(d => d.data().nama_pelanggan);
      const mode = adaNamaPelanggan ? 'A' : 'B';

      // Buat dokumen agents
      const agentRef = db.collection('agents').doc();
      await agentRef.set({
        kode_agen:             generateKodeAgen(counter),
        nama_agen:             u.nama_lengkap || u.username,
        nama_pemilik:          u.nama_lengkap || u.username,
        whatsapp:              u.nomor_wa || '',
        alamat:                '',
        kota:                  '',
        mode_tagihan:          mode,
        default_courier_id:    null,
        default_courier_nama:  null,
        temp_courier:          null,
        aktif:                 u.aktif ?? true,
        catatan:               null,
        created_by:            'migration_fase2',
        created_at:            u.created_at || admin.firestore.FieldValue.serverTimestamp(),
        updated_at:            admin.firestore.FieldValue.serverTimestamp()
      });

      // Update user: tambah agent_id, ganti role
      await db.collection('users').doc(uid).update({
        agent_id:   agentRef.id,
        agent_nama: u.nama_lengkap || u.username,
        role:       'agen_owner',        // 'agen' → 'agen_owner'
        wilayah:    null,
        permissions_override: null,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Upsert ke agent_contacts (marketing layer)
      await db.collection('agent_contacts').doc(uid).set({
        agent_id:   agentRef.id,
        user_id:    uid,
        name:       u.nama_lengkap || u.username,
        phone:      u.nomor_wa || '',
        role:       'OWNER',
        active:     u.aktif ?? true,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      mapping[uid] = agentRef.id;
      counter++;
      berhasil++;

      console.log(`✅ agents/${agentRef.id.slice(0,8)}... (mode: ${mode})`);

    } catch (err) {
      console.log(`❌ ${err.message}`);
      gagal++;
    }
  }

  // Simpan mapping ke file
  const mappingPath = path.join(__dirname, 'agent_mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  ✅ Step 1 selesai`);
  console.log(`  Berhasil : ${berhasil} agen`);
  if (gagal) console.log(`  ❌ Gagal : ${gagal} agen`);
  console.log(`  Mapping  : tools/migrate/agent_mapping.json`);
  console.log('\n  Lanjut ke Step 2:');
  console.log('  node tools/migrate/2_migrate_orders.js');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(gagal > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

/**
 * tools/migrate/0_pre_migration_check.js
 * Cek kondisi database sebelum migrasi dimulai.
 * Jalankan INI DULU sebelum script migrasi manapun.
 *
 * Cara menjalankan:
 *   node tools/migrate/0_pre_migration_check.js
 *
 * Output: laporan kondisi database + estimasi data yang akan dimigrasi.
 */

const admin = require('firebase-admin');

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

async function countCollection(db, name) {
  try {
    const snap = await db.collection(name).get();
    return snap.size;
  } catch { return -1; }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  JAYA WENTER — Pre-Migration Check');
  console.log('═══════════════════════════════════════════════════════\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  // Cek collection lama
  console.log('--- COLLECTION LAMA (schema sebelum migrasi) ---');
  const users     = await db.collection('users').get();
  const orders    = await db.collection('orders').get();
  const hutang    = await db.collection('hutang').get();
  const pembayaran= await countCollection(db, 'pembayaran');
  const keuangan  = await countCollection(db, 'keuangan');
  const jadwal    = await countCollection(db, 'jadwal');

  // Analisis users
  const usersData    = users.docs.map(d => ({ id: d.id, ...d.data() }));
  const agenUsers    = usersData.filter(u => u.role === 'agen');
  const ownerUsers   = usersData.filter(u => u.role === 'owner');
  const otherUsers   = usersData.filter(u => u.role !== 'agen' && u.role !== 'owner');

  console.log(`users       : ${users.size} dokumen`);
  console.log(`  - owner   : ${ownerUsers.length}`);
  console.log(`  - agen    : ${agenUsers.length} (akan jadi agen_owner)`);
  console.log(`  - lainnya : ${otherUsers.length}`);

  // Analisis orders
  const ordersData  = orders.docs.map(d => ({ id: d.id, ...d.data() }));
  const statusCount = {};
  ordersData.forEach(o => { statusCount[o.status] = (statusCount[o.status] || 0) + 1; });
  const ordersWithAgenUid   = ordersData.filter(o => o.agen_uid).length;
  const ordersWithoutAgenUid= ordersData.filter(o => !o.agen_uid).length;

  console.log(`\norders      : ${orders.size} dokumen`);
  Object.entries(statusCount).forEach(([s,c]) => console.log(`  - ${s.padEnd(12)}: ${c}`));
  console.log(`  - punya agen_uid    : ${ordersWithAgenUid}`);
  console.log(`  - tanpa agen_uid    : ${ordersWithoutAgenUid} ⚠️`);

  // Analisis hutang
  const hutangData   = hutang.docs.map(d => ({ id: d.id, ...d.data() }));
  const hutangAktif  = hutangData.filter(h => h.status === 'aktif').length;
  const hutangLunas  = hutangData.filter(h => h.status === 'lunas').length;
  const hutangPerPel = hutangData.filter(h => h.nama_pelanggan).length;
  const hutangTotal  = hutangData.filter(h => !h.nama_pelanggan).length;

  console.log(`\nhutang      : ${hutang.size} dokumen`);
  console.log(`  - aktif             : ${hutangAktif}`);
  console.log(`  - lunas             : ${hutangLunas}`);
  console.log(`  - ada nama_pelanggan: ${hutangPerPel} (akan jadi Mode A)`);
  console.log(`  - tanpa nama_pelanggan: ${hutangTotal} (akan jadi Mode B)`);
  console.log(`\npembayaran  : ${pembayaran}`);
  console.log(`keuangan    : ${keuangan}`);
  console.log(`jadwal      : ${jadwal}`);

  // Cek collection baru (sudah ada atau belum)
  console.log('\n--- COLLECTION BARU (target migrasi) ---');
  const newCols = ['agents','roles','permissions','tagihan','invoices',
                   'kunjungan','setoran_kurir','pelanggan','customers',
                   'agent_contacts','audit_log','batch_jobs'];
  for (const col of newCols) {
    const count = await countCollection(db, col);
    const status = count === 0 ? '⬜ belum ada' : count === -1 ? '⬜ belum ada' : `⚠️  sudah ada (${count} dok)`;
    console.log(`  ${col.padEnd(20)}: ${status}`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RENCANA MIGRASI');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Step 1: Buat ${agenUsers.length} agents dari users agen`);
  console.log(`  Step 2: Update ${orders.size} orders (agen_uid→agent_id, status baru)`);
  console.log(`  Step 3: Migrasi ${hutang.size} hutang → tagihan + invoices`);
  console.log(`  Step 4: Update ${pembayaran} pembayaran (hutang_id→tagihan_id)`);
  console.log(`  Step 5: Seed RBAC (roles + permissions)`);
  console.log(`  Step 6: Update Firestore Security Rules`);

  if (ordersWithoutAgenUid > 0) {
    console.log(`\n⚠️  Ada ${ordersWithoutAgenUid} order tanpa agen_uid — akan di-skip saat migrasi.`);
  }
  if (otherUsers.length > 0) {
    console.log(`\n⚠️  Ada ${otherUsers.length} user dengan role selain owner/agen: `);
    otherUsers.forEach(u => console.log(`     - ${u.username} (${u.role})`));
  }

  console.log('\n  ✅ Cek selesai. Lanjut ke backup dulu:');
  console.log('  node tools/backup-firestore.js');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

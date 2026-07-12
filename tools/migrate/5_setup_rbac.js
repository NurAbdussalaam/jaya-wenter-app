/**
 * tools/migrate/5_setup_rbac.js
 * STEP 5: Setup RBAC — seed collection `roles` dan `permissions`.
 *
 * Yang dilakukan:
 *   - Buat 5 role sistem: owner, admin, kurir, agen_owner, agen_staff
 *   - Buat 44 permission key
 *   - Update settings/app: tambah template_wa dan website_url
 *   - Update jadwal: tambah field jam_batas
 *
 * Cara menjalankan:
 *   node tools/migrate/5_setup_rbac.js
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

// ── PERMISSIONS ───────────────────────────────────────────────
const PERMISSIONS = [
  { key:'order.read',                   label:'Lihat Order',              group:'order' },
  { key:'order.create',                 label:'Buat Order',               group:'order' },
  { key:'order.edit',                   label:'Edit Order',               group:'order' },
  { key:'order.edit_own',               label:'Edit Order Sendiri',       group:'order' },
  { key:'order.delete',                 label:'Batalkan Order',           group:'order' },
  { key:'order.delete_own',             label:'Batalkan Order Sendiri',   group:'order' },
  { key:'order.update_status',          label:'Update Status Order',      group:'order' },
  { key:'order.owner_note',             label:'Tambah Catatan Owner',     group:'order' },
  { key:'batch.start',                  label:'Mulai Batch',              group:'batch' },
  { key:'batch.complete',               label:'Selesaikan Batch',         group:'batch' },
  { key:'batch.revert',                 label:'Batalkan Item Batch',      group:'batch' },
  { key:'tagihan.read',                 label:'Lihat Tagihan',            group:'tagihan' },
  { key:'tagihan.create',               label:'Buat Tagihan',             group:'tagihan' },
  { key:'tagihan.edit',                 label:'Edit Tagihan',             group:'tagihan' },
  { key:'tagihan.delete',               label:'Hapus Tagihan',            group:'tagihan' },
  { key:'pembayaran.create',            label:'Catat Pembayaran',         group:'pembayaran' },
  { key:'pembayaran.edit',              label:'Edit Pembayaran',          group:'pembayaran' },
  { key:'pembayaran.delete',            label:'Hapus Pembayaran',         group:'pembayaran' },
  { key:'pembayaran.verify',            label:'Verifikasi Bukti Bayar',   group:'pembayaran' },
  { key:'kunjungan.read',               label:'Lihat Kunjungan',          group:'kunjungan' },
  { key:'kunjungan.create',             label:'Buat Kunjungan',           group:'kunjungan' },
  { key:'kunjungan.update',             label:'Update Kunjungan',         group:'kunjungan' },
  { key:'kunjungan.reschedule',         label:'Reschedule Kunjungan',     group:'kunjungan' },
  { key:'kunjungan.add_custom_target',  label:'Tambah Target Custom',     group:'kunjungan' },
  { key:'setoran.read',                 label:'Lihat Setoran',            group:'setoran' },
  { key:'setoran.create',               label:'Buat Setoran',             group:'setoran' },
  { key:'setoran.terima',               label:'Terima Setoran',           group:'setoran' },
  { key:'keuangan.read',                label:'Lihat Keuangan',           group:'keuangan' },
  { key:'keuangan.create',              label:'Tambah Transaksi',         group:'keuangan' },
  { key:'keuangan.edit',                label:'Edit Transaksi',           group:'keuangan' },
  { key:'keuangan.delete',              label:'Hapus Transaksi',          group:'keuangan' },
  { key:'pelanggan.read',               label:'Lihat Pelanggan',          group:'pelanggan' },
  { key:'pelanggan.create',             label:'Tambah Pelanggan',         group:'pelanggan' },
  { key:'pelanggan.edit',               label:'Edit Pelanggan',           group:'pelanggan' },
  { key:'pelanggan.delete',             label:'Hapus Pelanggan',          group:'pelanggan' },
  { key:'pelanggan.notif',              label:'Kirim Notifikasi WA',      group:'pelanggan' },
  { key:'laporan.read',                 label:'Lihat Laporan',            group:'laporan' },
  { key:'marketing.export',             label:'Export Data Marketing',    group:'marketing' },
  { key:'user.read',                    label:'Lihat User',               group:'user' },
  { key:'user.create',                  label:'Buat User',                group:'user' },
  { key:'user.edit',                    label:'Edit User',                group:'user' },
  { key:'user.delete',                  label:'Hapus User',               group:'user' },
  { key:'user.permission',              label:'Kelola Permission',        group:'user' },
  { key:'setting.read',                 label:'Lihat Pengaturan',         group:'setting' },
  { key:'setting.edit',                 label:'Edit Pengaturan',          group:'setting' },
  { key:'template_wa.edit',             label:'Edit Template WA',         group:'setting' },
];

// ── ROLES ─────────────────────────────────────────────────────
const ROLES = [
  {
    id: 'owner', nama: 'owner', label: 'Owner', is_system: true,
    permissions: ['*']
  },
  {
    id: 'admin', nama: 'admin', label: 'Admin', is_system: true,
    permissions: [
      'order.read','order.create','order.edit','order.delete','order.update_status','order.owner_note',
      'batch.start','batch.complete','batch.revert',
      'tagihan.read','tagihan.create','tagihan.edit',
      'pembayaran.create','pembayaran.verify',
      'kunjungan.read','kunjungan.create','kunjungan.update','kunjungan.reschedule','kunjungan.add_custom_target',
      'setoran.read','setoran.create','setoran.terima',
      'keuangan.read','keuangan.create',
      'pelanggan.read','pelanggan.create','pelanggan.edit','pelanggan.delete','pelanggan.notif',
      'laporan.read','marketing.export',
      'user.read','setting.read'
    ]
  },
  {
    id: 'kurir', nama: 'kurir', label: 'Kurir', is_system: true,
    permissions: [
      'order.read','order.update_status',
      'tagihan.read',
      'pembayaran.create',
      'kunjungan.read','kunjungan.update','kunjungan.reschedule','kunjungan.add_custom_target',
      'setoran.read','setoran.create'
    ]
  },
  {
    id: 'agen_owner', nama: 'agen_owner', label: 'Agen (Pemilik)', is_system: true,
    permissions: [
      'order.read','order.create','order.edit','order.delete',
      'tagihan.read',
      'pelanggan.read','pelanggan.create','pelanggan.edit','pelanggan.notif'
    ]
  },
  {
    id: 'agen_staff', nama: 'agen_staff', label: 'Agen (Karyawan)', is_system: true,
    permissions: [
      'order.read','order.create','order.edit_own',
      'pelanggan.read','pelanggan.create','pelanggan.notif'
    ]
  }
];

// Template WA default (Addendum I)
const TEMPLATE_WA_DEFAULT =
`Halo Pak/Bu {nama}.

Pakaian yang diwenter sudah selesai dikerjakan pada hari {hari} tanggal {tanggal}. Silahkan untuk segera diambil.

Total biaya:
Rp {tarif}

Harap untuk segera diambil.

Pakaian yang tidak diambil lebih dari 30 hari sejak tanggal pemberitahuan di atas bukan menjadi tanggung jawab kami.

Terima kasih.

Jaya Wenter
www.wenter.my.id`;

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FASE 2 — Step 5: Setup RBAC + Update Settings');
  console.log('═══════════════════════════════════════════════════════\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  // 1. Buat permissions
  console.log(`Membuat ${PERMISSIONS.length} permissions...`);
  for (const p of PERMISSIONS) {
    const id = p.key.replace(/\./g, '_');
    await db.collection('permissions').doc(id).set({
      ...p,
      description: '',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`✅ ${PERMISSIONS.length} permissions dibuat\n`);

  // 2. Buat roles
  console.log(`Membuat ${ROLES.length} roles...`);
  for (const r of ROLES) {
    const { id, ...data } = r;
    await db.collection('roles').doc(id).set({
      ...data,
      created_by: 'migration_fase2',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    const permCount = r.permissions[0] === '*' ? 'semua' : r.permissions.length;
    console.log(`  ✅ ${r.nama.padEnd(15)} (${permCount} permission)`);
  }

  // 3. Update settings/app — tambah template_wa dan website_url
  console.log('\nUpdate settings/app...');
  const settingsRef = db.collection('settings').doc('app');
  const settingsDoc = await settingsRef.get();
  if (settingsDoc.exists) {
    await settingsRef.update({
      website_url:  'www.wenter.my.id',
      template_wa:  TEMPLATE_WA_DEFAULT,
      updated_at:   admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✅ settings/app diupdate (tambah website_url + template_wa)');
  } else {
    await settingsRef.set({
      nomor_wa_owner:   '',
      harga_per_pieces: 8000,
      nama_usaha:       'JAYA WENTER',
      website_url:      'www.wenter.my.id',
      template_wa:      TEMPLATE_WA_DEFAULT,
      updated_at:       admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✅ settings/app dibuat baru');
  }

  // 4. Update jadwal — tambah jam_batas jika belum ada
  console.log('\nUpdate jadwal (tambah jam_batas)...');
  const jadwalSnap = await db.collection('jadwal').get();
  if (!jadwalSnap.empty) {
    const batch = db.batch();
    jadwalSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!data.jam_batas) {
        // Default jam_batas = 1 jam sebelum jam kunjungan
        const [h, m] = (data.jam || '09:00').split(':').map(Number);
        const batasH = h > 0 ? h - 1 : 0;
        const jamBatas = `${String(batasH).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        batch.update(doc.ref, { jam_batas: jamBatas });
      }
    });
    await batch.commit();
    console.log(`  ✅ ${jadwalSnap.size} jadwal diupdate dengan jam_batas`);
  } else {
    console.log('  ⬜ Tidak ada jadwal (skip)');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  ✅ Step 5 selesai`);
  console.log(`  - ${PERMISSIONS.length} permissions dibuat`);
  console.log(`  - ${ROLES.length} roles dibuat`);
  console.log(`  - settings/app diupdate`);
  console.log(`  - jadwal diupdate dengan jam_batas`);
  console.log('\n  Lanjut ke Step 6:');
  console.log('  node tools/migrate/6_verify_migration.js');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

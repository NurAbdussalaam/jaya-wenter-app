/**
 * scripts/setup-rbac.js
 * Setup initial RBAC data di Firestore.
 * Jalankan SEKALI setelah deploy backend:
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node scripts/setup-rbac.js
 *
 * JANGAN jalankan ulang — akan overwrite data yang sudah ada.
 */

const admin = require('firebase-admin');

// Load service account dari env atau file lokal
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = admin.credential.applicationDefault();
} else {
  console.error('Set FIREBASE_SERVICE_ACCOUNT atau GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}

admin.initializeApp({ credential });
const db = admin.firestore();

// ── PERMISSIONS ───────────────────────────────────────────────
const PERMISSIONS = [
  { key: 'order.read',          label: 'Lihat Order',            group: 'order' },
  { key: 'order.create',        label: 'Buat Order',             group: 'order' },
  { key: 'order.edit',          label: 'Edit Order',             group: 'order' },
  { key: 'order.edit_own',      label: 'Edit Order Sendiri',     group: 'order' },
  { key: 'order.delete',        label: 'Batalkan Order',         group: 'order' },
  { key: 'order.delete_own',    label: 'Batalkan Order Sendiri', group: 'order' },
  { key: 'order.update_status', label: 'Update Status Order',    group: 'order' },
  { key: 'order.owner_note',    label: 'Tambah Catatan Owner',   group: 'order' },
  { key: 'batch.start',         label: 'Mulai Batch',            group: 'batch' },
  { key: 'batch.complete',      label: 'Selesaikan Batch',       group: 'batch' },
  { key: 'batch.revert',        label: 'Batalkan Batch',         group: 'batch' },
  { key: 'tagihan.read',        label: 'Lihat Tagihan',          group: 'tagihan' },
  { key: 'tagihan.create',      label: 'Buat Tagihan',           group: 'tagihan' },
  { key: 'tagihan.edit',        label: 'Edit Tagihan',           group: 'tagihan' },
  { key: 'tagihan.delete',      label: 'Hapus Tagihan',          group: 'tagihan' },
  { key: 'pembayaran.create',   label: 'Catat Pembayaran',       group: 'pembayaran' },
  { key: 'pembayaran.edit',     label: 'Edit Pembayaran',        group: 'pembayaran' },
  { key: 'pembayaran.delete',   label: 'Hapus Pembayaran',       group: 'pembayaran' },
  { key: 'pembayaran.verify',   label: 'Verifikasi Bukti Bayar', group: 'pembayaran' },
  { key: 'kunjungan.read',                label: 'Lihat Kunjungan',        group: 'kunjungan' },
  { key: 'kunjungan.create',              label: 'Buat Kunjungan',         group: 'kunjungan' },
  { key: 'kunjungan.update',              label: 'Update Kunjungan',       group: 'kunjungan' },
  { key: 'kunjungan.reschedule',          label: 'Reschedule Kunjungan',   group: 'kunjungan' },
  { key: 'kunjungan.add_custom_target',   label: 'Tambah Target Custom',   group: 'kunjungan' },
  { key: 'setoran.read',        label: 'Lihat Setoran',          group: 'setoran' },
  { key: 'setoran.create',      label: 'Buat Setoran',           group: 'setoran' },
  { key: 'setoran.terima',      label: 'Terima Setoran',         group: 'setoran' },
  { key: 'keuangan.read',       label: 'Lihat Keuangan',         group: 'keuangan' },
  { key: 'keuangan.create',     label: 'Tambah Transaksi',       group: 'keuangan' },
  { key: 'keuangan.edit',       label: 'Edit Transaksi',         group: 'keuangan' },
  { key: 'keuangan.delete',     label: 'Hapus Transaksi',        group: 'keuangan' },
  { key: 'pelanggan.read',      label: 'Lihat Pelanggan',        group: 'pelanggan' },
  { key: 'pelanggan.create',    label: 'Tambah Pelanggan',       group: 'pelanggan' },
  { key: 'pelanggan.edit',      label: 'Edit Pelanggan',         group: 'pelanggan' },
  { key: 'pelanggan.delete',    label: 'Hapus Pelanggan',        group: 'pelanggan' },
  { key: 'pelanggan.notif',     label: 'Kirim Notifikasi WA',    group: 'pelanggan' },
  { key: 'laporan.read',        label: 'Lihat Laporan',          group: 'laporan' },
  { key: 'marketing.export',    label: 'Export Data Marketing',  group: 'marketing' },
  { key: 'user.read',           label: 'Lihat User',             group: 'user' },
  { key: 'user.create',         label: 'Buat User',              group: 'user' },
  { key: 'user.edit',           label: 'Edit User',              group: 'user' },
  { key: 'user.delete',         label: 'Hapus User',             group: 'user' },
  { key: 'user.permission',     label: 'Kelola Permission',      group: 'user' },
  { key: 'setting.read',        label: 'Lihat Pengaturan',       group: 'setting' },
  { key: 'setting.edit',        label: 'Edit Pengaturan',        group: 'setting' },
  { key: 'template_wa.edit',    label: 'Edit Template WA',       group: 'setting' },
];

// ── ROLES ─────────────────────────────────────────────────────
const ROLES = [
  {
    id: 'owner',
    nama: 'owner', label: 'Owner', is_system: true,
    permissions: ['*']
  },
  {
    id: 'admin',
    nama: 'admin', label: 'Admin', is_system: true,
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
    id: 'kurir',
    nama: 'kurir', label: 'Kurir', is_system: true,
    permissions: [
      'order.read','order.update_status',
      'tagihan.read',
      'pembayaran.create',
      'kunjungan.read','kunjungan.update','kunjungan.reschedule','kunjungan.add_custom_target',
      'setoran.read','setoran.create'
    ]
  },
  {
    id: 'agen_owner',
    nama: 'agen_owner', label: 'Agen (Pemilik)', is_system: true,
    permissions: [
      'order.read','order.create','order.edit','order.delete',
      'tagihan.read',
      'pelanggan.read','pelanggan.create','pelanggan.edit','pelanggan.notif'
    ]
  },
  {
    id: 'agen_staff',
    nama: 'agen_staff', label: 'Agen (Karyawan)', is_system: true,
    permissions: [
      'order.read','order.create','order.edit_own',
      'pelanggan.read','pelanggan.create','pelanggan.notif'
    ]
  }
];

async function run() {
  console.log('=== SETUP RBAC JAYA WENTER ===\n');

  // Insert permissions
  console.log(`Membuat ${PERMISSIONS.length} permissions...`);
  for (const p of PERMISSIONS) {
    const id = p.key.replace(/\./g, '_');
    await db.collection('permissions').doc(id).set({
      ...p,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`✅ ${PERMISSIONS.length} permissions dibuat\n`);

  // Insert roles
  console.log(`Membuat ${ROLES.length} roles...`);
  for (const r of ROLES) {
    const { id, ...data } = r;
    await db.collection('roles').doc(id).set({
      ...data,
      created_by: 'system',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✅ role: ${r.nama} (${r.permissions.length === 1 && r.permissions[0] === '*' ? 'semua permission' : r.permissions.length + ' permission'})`);
  }

  console.log('\n=== SETUP SELESAI ===');
  console.log('RBAC sudah siap. Jangan jalankan script ini lagi.');
  process.exit(0);
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});

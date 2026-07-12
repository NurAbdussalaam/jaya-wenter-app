/**
 * tools/seed-firestore.js
 * Isi Firestore dengan data dummy realistis untuk development dan testing.
 *
 * ✅ Kompatibel dengan Firebase Spark Plan (gratis)
 *
 * Cara menjalankan:
 *   node tools/seed-firestore.js
 *
 * Data yang dibuat:
 *   - 1 owner
 *   - 3 agen (masing-masing 1 agen_owner + 1 agen_staff)
 *   - 1 kurir
 *   - 5 jadwal kunjungan
 *   - 9 order (berbagai status)
 *   - 3 hutang (collection lama, kompatibel dengan schema existing)
 *   - 5 pembayaran
 *   - 6 keuangan (pemasukan + pengeluaran)
 *   - 3 pelanggan (untuk notifikasi WA)
 *   - Settings aplikasi
 *
 * CATATAN: Script ini menggunakan schema EXISTING (sebelum migrasi Fase 2).
 * Setelah Fase 2 selesai, seed data akan diupdate.
 */

const admin = require('firebase-admin');

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

const now = () => admin.firestore.FieldValue.serverTimestamp();
const ts  = (daysAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return admin.firestore.Timestamp.fromDate(d);
};
const dateStr = (daysAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
};

// ── DATA SEED ─────────────────────────────────────────────────

// Users (password semua: dev123456 — set via Firebase Console atau setup-rbac.js)
const USERS = {
  'owner-dev-001': {
    username: 'owner_jaya',
    nama_lengkap: 'Pak Jaya',
    nomor_wa: '081234567890',
    role: 'owner',
    agent_id: null, agent_nama: null, wilayah: null,
    permissions_override: null, aktif: true,
    created_at: ts(30), updated_at: ts(30)
  },
  'kurir-dev-001': {
    username: 'kurir_budi',
    nama_lengkap: 'Budi Santoso',
    nomor_wa: '082345678901',
    role: 'kurir',
    agent_id: null, agent_nama: null, wilayah: 'Wilayah Utara',
    permissions_override: null, aktif: true,
    created_at: ts(25), updated_at: ts(25)
  },
  // Agen 1 - Laundry Melati
  'agen-dev-001': {
    username: 'melati_owner',
    nama_lengkap: 'Bu Sari',
    nomor_wa: '083456789012',
    role: 'agen',       // schema lama: 'agen' (setelah migrasi jadi agen_owner)
    agent_id: null, agent_nama: 'Laundry Melati', wilayah: null,
    permissions_override: null, aktif: true,
    agen_uid: 'agen-dev-001',
    created_at: ts(20), updated_at: ts(20)
  },
  // Agen 2 - Laundry Maju
  'agen-dev-002': {
    username: 'maju_owner',
    nama_lengkap: 'Pak Ahmad',
    nomor_wa: '084567890123',
    role: 'agen',
    agent_id: null, agent_nama: 'Laundry Maju', wilayah: null,
    permissions_override: null, aktif: true,
    agen_uid: 'agen-dev-002',
    created_at: ts(18), updated_at: ts(18)
  },
  // Agen 3 - Laundry Bersih
  'agen-dev-003': {
    username: 'bersih_owner',
    nama_lengkap: 'Bu Dewi',
    nomor_wa: '085678901234',
    role: 'agen',
    agent_id: null, agent_nama: 'Laundry Bersih', wilayah: null,
    permissions_override: null, aktif: true,
    agen_uid: 'agen-dev-003',
    created_at: ts(15), updated_at: ts(15)
  }
};

// Jadwal kunjungan
const JADWAL = {
  'jadwal-senin': { hari: 'Senin', hari_index: 1, jam: '09:00', aktif: true, created_at: ts(30) },
  'jadwal-selasa': { hari: 'Selasa', hari_index: 2, jam: '09:00', aktif: true, created_at: ts(30) },
  'jadwal-rabu': { hari: 'Rabu', hari_index: 3, jam: '09:00', aktif: true, created_at: ts(30) },
  'jadwal-kamis': { hari: 'Kamis', hari_index: 4, jam: '09:00', aktif: true, created_at: ts(30) },
  'jadwal-jumat': { hari: 'Jumat', hari_index: 5, jam: '09:00', aktif: true, created_at: ts(30) },
};

// Orders (menggunakan schema existing: agen_uid, status lama)
const ORDERS = {
  'order-dev-001': {
    agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    warna: { hitam: 5, biru_tua: 3, hijau_tua: 2, coklat_tua: 1, abu_tua: 0 },
    total_pieces: 11, jumlah_pengguna: 3, catatan: 'Pakaian kerja',
    jadwal_id: 'jadwal-senin', jadwal_label: 'Senin 09.00',
    tanggal_kunjungan: dateStr(7), tanggal_order: dateStr(7), jam_order: '08:30',
    status: 'selesai', created_at: ts(7), updated_at: ts(3)
  },
  'order-dev-002': {
    agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    warna: { hitam: 8, biru_tua: 4, hijau_tua: 0, coklat_tua: 2, abu_tua: 1 },
    total_pieces: 15, jumlah_pengguna: 4, catatan: '',
    jadwal_id: 'jadwal-senin', jadwal_label: 'Senin 09.00',
    tanggal_kunjungan: dateStr(0), tanggal_order: dateStr(0), jam_order: '07:45',
    status: 'pending', created_at: ts(0), updated_at: ts(0)
  },
  'order-dev-003': {
    agen_uid: 'agen-dev-002', agen_nama: 'Laundry Maju',
    warna: { hitam: 10, biru_tua: 5, hijau_tua: 3, coklat_tua: 0, abu_tua: 2 },
    total_pieces: 20, jumlah_pengguna: 5, catatan: 'Urgent',
    jadwal_id: 'jadwal-selasa', jadwal_label: 'Selasa 09.00',
    tanggal_kunjungan: dateStr(6), tanggal_order: dateStr(6), jam_order: '08:00',
    status: 'dijemput', created_at: ts(6), updated_at: ts(5)
  },
  'order-dev-004': {
    agen_uid: 'agen-dev-002', agen_nama: 'Laundry Maju',
    warna: { hitam: 6, biru_tua: 2, hijau_tua: 1, coklat_tua: 1, abu_tua: 0 },
    total_pieces: 10, jumlah_pengguna: 2, catatan: '',
    jadwal_id: 'jadwal-selasa', jadwal_label: 'Selasa 09.00',
    tanggal_kunjungan: dateStr(0), tanggal_order: dateStr(0), jam_order: '08:15',
    status: 'pending', created_at: ts(0), updated_at: ts(0)
  },
  'order-dev-005': {
    agen_uid: 'agen-dev-003', agen_nama: 'Laundry Bersih',
    warna: { hitam: 3, biru_tua: 1, hijau_tua: 1, coklat_tua: 0, abu_tua: 0 },
    total_pieces: 5, jumlah_pengguna: 1, catatan: 'Baju seragam',
    jadwal_id: 'jadwal-rabu', jadwal_label: 'Rabu 09.00',
    tanggal_kunjungan: dateStr(5), tanggal_order: dateStr(5), jam_order: '08:45',
    status: 'selesai', created_at: ts(5), updated_at: ts(2)
  },
  'order-dev-006': {
    agen_uid: 'agen-dev-003', agen_nama: 'Laundry Bersih',
    warna: { hitam: 12, biru_tua: 6, hijau_tua: 4, coklat_tua: 2, abu_tua: 1 },
    total_pieces: 25, jumlah_pengguna: 6, catatan: '',
    jadwal_id: 'jadwal-rabu', jadwal_label: 'Rabu 09.00',
    tanggal_kunjungan: dateStr(0), tanggal_order: dateStr(0), jam_order: '07:30',
    status: 'pending', created_at: ts(0), updated_at: ts(0)
  },
  'order-dev-007': {
    agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    warna: { hitam: 4, biru_tua: 2, hijau_tua: 0, coklat_tua: 1, abu_tua: 0 },
    total_pieces: 7, jumlah_pengguna: 2, catatan: 'Terlambat dijemput',
    jadwal_id: 'jadwal-kamis', jadwal_label: 'Kamis 09.00',
    tanggal_kunjungan: dateStr(14), tanggal_order: dateStr(14), jam_order: '08:00',
    status: 'selesai', created_at: ts(14), updated_at: ts(10)
  },
  'order-dev-008': {
    agen_uid: 'agen-dev-002', agen_nama: 'Laundry Maju',
    warna: { hitam: 9, biru_tua: 3, hijau_tua: 2, coklat_tua: 1, abu_tua: 0 },
    total_pieces: 15, jumlah_pengguna: 3, catatan: '',
    jadwal_id: 'jadwal-jumat', jadwal_label: 'Jumat 09.00',
    tanggal_kunjungan: dateStr(14), tanggal_order: dateStr(14), jam_order: '07:50',
    status: 'selesai', created_at: ts(14), updated_at: ts(11)
  },
  'order-dev-009': {
    agen_uid: 'agen-dev-003', agen_nama: 'Laundry Bersih',
    warna: { hitam: 7, biru_tua: 3, hijau_tua: 1, coklat_tua: 0, abu_tua: 1 },
    total_pieces: 12, jumlah_pengguna: 3, catatan: 'Kain sutra — hati-hati',
    jadwal_id: 'jadwal-senin', jadwal_label: 'Senin 09.00',
    tanggal_kunjungan: dateStr(21), tanggal_order: dateStr(21), jam_order: '08:20',
    status: 'selesai', created_at: ts(21), updated_at: ts(18)
  }
};

// Hutang (collection lama, sesuai schema existing)
const HUTANG = {
  'hutang-dev-001': {
    agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    nama_pelanggan: 'Budi Hartono',
    nilai_hutang: 150000, nilai_terbayar: 50000,
    status: 'aktif', catatan: 'Bayar bertahap',
    created_at: ts(10), updated_at: ts(5)
  },
  'hutang-dev-002': {
    agen_uid: 'agen-dev-002', agen_nama: 'Laundry Maju',
    nama_pelanggan: null,
    nilai_hutang: 300000, nilai_terbayar: 300000,
    status: 'lunas', catatan: '',
    created_at: ts(20), updated_at: ts(7)
  },
  'hutang-dev-003': {
    agen_uid: 'agen-dev-003', agen_nama: 'Laundry Bersih',
    nama_pelanggan: 'Siti Rahayu',
    nilai_hutang: 200000, nilai_terbayar: 0,
    status: 'aktif', catatan: 'Belum bisa bayar bulan ini',
    created_at: ts(5), updated_at: ts(5)
  }
};

// Pembayaran
const PEMBAYARAN = {
  'bayar-dev-001': {
    hutang_id: 'hutang-dev-001', agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    nama_pelanggan: 'Budi Hartono', nominal: 50000, catatan: 'Cicilan pertama',
    diterima_oleh: 'Pak Jaya', tanggal_bayar: dateStr(5), created_at: ts(5)
  },
  'bayar-dev-002': {
    hutang_id: 'hutang-dev-002', agen_uid: 'agen-dev-002', agen_nama: 'Laundry Maju',
    nama_pelanggan: null, nominal: 300000, catatan: 'Lunas',
    diterima_oleh: 'Pak Jaya', tanggal_bayar: dateStr(7), created_at: ts(7)
  },
  'bayar-dev-003': {
    hutang_id: 'hutang-dev-001', agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    nama_pelanggan: 'Budi Hartono', nominal: 50000, catatan: 'Cicilan kedua',
    diterima_oleh: 'Pak Jaya', tanggal_bayar: dateStr(2), created_at: ts(2)
  }
};

// Keuangan
const KEUANGAN = {
  'keu-dev-001': {
    jenis: 'pemasukan', nominal: 300000,
    keterangan: 'Pembayaran hutang Laundry Maju', tanggal: dateStr(7), created_at: ts(7)
  },
  'keu-dev-002': {
    jenis: 'pengeluaran', nominal: 85000,
    keterangan: 'Beli pewarna hitam 1kg', tanggal: dateStr(6), created_at: ts(6)
  },
  'keu-dev-003': {
    jenis: 'pengeluaran', nominal: 50000,
    keterangan: 'BBM motor kurir', tanggal: dateStr(5), created_at: ts(5)
  },
  'keu-dev-004': {
    jenis: 'pemasukan', nominal: 100000,
    keterangan: 'Pembayaran cicilan Laundry Melati (Budi)', tanggal: dateStr(5), created_at: ts(5)
  },
  'keu-dev-005': {
    jenis: 'pengeluaran', nominal: 30000,
    keterangan: 'Gas elpiji 3kg', tanggal: dateStr(3), created_at: ts(3)
  },
  'keu-dev-006': {
    jenis: 'pemasukan', nominal: 100000,
    keterangan: 'Pembayaran cicilan Laundry Melati (Budi) kedua', tanggal: dateStr(2), created_at: ts(2)
  }
};

// Pelanggan (untuk notifikasi WA)
const PELANGGAN = {
  'pelanggan-dev-001': {
    nama_pelanggan: 'Budi Hartono', nomor_wa: '0812345600001',
    tarif_wenter: 150000, agen_uid: 'agen-dev-001', agen_nama: 'Laundry Melati',
    created_at: ts(10)
  },
  'pelanggan-dev-002': {
    nama_pelanggan: 'Siti Rahayu', nomor_wa: '0812345600002',
    tarif_wenter: 200000, agen_uid: 'agen-dev-003', agen_nama: 'Laundry Bersih',
    created_at: ts(5)
  },
  'pelanggan-dev-003': {
    nama_pelanggan: 'Andi Wijaya', nomor_wa: '0812345600003',
    tarif_wenter: 85000, agen_uid: 'agen-dev-002', agen_nama: 'Laundry Maju',
    created_at: ts(8)
  }
};

// Settings
const SETTINGS = {
  'app': {
    nomor_wa_owner: '081234567890',
    harga_per_pieces: 8000,
    nama_usaha: 'JAYA WENTER',
    website_url: 'www.wenter.my.id',
    template_wa: 'Halo Pak/Bu {nama}.\n\nPakaian yang diwenter sudah selesai dikerjakan pada hari {hari} tanggal {tanggal}. Silahkan untuk segera diambil.\n\nTotal biaya:\nRp {tarif}\n\nHarap untuk segera diambil.\n\nPakaian yang tidak diambil lebih dari 30 hari sejak tanggal pemberitahuan di atas bukan menjadi tanggung jawab kami.\n\nTerima kasih.\n\nJaya Wenter\nwww.wenter.my.id',
    updated_at: ts(1)
  }
};

// ── Helper: set koleksi ───────────────────────────────────────
async function seedCollection(db, colName, data) {
  const ids = Object.keys(data);
  if (ids.length === 0) return;

  const batch = db.batch();
  for (const id of ids) {
    batch.set(db.collection(colName).doc(id), data[id]);
  }
  await batch.commit();
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  JAYA WENTER — Seed Firestore (Development)');
  console.log('═══════════════════════════════════════════════\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  const seeds = [
    { name: 'users',     data: USERS,     label: Object.keys(USERS).length + ' user' },
    { name: 'jadwal',    data: JADWAL,    label: Object.keys(JADWAL).length + ' jadwal' },
    { name: 'orders',    data: ORDERS,    label: Object.keys(ORDERS).length + ' order' },
    { name: 'hutang',    data: HUTANG,    label: Object.keys(HUTANG).length + ' hutang' },
    { name: 'pembayaran',data: PEMBAYARAN,label: Object.keys(PEMBAYARAN).length + ' pembayaran' },
    { name: 'keuangan',  data: KEUANGAN,  label: Object.keys(KEUANGAN).length + ' transaksi' },
    { name: 'pelanggan', data: PELANGGAN, label: Object.keys(PELANGGAN).length + ' pelanggan' },
    { name: 'settings',  data: SETTINGS,  label: 'konfigurasi aplikasi' },
  ];

  let totalDocs = 0;
  for (const { name, data, label } of seeds) {
    process.stdout.write(`  Seed ${name.padEnd(15)} → ${label.padEnd(25)}`);
    try {
      await seedCollection(db, name, data);
      console.log('✅');
      totalDocs += Object.keys(data).length;
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  ✅ Seed selesai — ${totalDocs} dokumen dibuat`);
  console.log('\n  Akun yang tersedia (set password via Firebase Console):');
  console.log('  owner_jaya   → role: owner');
  console.log('  kurir_budi   → role: kurir, wilayah: Wilayah Utara');
  console.log('  melati_owner → role: agen (Laundry Melati)');
  console.log('  maju_owner   → role: agen (Laundry Maju)');
  console.log('  bersih_owner → role: agen (Laundry Bersih)');
  console.log('═══════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Seed gagal:', err.message);
  process.exit(1);
});

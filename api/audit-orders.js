/**
 * audit-orders.js
 * ─────────────────────────────────────────────────────────────
 * AUDIT READ-ONLY — collection `orders` di Firestore produksi
 * Jaya Wenter App
 *
 * ✅ HANYA membaca data (getDocs / get)
 * ✅ TIDAK ada set(), update(), delete(), add(), batch write
 * ✅ TIDAK memerlukan Firebase CLI
 * ✅ Tidak menyalin atau menyimpan kunci.json ke tempat lain
 * ✅ Aman dihapus setelah selesai digunakan
 *
 * Cara menjalankan (Windows CMD):
 *   node audit-orders.js
 *   (pastikan kunci.json ada di folder yang sama dengan script ini)
 *
 * Cara menjalankan jika kunci.json di folder lain:
 *   node audit-orders.js --key=C:\path\ke\kunci.json
 * ─────────────────────────────────────────────────────────────
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── 1. TENTUKAN LOKASI kunci.json ─────────────────────────────
function resolveKeyPath() {
  // Cek argumen --key=...
  const keyArg = process.argv.find(a => a.startsWith('--key='));
  if (keyArg) return keyArg.split('=').slice(1).join('=');

  // Default: kunci.json di folder yang sama dengan script ini
  return 'E:\\back up F\\jaya-wenter-app\\kunci.json';
}

// ── 2. INISIALISASI FIREBASE ADMIN ───────────────────────────
function initFirebase() {
  const keyPath = resolveKeyPath();

  if (!fs.existsSync(keyPath)) {
    console.error('');
    console.error('❌ File kunci.json tidak ditemukan di:');
    console.error('   ' + keyPath);
    console.error('');
    console.error('Solusi:');
    console.error('  1. Letakkan kunci.json di folder yang sama dengan audit-orders.js, ATAU');
    console.error('  2. Jalankan dengan argumen: node audit-orders.js --key=C:\\path\\ke\\kunci.json');
    console.error('');
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (err) {
    console.error('❌ kunci.json tidak valid JSON:', err.message);
    process.exit(1);
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('❌ Gagal inisialisasi Firebase Admin:', err.message);
    process.exit(1);
  }

  return serviceAccount.project_id || '(project_id tidak ditemukan)';
}

// ── 3. HELPER: SAMARKAN DATA SENSITIF ────────────────────────
function mask(value, type = 'default') {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (type === 'phone') {
    // "081234567890" → "08****7890"
    if (s.length <= 4) return '****';
    return s.slice(0, 2) + '****' + s.slice(-4);
  }
  if (type === 'name') {
    // "Budi Santoso" → "B***"
    return s.charAt(0) + '***';
  }
  if (type === 'id') {
    // Firebase UID / doc ID — tampilkan 4 char pertama
    return s.slice(0, 4) + '...';
  }
  return s; // default: tampilkan apa adanya (non-sensitif)
}

// Field yang dianggap sensitif dan cara menyamarkannya
const SENSITIVE_FIELDS = {
  nomor_wa:        'phone',
  no_wa:           'phone',
  phone:           'phone',
  telepon:         'phone',
  nama_pelanggan:  'name',
  nama_agen:       'name',
  agen_nama:       'name',
  kurir_nama:      'name',
  operator_nama:   'name',
  agen_uid:        'id',
  kurir_id:        'id',
  operator_id:     'id',
  batch_id:        'id',
  jadwal_id:       'id',
};

// ── 4. HELPER: DETEKSI TIPE DATA ─────────────────────────────
function detectType(value) {
  if (value === null || value === undefined) return 'null';
  if (value && typeof value.toDate === 'function') return 'Timestamp';
  if (value instanceof Date) return 'Date';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === 'object') return 'object';
  return typeof value;
}

// ── 5. AUDIT UTAMA ────────────────────────────────────────────
async function auditOrders() {
  const projectId = initFirebase();
  const db = admin.firestore();

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AUDIT READ-ONLY — collection `orders`');
  console.log('  Jaya Wenter App');
  console.log(`  Project: ${projectId}`);
  console.log(`  Waktu  : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('⏳ Mengambil data dari Firestore...');

  // READ-ONLY: hanya getDocs
  const snapshot = await db.collection('orders').get();

  if (snapshot.empty) {
    console.log('');
    console.log('⚠️  Collection `orders` kosong atau tidak ditemukan.');
    process.exit(0);
  }

  const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const total = docs.length;

  // ── 5a. STATUS DISTRIBUTION ─────────────────────────────────
  const statusCount = {};
  docs.forEach(doc => {
    const s = doc.status ?? '(tidak ada field status)';
    statusCount[s] = (statusCount[s] || 0) + 1;
  });

  // ── 5b. FIELD ANALYSIS ──────────────────────────────────────
  const fieldFrequency = {}; // field → jumlah dokumen yang punya field ini
  const fieldTypes     = {}; // field → Set tipe data yang ditemukan

  docs.forEach(doc => {
    Object.entries(doc).forEach(([key, value]) => {
      if (key === 'id') return; // skip internal id
      fieldFrequency[key] = (fieldFrequency[key] || 0) + 1;
      if (!fieldTypes[key]) fieldTypes[key] = new Set();
      fieldTypes[key].add(detectType(value));
    });
  });

  // ── 5c. FIELDS YANG DIAUDIT KHUSUS ──────────────────────────
  const specialFields = [
    'kurir_id', 'kurir_nama',
    'operator_id', 'operator_nama',
    'batch_id', 'status_history',
    'owner_note', 'is_deleted',
    // field pembayaran
    'payment_proof_url', 'is_paid', 'paid_at', 'payment_status',
    'kurir_confirmed', 'agen_confirmed', 'verification_status',
    // field pelanggan/agen
    'agen_uid', 'agen_nama', 'agent_id',
    'nama_pelanggan', 'pelanggan_id',
  ];

  // ── 5d. TANGGAL PALING LAMA & TERBARU ────────────────────────
  let earliest = null;
  let latest   = null;

  docs.forEach(doc => {
    // Coba field: tanggal_order, created_at
    let dateStr = null;
    if (doc.tanggal_order && typeof doc.tanggal_order === 'string') {
      dateStr = doc.tanggal_order;
    } else if (doc.created_at && typeof doc.created_at.toDate === 'function') {
      dateStr = doc.created_at.toDate().toISOString().slice(0, 10);
    }
    if (!dateStr) return;

    if (!earliest || dateStr < earliest) earliest = dateStr;
    if (!latest   || dateStr > latest)   latest   = dateStr;
  });

  // ── 5e. CONTOH DOKUMEN (DISAMARKAN) ──────────────────────────
  // Ambil satu dokumen per status sebagai contoh
  const examplePerStatus = {};
  docs.forEach(doc => {
    const s = doc.status ?? '(tidak ada field status)';
    if (!examplePerStatus[s]) examplePerStatus[s] = doc;
  });

  // ── 6. OUTPUT ─────────────────────────────────────────────────

  console.log('');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  TOTAL DOKUMEN: ${total}`);
  console.log('───────────────────────────────────────────────────────');

  console.log('');
  console.log('📊 DISTRIBUSI STATUS');
  console.log('───────────────────────────────────────────────────────');
  const sortedStatuses = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
  sortedStatuses.forEach(([status, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / total * 20));
    console.log(`  ${status.padEnd(30)} ${String(count).padStart(4)} (${pct}%)  ${bar}`);
  });

  console.log('');
  console.log('📋 SEMUA NILAI STATUS YANG DITEMUKAN');
  console.log('───────────────────────────────────────────────────────');
  sortedStatuses.forEach(([status]) => {
    console.log(`  "${status}"`);
  });

  console.log('');
  console.log('🔍 ANALISIS FIELD');
  console.log('───────────────────────────────────────────────────────');
  console.log('  FORMAT: field | muncul di X/total dokumen | tipe data');
  console.log('');

  const sortedFields = Object.entries(fieldFrequency)
    .sort((a, b) => b[1] - a[1]);

  const universal = sortedFields.filter(([, c]) => c === total);
  const partial   = sortedFields.filter(([, c]) => c < total);

  console.log(`  ✅ FIELD UNIVERSAL (ada di semua ${total} dokumen):`);
  if (universal.length === 0) {
    console.log('     (tidak ada field yang ada di semua dokumen)');
  } else {
    universal.forEach(([field, count]) => {
      const types = [...fieldTypes[field]].join(' | ');
      console.log(`     ${field.padEnd(25)} ${String(count).padStart(4)}/${total}  [${types}]`);
    });
  }

  console.log('');
  console.log('  ⚠️  FIELD PARSIAL (hanya ada di sebagian dokumen):');
  if (partial.length === 0) {
    console.log('     (tidak ada)');
  } else {
    partial.forEach(([field, count]) => {
      const types = [...fieldTypes[field]].join(' | ');
      console.log(`     ${field.padEnd(25)} ${String(count).padStart(4)}/${total}  [${types}]`);
    });
  }

  console.log('');
  console.log('🎯 AUDIT FIELD KHUSUS');
  console.log('───────────────────────────────────────────────────────');
  specialFields.forEach(field => {
    const count = fieldFrequency[field] || 0;
    const types = fieldTypes[field] ? [...fieldTypes[field]].join(' | ') : '-';
    const status = count === 0
      ? '❌ TIDAK ADA'
      : count === total
        ? `✅ ADA (semua ${total} dokumen)`
        : `⚠️  PARSIAL (${count}/${total} dokumen)`;
    console.log(`  ${field.padEnd(28)} ${status}  [${types}]`);
  });

  console.log('');
  console.log('📅 RENTANG TANGGAL ORDER');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Order paling lama : ${earliest || '(tidak dapat ditentukan)'}`);
  console.log(`  Order paling baru : ${latest   || '(tidak dapat ditentukan)'}`);

  console.log('');
  console.log('📄 CONTOH STRUKTUR DOKUMEN (per status, data disamarkan)');
  console.log('───────────────────────────────────────────────────────');

  Object.entries(examplePerStatus).forEach(([status, doc]) => {
    console.log('');
    console.log(`  Status: "${status}"`);
    console.log('  ┌─────────────────────────────────────────────────');
    Object.entries(doc).forEach(([field, value]) => {
      if (field === 'id') return;
      const type    = detectType(value);
      const maskType = SENSITIVE_FIELDS[field];

      let display;
      if (maskType) {
        display = mask(value, maskType);
      } else if (type === 'Timestamp') {
        display = value.toDate().toISOString().slice(0, 10);
      } else if (type === 'object' || type.startsWith('array')) {
        display = JSON.stringify(value).slice(0, 60) + (JSON.stringify(value).length > 60 ? '...' : '');
      } else if (typeof value === 'string' && value.length > 40) {
        display = value.slice(0, 40) + '...';
      } else {
        display = String(value);
      }

      console.log(`  │  ${field.padEnd(22)} [${type.padEnd(10)}]  ${display}`);
    });
    console.log('  └─────────────────────────────────────────────────');
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ AUDIT SELESAI — tidak ada data yang diubah');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Langkah selanjutnya:');
  console.log('  1. Kirim output ini ke Claude untuk dianalisis.');
  console.log('  2. Setelah selesai, Anda dapat menghapus audit-orders.js.');
  console.log('  3. Jangan kirim isi kunci.json ke siapapun.');
  console.log('');
}

// ── JALANKAN ──────────────────────────────────────────────────
auditOrders().catch(err => {
  console.error('');
  console.error('❌ Error tidak terduga:', err.message);
  console.error('');
  process.exit(1);
});
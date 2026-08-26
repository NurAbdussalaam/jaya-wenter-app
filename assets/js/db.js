/* ============================================================
   JAYA WENTER APP — db.js
   Fungsi CRUD Firestore untuk semua entitas
   ============================================================ */

import { db } from './firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  increment, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { totalWarna, getTanggalHariIni, getJamSekarang } from './utils.js';
import { tentukanJadwalTerdekat } from './jadwal.js';

/* ════════════════════════════════════════
   ORDER
   ════════════════════════════════════════ */

export async function buatOrder({ agen_uid, agen_nama, jumlah_pengguna, warna, catatan, wilayah }) {
  const total_pieces = totalWarna(warna);
  const tanggal_order = getTanggalHariIni();
  const jam_order = getJamSekarang();

  const jadwalInfo = await tentukanJadwalTerdekat(tanggal_order, jam_order, wilayah);

  const orderData = {
    agen_uid, agen_nama,
    jumlah_pengguna: Number(jumlah_pengguna),
    total_pieces,
    warna,
    catatan: catatan || '',
    jadwal_id: jadwalInfo ? jadwalInfo.jadwal_id : null,
    jadwal_label: jadwalInfo ? jadwalInfo.jadwal_label : 'Belum ada jadwal disetting',
    tanggal_kunjungan: jadwalInfo ? jadwalInfo.tanggal_kunjungan : null,
    tanggal_order, jam_order,
    status: 'pending',
    created_at: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'orders'), orderData);
  return { success: true, id: docRef.id, data: orderData };
}

export async function getOrdersByAgen(agenUid, batasJumlah = 50) {
  const q = query(
    collection(db, 'orders'),
    where('agen_uid', '==', agenUid),
    orderBy('created_at', 'desc'),
    limit(batasJumlah)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(normalizeOrderSnapshot);
}

function normalizeOrderSnapshot(snapshotDoc) {
  const data = snapshotDoc.data();
  return {
    id: snapshotDoc.id,
    ...data,
    status: normalizeOrderStatus(data.status),
    created_by_uid: data.created_by_uid || data.agen_uid || ''
  };
}

function normalizeOrderStatus(status) {
  const normalizedStatus = String(status || 'PENDING').toUpperCase();
  const legacyStatusMap = {
    SUDAH_DIJEMPUT: 'DIJEMPUT',
    SEDANG_DIPROSES: 'DIPROSES',
    SUDAH_DIANTAR: 'SELESAI'
  };
  return legacyStatusMap[normalizedStatus] || normalizedStatus;
}

export function listenOrdersHariIni(callback) {
  const tanggal = getTanggalHariIni();
  const q = query(
    collection(db, 'orders'),
    where('tanggal_order', '==', tanggal),
    orderBy('created_at', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(normalizeOrderSnapshot));
  });
}

export function listenSemuaOrders(callback, batasJumlah = 100) {
  const q = query(
    collection(db, 'orders'),
    orderBy('created_at', 'desc'),
    limit(batasJumlah)
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(normalizeOrderSnapshot));
  });
}

export async function updateStatusOrder(orderId, status) {
  await updateDoc(doc(db, 'orders', orderId), { status: normalizeOrderStatus(status) });
  return { success: true };
}

/* ── FUNGSI BUAT ORDER V2 (ADDITIVE FIELDS DITAMBAHKAN) ── */
export async function buatOrderV2(orderData, userContext) {
  // Gunakan nilai default agar tidak ada field yang undefined
  const agen_uid = orderData?.agen_uid || userContext?.uid || '';
  const agen_nama = orderData?.agen_nama || userContext?.nama || '';
  const status = orderData?.status || 'MENUNGGU_PENJEMPUTAN';
  const { jumlah_pengguna, warna, catatan } = orderData;

  const total_pieces = totalWarna(warna);
  const tanggal_order = getTanggalHariIni();
  const jam_order = getJamSekarang();

  const jadwalInfo = await tentukanJadwalTerdekat(tanggal_order, jam_order, userContext?.wilayah);

  const orderDataV2 = {
    // Field lama (backward compatibility)
    agen_uid,
    agen_nama,
    jumlah_pengguna: Number(jumlah_pengguna),
    total_pieces,
    warna,
    catatan: catatan || '',
    jadwal_id: jadwalInfo ? jadwalInfo.jadwal_id : null,
    jadwal_label: jadwalInfo ? jadwalInfo.jadwal_label : 'Belum ada jadwal disetting',
    tanggal_kunjungan: jadwalInfo ? jadwalInfo.tanggal_kunjungan : null,
    tanggal_order,
    jam_order,
    status: normalizeOrderStatus(status),

    // Field baru (additive)
    created_by_uid: userContext.uid,
    created_by_nama: userContext.nama || userContext.email || '',
    created_by_role: userContext.role || 'agen',
    kurir_id: null,
    kurir_nama: null,
    operator_id: null,
    operator_nama: null,
    batch_id: null,
    owner_note: "",
    is_deleted: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'orders'), orderDataV2);
  return { success: true, id: docRef.id, data: orderDataV2 };
}

/* ── FUNGSI UPDATE STATUS DENGAN LOG (STATUS HISTORY) ── */
export async function updateStatusOrderWithLog(orderId, newStatus, userContext, note = "") {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      throw new Error('Order tidak ditemukan');
    }

    const currentData = orderSnap.data();
    const currentStatus = normalizeOrderStatus(currentData.status);

    // Validasi status baru
    const validStatuses = [
      'PENDING', 'MENUNGGU_PENJEMPUTAN',
      'DIJEMPUT', 'DIPROSES', 'SELESAI'
    ];

    const targetStatus = normalizeOrderStatus(newStatus);
    if (!validStatuses.includes(targetStatus)) {
      throw new Error(`Status tidak valid: ${newStatus}`);
    }

    const batch = writeBatch(db);

    // Update order document
    batch.update(orderRef, {
      status: targetStatus,
      updated_at: serverTimestamp(),
      updated_by_uid: userContext.uid,
      updated_by_nama: userContext.nama || userContext.email || '',
      updated_by_role: userContext.role || 'unknown'
    });

    // Add to status history subcollection
    const statusHistoryRef = doc(collection(orderRef, 'status_history'));
    batch.set(statusHistoryRef, {
      status_before: currentStatus,
      status_after: targetStatus,
      changed_by_uid: userContext.uid,
      changed_by_nama: userContext.nama || userContext.email || '',
      changed_by_role: userContext.role || 'unknown',
      changed_at: serverTimestamp(),
      note: note || ''
    });

    await batch.commit();

    return {
      success: true,
      orderId,
      previousStatus: currentStatus,
      newStatus: targetStatus
    };

  } catch (error) {
    console.error('Error updating order status with log:', error);
    throw error;
  }
}

export async function getOrdersByPeriode(tanggalMulai, tanggalAkhir) {
  const q = query(
    collection(db, 'orders'),
    where('tanggal_order', '>=', tanggalMulai),
    where('tanggal_order', '<=', tanggalAkhir),
    orderBy('tanggal_order', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(normalizeOrderSnapshot);
}

/* ════════════════════════════════════════
   AGEN (USERS dengan role agen)
   ════════════════════════════════════════ */

export async function getDaftarAgen() {
  const q = query(collection(db, 'users'), where('role', 'in', ['agen_owner', 'agen_staff']));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function listenDaftarAgen(callback) {
  const q = query(collection(db, 'users'), where('role', 'in', ['agen_owner', 'agen_staff']));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ════════════════════════════════════════
   HUTANG
   ════════════════════════════════════════ */

export async function tambahHutang({ agen_uid, agen_nama, nama_pelanggan, jumlah_pieces, nilai_hutang, catatan }) {
  const data = {
    agen_uid, agen_nama, nama_pelanggan,
    jumlah_pieces: Number(jumlah_pieces),
    nilai_hutang: Number(nilai_hutang),
    nilai_terbayar: 0,
    status: 'belum_lunas',
    catatan: catatan || '',
    created_at: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, 'hutang'), data);
  return { success: true, id: docRef.id };
}

export async function getHutangByAgen(agenUid) {
  const q = query(collection(db, 'hutang'), where('agen_uid', '==', agenUid), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function listenSemuaHutang(callback) {
  const q = query(collection(db, 'hutang'), orderBy('created_at', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function editHutang(hutangId, data) {
  await updateDoc(doc(db, 'hutang', hutangId), data);
  return { success: true };
}

export async function hapusHutang(hutangId) {
  await deleteDoc(doc(db, 'hutang', hutangId));
  return { success: true };
}

/* ── HITUNG STATUS BERDASARKAN PEMBAYARAN ── */
function hitungStatus(nilai_hutang, nilai_terbayar) {
  if (nilai_terbayar >= nilai_hutang) return 'lunas';
  if (nilai_terbayar > 0) return 'sebagian';
  return 'belum_lunas';
}

/* ════════════════════════════════════════
   PEMBAYARAN
   ════════════════════════════════════════ */

export async function tambahPembayaran({ hutang_id, agen_uid, agen_nama, nama_pelanggan, nominal, tanggal_bayar, catatan }) {
  const hutangRef = doc(db, 'hutang', hutang_id);
  const hutangSnap = await getDoc(hutangRef);

  if (!hutangSnap.exists()) {
    return { success: false, message: 'Data hutang tidak ditemukan' };
  }

  const hutangData = hutangSnap.data();
  const terbayarBaru = (hutangData.nilai_terbayar || 0) + Number(nominal);
  const statusBaru = hitungStatus(hutangData.nilai_hutang, terbayarBaru);

  const batch = writeBatch(db);

  const bayarRef = doc(collection(db, 'pembayaran'));
  batch.set(bayarRef, {
    hutang_id, agen_uid, agen_nama, nama_pelanggan,
    nominal: Number(nominal),
    tanggal_bayar: tanggal_bayar || getTanggalHariIni(),
    catatan: catatan || '',
    created_at: serverTimestamp()
  });

  batch.update(hutangRef, {
    nilai_terbayar: terbayarBaru,
    status: statusBaru
  });

  await batch.commit();
  return { success: true, statusBaru };
}

export async function getPembayaranByHutang(hutangId) {
  const q = query(collection(db, 'pembayaran'), where('hutang_id', '==', hutangId), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function editPembayaran(bayarId, nominalBaru) {
  const bayarRef = doc(db, 'pembayaran', bayarId);
  const bayarSnap = await getDoc(bayarRef);
  if (!bayarSnap.exists()) return { success: false, message: 'Data tidak ditemukan' };

  const bayarData = bayarSnap.data();
  const selisih = Number(nominalBaru) - bayarData.nominal;

  const hutangRef = doc(db, 'hutang', bayarData.hutang_id);
  const hutangSnap = await getDoc(hutangRef);
  if (!hutangSnap.exists()) return { success: false, message: 'Hutang tidak ditemukan' };

  const hutangData = hutangSnap.data();
  const terbayarBaru = (hutangData.nilai_terbayar || 0) + selisih;
  const statusBaru = hitungStatus(hutangData.nilai_hutang, terbayarBaru);

  const batch = writeBatch(db);
  batch.update(bayarRef, { nominal: Number(nominalBaru) });
  batch.update(hutangRef, { nilai_terbayar: terbayarBaru, status: statusBaru });
  await batch.commit();

  return { success: true };
}

export async function hapusPembayaran(bayarId) {
  const bayarRef = doc(db, 'pembayaran', bayarId);
  const bayarSnap = await getDoc(bayarRef);
  if (!bayarSnap.exists()) return { success: false, message: 'Data tidak ditemukan' };

  const bayarData = bayarSnap.data();
  const hutangRef = doc(db, 'hutang', bayarData.hutang_id);
  const hutangSnap = await getDoc(hutangRef);
  if (!hutangSnap.exists()) return { success: false, message: 'Hutang tidak ditemukan' };

  const hutangData = hutangSnap.data();
  const terbayarBaru = (hutangData.nilai_terbayar || 0) - bayarData.nominal;
  const statusBaru = hitungStatus(hutangData.nilai_hutang, terbayarBaru);

  const batch = writeBatch(db);
  batch.delete(bayarRef);
  batch.update(hutangRef, { nilai_terbayar: terbayarBaru, status: statusBaru });
  await batch.commit();

  return { success: true };
}

/* ════════════════════════════════════════
   KEUANGAN
   ════════════════════════════════════════ */

export async function tambahKeuangan({ jenis, keterangan, nominal, tanggal }) {
  const data = {
    jenis, keterangan,
    nominal: Number(nominal),
    tanggal: tanggal || getTanggalHariIni(),
    created_at: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, 'keuangan'), data);
  return { success: true, id: docRef.id };
}

export async function getKeuanganByPeriode(tanggalMulai, tanggalAkhir) {
  const q = query(
    collection(db, 'keuangan'),
    where('tanggal', '>=', tanggalMulai),
    where('tanggal', '<=', tanggalAkhir),
    orderBy('tanggal', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function editKeuangan(transId, data) {
  await updateDoc(doc(db, 'keuangan', transId), data);
  return { success: true };
}

export async function hapusKeuangan(transId) {
  await deleteDoc(doc(db, 'keuangan', transId));
  return { success: true };
}

/* ════════════════════════════════════════
   SETTINGS
   ════════════════════════════════════════ */

export async function getSettings() {
  const docRef = doc(db, 'settings', 'app');
  const snap = await getDoc(docRef);
  if (snap.exists()) return snap.data();

  const defaultSettings = {
    nomor_wa_owner: '',
    harga_per_pieces: 0,
    nama_usaha: 'Jaya Wenter App'
  };
  await setDoc(docRef, { ...defaultSettings, created_at: serverTimestamp() });
  return defaultSettings;
}

export async function updateSettings(data) {
  const docRef = doc(db, 'settings', 'app');
  await updateDoc(docRef, { ...data, updated_at: serverTimestamp() }).catch(async () => {
    await setDoc(docRef, { ...data, updated_at: serverTimestamp() });
  });
  return { success: true };
}

/* ════════════════════════════════════════
   REKAP & STATISTIK
   ════════════════════════════════════════ */

export async function getRekapPerAgen(tanggalMulai, tanggalAkhir) {
  const orders = await getOrdersByPeriode(tanggalMulai, tanggalAkhir);
  const rekap = {};

  orders.forEach(o => {
    if (!rekap[o.agen_uid]) {
      rekap[o.agen_uid] = { agen_nama: o.agen_nama, total_pieces: 0, jumlah_order: 0 };
    }
    rekap[o.agen_uid].total_pieces += o.total_pieces || 0;
    rekap[o.agen_uid].jumlah_order += 1;
  });

  return Object.entries(rekap).map(([uid, data]) => ({ agen_uid: uid, ...data }))
    .sort((a, b) => b.total_pieces - a.total_pieces);
}

export async function getTotalHutangSemuaAgen() {
  const q = collection(db, 'hutang');
  const snapshot = await getDocs(q);
  let total = 0;
  let totalLunas = 0;
  let totalBelumLunas = 0;

  snapshot.docs.forEach(d => {
    const data = d.data();
    const sisa = (data.nilai_hutang || 0) - (data.nilai_terbayar || 0);
    total += data.nilai_hutang || 0;
    if (data.status === 'lunas') totalLunas += data.nilai_hutang || 0;
    else totalBelumLunas += sisa;
  });

  return { total, totalLunas, totalBelumLunas };
}




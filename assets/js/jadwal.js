/* ============================================================
   JAYA WENTER APP ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â jadwal.js
   Logika penentuan jadwal kunjungan terdekat secara otomatis
   ============================================================ */

import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getHariIndex, getNamaHari } from './utils.js';

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AMBIL SEMUA JADWAL AKTIF ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
export async function getJadwalAktif() {
  const q = query(
    collection(db, 'jadwal'),
    where('aktif', '==', true),
    orderBy('hari_index'),
    orderBy('jam')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ TENTUKAN JADWAL TERDEKAT BERDASARKAN WAKTU ORDER ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
   Logika:
   1. Ambil semua jadwal aktif, urutkan berdasarkan hari & jam
   2. Cari jadwal pertama yang >= waktu order saat ini
   3. Jika tidak ada di minggu ini, ambil jadwal pertama minggu depan
*/
export async function tentukanJadwalTerdekat(tanggalOrder, jamOrder) {
  const jadwalList = await getJadwalAktif();
  if (jadwalList.length === 0) {
    return null; // Tidak ada jadwal disetting
  }

  const hariOrderIndex = getHariIndex(tanggalOrder); // 0-6
  const menitOrder = jamKeMenit(jamOrder);

  // Buat representasi "jarak hari" dari hari order untuk tiap jadwal
  // dan urutkan berdasarkan jarak terdekat
  let kandidat = jadwalList.map(j => {
    let jarakHari = (j.hari_index - hariOrderIndex + 7) % 7;
    const menitJadwal = jamKeMenit(j.jam);

    // Jika hari sama tapi jam jadwal sudah lewat ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ dorong ke minggu depan
    if (jarakHari === 0 && menitJadwal <= menitOrder) {
      jarakHari = 7;
    }

    return { ...j, jarakHari, menitJadwal };
  });

  // Urutkan: jarak hari terkecil, lalu jam tersedia terkecil
  kandidat.sort((a, b) => {
    if (a.jarakHari !== b.jarakHari) return a.jarakHari - b.jarakHari;
    return a.menitJadwal - b.menitJadwal;
  });

  const terpilih = kandidat[0];

  // Hitung tanggal aktual jadwal kunjungan tersebut
  const tanggalKunjungan = tambahHari(tanggalOrder, terpilih.jarakHari);

  return {
    jadwal_id: terpilih.id,
    jadwal_label: `${terpilih.hari} ${formatJamLabel(terpilih.jam)}`,
    tanggal_kunjungan: tanggalKunjungan,
    hari: terpilih.hari,
    jam: terpilih.jam
  };
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ HELPER: jam "HH:MM" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ menit dari 00:00 ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
function jamKeMenit(jam) {
  const [h, m] = jam.split(':').map(Number);
  return h * 60 + m;
}

function formatJamLabel(jam) {
  return jam.replace(':', '.') + ' WIB';
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ HELPER: tambah N hari ke tanggal "YYYY-MM-DD" ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
function tambahHari(tanggalStr, n) {
  const date = new Date(tanggalStr + 'T00:00:00');
  date.setDate(date.getDate() + n);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ OWNER: TAMBAH JADWAL BARU ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
export async function tambahJadwal(hari, jam) {
  const hariList = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const hari_index = hariList.indexOf(hari);

  if (hari_index === -1) {
    return { success: false, message: 'Hari tidak valid' };
  }

  try {
    await addDoc(collection(db, 'jadwal'), {
      hari, hari_index, jam,
      aktif: true,
      created_at: new Date()
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ OWNER: HAPUS JADWAL ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
export async function hapusJadwal(jadwalId) {
  try {
    await deleteDoc(doc(db, 'jadwal', jadwalId));
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ OWNER: AKTIF/NONAKTIFKAN JADWAL ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
export async function toggleJadwal(jadwalId, aktif) {
  try {
    await updateDoc(doc(db, 'jadwal', jadwalId), { aktif });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ OWNER: REKAP KUNJUNGAN PER JADWAL ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
   Mengembalikan daftar agen yang harus dikunjungi pada jadwal tertentu,
   untuk tanggal kunjungan tertentu.
*/
export async function getRekapKunjungan(jadwalId, tanggalKunjungan) {
  const q = query(
    collection(db, 'orders'),
    where('jadwal_id', '==', jadwalId),
    where('tanggal_kunjungan', '==', tanggalKunjungan)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ OWNER: REKAP SEMUA KUNJUNGAN MENDATANG, DIKELOMPOKKAN PER JADWAL ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
export async function getRekapKunjunganMendatang() {
  const jadwalList = await getJadwalAktif();
  const hasil = [];

  for (const j of jadwalList) {
    // Cari tanggal kunjungan terdekat untuk jadwal ini
    const today = new Date();
    const tyyyy = today.getFullYear();
    const tmm = String(today.getMonth() + 1).padStart(2, '0');
    const tdd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${tyyyy}-${tmm}-${tdd}`;
    const jarakHari = (j.hari_index - getHariIndex(todayStr) + 7) % 7;
    const tanggalKunjungan = tambahHari(todayStr, jarakHari === 0 ? 0 : jarakHari);

    const orders = await getRekapKunjungan(j.id, tanggalKunjungan);

    hasil.push({
      jadwal_id: j.id,
      label: `${j.hari} ${formatJamLabel(j.jam)}`,
      tanggal_kunjungan: tanggalKunjungan,
      jumlah_agen: new Set(orders.map(o => o.agen_uid)).size,
      total_pieces: orders.reduce((sum, o) => sum + (o.total_pieces || 0), 0),
      orders
    });
  }

  return hasil;
}

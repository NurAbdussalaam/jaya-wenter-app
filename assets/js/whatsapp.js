/* ============================================================
   JAYA WENTER APP — whatsapp.js
   Generator pesan WhatsApp otomatis (wa.me URL Scheme)
   ============================================================ */

import { DAFTAR_WARNA, formatTanggal, formatJam } from './utils.js';

/* ── BANGUN TEKS PESAN ORDER WENTER ── */
export function buatPesanOrder({
  nama_agen, jumlah_pengguna, total_pieces, warna,
  catatan, tanggal_order, jam_order
}) {
  const baris = [];
  baris.push('ORDER WENTER');
  baris.push('');
  baris.push('Agen:');
  baris.push(nama_agen);
  baris.push('');
  baris.push('Jumlah Pengguna Jasa:');
  baris.push(String(jumlah_pengguna));
  baris.push('');
  baris.push('Jumlah Pieces:');
  baris.push(String(total_pieces));
  baris.push('');
  baris.push('Warna:');
  baris.push('');

  DAFTAR_WARNA.forEach(w => {
    const jumlah = warna[w.key] || 0;
    baris.push(`${w.label}: ${jumlah}`);
  });

  baris.push('');
  baris.push('Catatan:');
  baris.push(catatan && catatan.trim() ? catatan.trim() : '-');
  baris.push('');
  baris.push('Tanggal:');
  baris.push(formatTanggal(tanggal_order));
  baris.push('');
  baris.push('Jam:');
  baris.push(formatJam(jam_order));

  return baris.join('\n');
}

/* ── BANGUN URL WA.ME DAN BUKA WHATSAPP ── */
export function bukaWhatsAppOrder(nomorWaOwner, dataOrder) {
  const pesan = buatPesanOrder(dataOrder);
  const nomorBersih = bersihkanNomor(nomorWaOwner);
  const url = `https://wa.me/${nomorBersih}?text=${encodeURIComponent(pesan)}`;
  window.open(url, '_blank');
  return url;
}

/* ── BERSIHKAN FORMAT NOMOR WA ──
   Menerima berbagai format: 08xx, +628xx, 628xx
   Mengeluarkan format standar: 628xx
*/
function bersihkanNomor(nomor) {
  let n = nomor.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) {
    n = '62' + n.substring(1);
  }
  if (!n.startsWith('62')) {
    n = '62' + n;
  }
  return n;
}

export { bersihkanNomor };

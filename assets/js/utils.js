/* ============================================================
   JAYA WENTER APP — utils.js
   Fungsi helper umum
   ============================================================ */

/* ── FORMAT TANGGAL ── */
export function formatTanggal(dateStr) {
  // dateStr: "YYYY-MM-DD" → "Selasa, 17 Juni 2025"
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric'
  });
}

export function formatTanggalPendek(dateStr) {
  // "YYYY-MM-DD" → "17 Jun 2025"
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function getTanggalHariIni() {
  // Kembalikan string "YYYY-MM-DD"
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function getJamSekarang() {
  // Kembalikan "HH:MM"
  const now = new Date();
  return now.toTimeString().substring(0, 5);
}

export function getHariIndex(dateStr) {
  // 0=Minggu,1=Senin,...,6=Sabtu
  return new Date(dateStr + 'T00:00:00').getDay();
}

export function getNamaHari(index) {
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  return hari[index];
}

export function formatJam(jam) {
  // "07:00" → "07.00 WIB"
  return jam.replace(':', '.') + ' WIB';
}

export function formatTimestamp(timestamp) {
  // Firebase Timestamp → "17 Jun 2025 — 07.30"
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const tgl = date.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  const jam = date.toTimeString().substring(0, 5).replace(':', '.');
  return `${tgl} — ${jam}`;
}

/* ── FORMAT RUPIAH ── */
export function formatRupiah(angka) {
  if (!angka && angka !== 0) return 'Rp0';
  return 'Rp' + Number(angka).toLocaleString('id-ID');
}

export function parseRupiah(str) {
  // "Rp1.000.000" → 1000000
  return parseInt(str.replace(/[^0-9]/g, '')) || 0;
}

/* ── TOAST NOTIFIKASI ── */
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

export function showToast(pesan, tipe = 'info', durasi = 3000) {
  const container = getToastContainer();
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipe}`;
  toast.innerHTML = `<span>${icons[tipe] || ''}</span> <span>${pesan}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, durasi);
}

/* ── KONFIRMASI DIALOG ── */
export function showConfirm({ icon = '⚠️', title, message, labelOk = 'Ya, Lanjutkan',
  labelBatal = 'Batal', tipOk = 'danger' } = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('confirm-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'confirm-dialog';
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-icon">${icon}</div>
        <div class="confirm-title">${title}</div>
        <div class="confirm-message">${message}</div>
        <div class="confirm-actions">
          <button class="btn btn-ghost btn-sm" id="confirm-batal">${labelBatal}</button>
          <button class="btn btn-${tipOk} btn-sm" id="confirm-ok">${labelOk}</button>
        </div>
      </div>`;

    document.body.appendChild(dialog);
    requestAnimationFrame(() => dialog.classList.add('active'));

    const close = (result) => {
      dialog.classList.remove('active');
      setTimeout(() => dialog.remove(), 200);
      resolve(result);
    };

    dialog.querySelector('#confirm-ok').addEventListener('click', () => close(true));
    dialog.querySelector('#confirm-batal').addEventListener('click', () => close(false));
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(false); });
  });
}

/* ── LOADING STATE ── */
export function setButtonLoading(btn, loading, teksDefault) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> Memproses...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = teksDefault || btn.dataset.originalText || '';
  }
}

/* ── VALIDASI ── */
export function validateRequired(value, label) {
  if (!value || value.toString().trim() === '') {
    return `${label} wajib diisi`;
  }
  return null;
}

export function validateNumber(value, label, min = 0) {
  const n = Number(value);
  if (isNaN(n) || n < min) {
    return `${label} harus angka minimal ${min}`;
  }
  return null;
}

/* ── SESSION / ROLE CHECK ── */
export function redirectIfNotAuth(auth, targetLogin = '/index.html') {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      if (!user) {
        window.location.href = targetLogin;
      } else {
        resolve(user);
      }
    });
  });
}

/* ── GENERATE ID UNIK ── */
export function generateId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/* ── DEBOUNCE ── */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ── PERIODE FILTER ── */
export function getPeriodeRange(periode) {
  const now = new Date();
  let start, end;

  if (periode === 'hari') {
    start = getTanggalHariIni();
    end   = start;
  } else if (periode === 'minggu') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    start = monday.toISOString().split('T')[0];
    end   = getTanggalHariIni();
  } else if (periode === 'bulan') {
    start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    end   = getTanggalHariIni();
  } else if (periode === 'tahun') {
    start = `${now.getFullYear()}-01-01`;
    end   = getTanggalHariIni();
  }

  return { start, end };
}

/* ── WARNA WENTER ── */
export const DAFTAR_WARNA = [
  { key: 'hitam',      label: 'Hitam',      hex: '#1A1A1A' },
  { key: 'biru_tua',   label: 'Biru Tua',   hex: '#0D2B6B' },
  { key: 'hijau_tua',  label: 'Hijau Tua',  hex: '#1B4D1B' },
  { key: 'coklat_tua', label: 'Coklat Tua', hex: '#5D3A1A' },
  { key: 'abu_tua',    label: 'Abu-Abu Tua', hex: '#424242' },
];

export function formatWarna(warna) {
  // warna: { hitam:4, biru_tua:2, ... }
  return DAFTAR_WARNA
    .filter(w => warna[w.key] > 0)
    .map(w => `${w.label}: ${warna[w.key]}`)
    .join('\n');
}

export function totalWarna(warna) {
  return DAFTAR_WARNA.reduce((sum, w) => sum + (Number(warna[w.key]) || 0), 0);
}

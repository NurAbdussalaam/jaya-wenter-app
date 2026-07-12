/* ============================================================
   JAYA WENTER APP — auth.js
   Login, Logout, Session, Role Management
   ============================================================

   CATATAN PENTING:
   Firebase Authentication standar pakai EMAIL, bukan username.
   Karena agen login dengan USERNAME (sesuai requirement Anda),
   kita siasati dengan pola:

     username "agen_sari" → email virtual "agen_sari@jayawenter.local"

   Username TIDAK akan terlihat oleh agen sebagai email asli.
   Mereka tetap hanya mengetik username & password di form login.
   ============================================================ */

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DOMAIN_VIRTUAL = '@jayawenter.local';

/* ── HELPER: username → email virtual ── */
function usernameToEmail(username) {
  return username.toLowerCase().trim() + DOMAIN_VIRTUAL;
}

/* ── LOGIN ── */
export async function login(username, password) {
  const email = usernameToEmail(username);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid));

    if (!userDoc.exists()) {
      await signOut(auth);
      throw new Error('Akun tidak ditemukan di database');
    }

    const userData = userDoc.data();
    if (!userData.aktif) {
      await signOut(auth);
      throw new Error('Akun Anda tidak aktif. Hubungi owner.');
    }

    // Ambil permissions dari collection roles (untuk RBAC client-side)
    const permissions = await _loadPermissions(userData.role, userData.permissions_override);

    // Simpan ke sessionStorage — tidak ada data sensitif, hanya UI cache
    sessionStorage.setItem('jw_user', JSON.stringify({
      uid:          cred.user.uid,
      username:     userData.username,
      nama_lengkap: userData.nama_lengkap,
      role:         userData.role,
      nomor_wa:     userData.nomor_wa  || '',
      agent_id:     userData.agent_id  || null,
      agent_nama:   userData.agent_nama || null,
      wilayah:      userData.wilayah   || null,
      permissions:  permissions
    }));

    return { success: true, role: userData.role, data: userData };
  } catch (err) {
    let pesan = 'Username atau password salah';
    if (err.code === 'auth/too-many-requests') {
      pesan = 'Terlalu banyak percobaan. Coba lagi nanti.';
    } else if (err.message && !err.code) {
      pesan = err.message;
    }
    return { success: false, message: pesan };
  }
}

/* ── LOGOUT ── */
export async function logout(redirectTo = '/index.html') {
  await signOut(auth);
  sessionStorage.removeItem('jw_user');
  window.location.href = redirectTo;
}

/* ── GET CURRENT USER (cache cepat dari sessionStorage) ── */
export function getCachedUser() {
  const raw = sessionStorage.getItem('jw_user');
  return raw ? JSON.parse(raw) : null;
}

/* ── WAJIB LOGIN — pasang di setiap halaman terlindungi ── */
export function requireAuth(allowedRole = null) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = '/index.html';
        return;
      }
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        window.location.href = '/index.html';
        return;
      }
      const userData = userDoc.data();

      // Redirect ke dashboard sesuai role jika akses halaman yang salah
      if (allowedRole) {
        const allowed = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
        if (!allowed.includes(userData.role)) {
          window.location.href = _getDashboardByRole(userData.role);
          return;
        }
      }

      // Update session cache dengan data terbaru (agent_id, permissions, dll)
      const permissions = await _loadPermissions(userData.role, userData.permissions_override);
      const cache = {
        uid:          user.uid,
        username:     userData.username,
        nama_lengkap: userData.nama_lengkap,
        role:         userData.role,
        nomor_wa:     userData.nomor_wa  || '',
        agent_id:     userData.agent_id  || null,
        agent_nama:   userData.agent_nama || null,
        wilayah:      userData.wilayah   || null,
        permissions:  permissions
      };
      sessionStorage.setItem('jw_user', JSON.stringify(cache));

      resolve({ uid: user.uid, ...userData, permissions });
    });
  });
}

/* ── GANTI PASSWORD (oleh agen sendiri) ── */
export async function gantiPasswordSendiri(passwordLama, passwordBaru) {
  const user = auth.currentUser;
  if (!user) return { success: false, message: 'Sesi habis, silakan login ulang' };

  try {
    const cred = EmailAuthProvider.credential(user.email, passwordLama);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, passwordBaru);
    return { success: true };
  } catch (err) {
    let pesan = 'Gagal mengganti password';
    if (err.code === 'auth/wrong-password') pesan = 'Password lama salah';
    if (err.code === 'auth/weak-password') pesan = 'Password baru terlalu pendek (min 6 karakter)';
    return { success: false, message: pesan };
  }
}

/* ── KONFIGURASI API BACKEND ─────────────────────────────────────────
   Fase 1: Ganti nilai di bawah dengan URL Render setelah deploy.
   Contoh: 'https://jaya-wenter-api.onrender.com/api'
   JANGAN hardcode credential di sini — gunakan Render environment variables.
   ──────────────────────────────────────────────────────────────────── */
const API_BASE_URL = 'https://RENDER_API_URL_BELUM_DISET/api';

/* ── FASE 3: RBAC HELPERS ────────────────────────────────────────────
   _loadPermissions(): ambil permissions dari collection roles di Firestore.
   Jika user punya permissions_override, gabungkan dengan permissions role.
   Hasilnya disimpan di sessionStorage untuk cek RBAC tanpa fetch ulang.
   ──────────────────────────────────────────────────────────────────── */
async function _loadPermissions(role, permissionsOverride = null) {
  try {
    const roleDoc = await getDoc(doc(db, 'roles', role));
    if (!roleDoc.exists()) return permissionsOverride || [];

    const rolePerms = roleDoc.data().permissions || [];
    // '*' berarti semua permission (owner)
    if (rolePerms.includes('*')) return ['*'];

    // Gabungkan dengan override jika ada
    if (permissionsOverride && permissionsOverride.length > 0) {
      return [...new Set([...rolePerms, ...permissionsOverride])];
    }
    return rolePerms;
  } catch {
    // Jika roles collection belum ada (sebelum migrasi Fase 2), fallback ke role string
    return permissionsOverride || [];
  }
}

/* ── FASE 3: ROLE DASHBOARD MAPPING ─────────────────────────────────
   Redirect ke dashboard yang benar berdasarkan role.
   ──────────────────────────────────────────────────────────────────── */
function _getDashboardByRole(role) {
  const map = {
    'owner':      '/owner/index.html',
    'admin':      '/admin/index.html',
    'kurir':      '/kurir/index.html',
    'agen_owner': '/agen/index.html',
    'agen_staff': '/agen/index.html',
    // Backward compat: role lama sebelum migrasi
    'agen':       '/agen/index.html',
  };
  return map[role] || '/index.html';
}

/* ── v1.0.1 PATCH 1: HELPER FETCH DENGAN TIMEOUT ────────────────────
   Semua request ke Render API melewati helper ini.
   - Timeout 10 detik via AbortController.
   - clearTimeout() selalu dipanggil (tidak ada memory leak).
   - Jika timeout: pesan "Koneksi lambat" yang mudah dipahami user.
   - Tidak ada duplikasi logika timeout di setiap fungsi.
   ──────────────────────────────────────────────────────────────────── */
async function apiFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi lambat atau terputus. Periksa jaringan dan coba lagi.' };
    }
    return { success: false, message: err.message };
  }
}

/* ── HELPER: ambil ID token user yang sedang login ── */
async function getIdToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken();
}

/* ── OWNER: TAMBAH AGEN BARU ──
   Memanggil Backend API (Render) endpoint POST /api/users/create.
   v1.0.1: Hapus field email redundant — backend generate sendiri dari username.
*/
export async function buatAgenBaru({ username, password, nama_lengkap, nomor_wa }) {
  const idToken = await getIdToken();
  if (!idToken) return { success: false, message: 'Tidak terautentikasi' };
  return apiFetch(`${API_BASE_URL}/users/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ username, password, nama_lengkap, nomor_wa, role: 'agen_owner' })
  });
}

/* ── OWNER: RESET PASSWORD AGEN ── */
export async function resetPasswordAgen(uid, passwordBaru) {
  const idToken = await getIdToken();
  if (!idToken) return { success: false, message: 'Tidak terautentikasi' };
  return apiFetch(`${API_BASE_URL}/users/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ uid, passwordBaru })
  });
}

/* ── OWNER: HAPUS USER ──
   Backend API menghapus dari Firebase Auth + Firestore sekaligus.
*/
export async function hapusAgen(uid) {
  const idToken = await getIdToken();
  if (!idToken) return { success: false, message: 'Tidak terautentikasi' };
  return apiFetch(`${API_BASE_URL}/users/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ uid })
  });
}

/* ── OWNER: TOGGLE AKTIF USER ── */
export async function toggleAktifUser(uid, aktif) {
  const idToken = await getIdToken();
  if (!idToken) return { success: false, message: 'Tidak terautentikasi' };
  return apiFetch(`${API_BASE_URL}/users/toggle-aktif`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ uid, aktif })
  });
}

/* ── OWNER: LIST USER (opsional filter by role) ── */
export async function getDaftarUser(role = null) {
  const idToken = await getIdToken();
  if (!idToken) return { success: false, message: 'Tidak terautentikasi' };
  const url = role
    ? `${API_BASE_URL}/users/list?role=${encodeURIComponent(role)}`
    : `${API_BASE_URL}/users/list`;
  return apiFetch(url, { headers: { 'Authorization': `Bearer ${idToken}` } });
}

/* ── OWNER: EDIT DATA USER (nama, nomor WA) via Firestore langsung ── */
export async function editAgen(uid, { nama_lengkap, nomor_wa, aktif }) {
  try {
    const updates = {};
    if (nama_lengkap !== undefined) updates.nama_lengkap = nama_lengkap;
    if (nomor_wa     !== undefined) updates.nomor_wa     = nomor_wa;
    if (aktif        !== undefined) updates.aktif        = aktif;
    updates.updated_at = serverTimestamp();
    await updateDoc(doc(db, 'users', uid), updates);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/* ── CEK USERNAME SUDAH DIPAKAI? ── */
export async function cekUsernameTersedia(username) {
  const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase().trim()));
  const snapshot = await getDocs(q);
  return snapshot.empty; // true = tersedia
}

/* ── FASE 3: hasPermission() ─────────────────────────────────────────
   Cek apakah user yang sedang login punya permission tertentu.
   Gunakan ini di setiap halaman untuk sembunyikan/tampilkan elemen UI.

   Contoh:
     const user = getCachedUser();
     if (hasPermission(user, 'tagihan.create')) { ... }
     if (hasPermission(user, 'order.edit')) { ... }
   ──────────────────────────────────────────────────────────────────── */
export function hasPermission(user, permKey) {
  if (!user || !user.permissions) return false;
  // Owner punya semua permission
  if (user.permissions.includes('*')) return true;
  return user.permissions.includes(permKey);
}

/* ── FASE 3: getLoginRedirect() ──────────────────────────────────────
   Untuk halaman index.html: setelah login, redirect ke dashboard role.
   ──────────────────────────────────────────────────────────────────── */
export function getLoginRedirect(role) {
  return _getDashboardByRole(role);
}

export { usernameToEmail };

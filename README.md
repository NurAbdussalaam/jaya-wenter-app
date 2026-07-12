# JAYA WENTER — Management System

> Sistem manajemen operasional usaha jasa wenter pakaian.
> Dirancang untuk skala multi-agen dengan dukungan kurir, batch produksi, dan integrasi marketing di masa depan.

---

## Project Overview

**Jaya Wenter** adalah aplikasi manajemen operasional untuk usaha jasa pewarnaan ulang pakaian (wenter). Sistem mengelola seluruh alur bisnis: order dari agen, proses produksi, pengantaran kurir, penagihan, hingga keuangan.

### Pengguna sistem

| Role | Fungsi utama |
|------|-------------|
| **Owner** | Kelola seluruh sistem, laporan, keuangan, pengguna |
| **Admin** | Bantu operasional owner sesuai permission |
| **Kurir** | Rute kunjungan harian, terima pembayaran, setor |
| **Agen (Pemilik)** | Input order, lihat tagihan, notifikasi pelanggan |
| **Agen (Karyawan)** | Input order |

### Stack teknologi

| Layer | Teknologi |
|-------|----------|
| Frontend | HTML + CSS + Vanilla JS |
| Hosting Frontend | Vercel |
| Backend API | Node.js + Express.js |
| Hosting Backend | Render |
| Database | Firestore (Firebase) |
| Authentication | Firebase Authentication |
| PWA | Service Worker (sw.js) |

---

## System Architecture

```
[Owner / Admin / Kurir / Agen]
           │
           ▼
   Frontend (Vercel)
   HTML + CSS + JS
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
Firebase Auth  Backend API (Render)
Login/Session  Express.js + Firebase Admin SDK
     │           │
     └─────┬─────┘
           ▼
      Firestore
   (Database utama)
```

---

## Business Scope

| Konsep | Keterangan |
|--------|-----------|
| Multi Owner | Satu sistem untuk banyak owner |
| Multi Admin | Permission fleksibel per admin |
| Multi Kurir | Kurir per wilayah + temporary assignment |
| Multi Agen | Satu agen bisa punya banyak user login |
| Batch Order | Mulai/selesaikan batch produksi sekaligus |
| Partial Delivery | Pengantaran bertahap per order |
| Outstanding Order | Tracking sisa pieces yang belum selesai |
| Outstanding Payment | Tagihan Mode A/B/C + FIFO otomatis |
| Visit Route | Rute kurir drag & drop + target custom |
| Daily Route | Jadwal kunjungan harian per kurir |
| Promotion Data Collection | Kumpulkan data pelanggan untuk marketing |
| Future Ready Payment | Siap untuk rekening operasional & bukti transfer |

---

## Folder Structure

```
jaya-wenter-app/
│
├── index.html              ← Login + routing role
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service Worker (PWA)
├── vercel.json             ← Deploy Vercel
├── firebase.json           ← Firebase Hosting (referensi)
├── .gitignore
├── .env.example            ← Template env vars
│
├── owner/                  ← Dashboard Owner
│   ├── index.html
│   ├── order.html
│   ├── agen.html
│   ├── hutang.html         ← akan jadi tagihan.html di Fase 7
│   ├── jadwal.html
│   ├── keuangan.html
│   ├── rekap.html
│   └── pengaturan.html
│
├── agen/                   ← Dashboard Agen
│   ├── index.html
│   └── order.html
│
├── assets/
│   ├── css/main.css
│   ├── js/
│   │   ├── firebase-config.js
│   │   ├── auth.js
│   │   ├── db.js
│   │   ├── jadwal.js
│   │   ├── utils.js
│   │   └── whatsapp.js
│   └── icons/
│
├── api/                    ← Backend API (Express.js, deploy ke Render) ✅
│   ├── index.js
│   ├── middleware/
│   ├── routes/
│   └── scripts/
├── functions/              ← DEPRECATED (referensi logika lama)
│   ├── index.js            ← DEPRECATED — referensi logika lama
│   └── package.json
│
└── docs/                   ← Dokumentasi teknis
    ├── SYSTEM_ARCHITECTURE.md
    ├── CHANGELOG.md
    ├── DECISION_LOG.md
    └── DEVELOPMENT_GUIDE.md
```

---

## Development Workflow

```
Developer (VS Code, Windows 10)
           │
           ▼
          Git
           │
           ▼
         GitHub
      ┌────┴────┐
      ▼         ▼
   Vercel     Render
  (Frontend) (Backend API)
      │         │
      └────┬────┘
           ▼
        Firestore
```

---

## Deployment Flow

### Frontend → Vercel
1. Push ke GitHub
2. Vercel auto-deploy dari branch `main`
3. Tidak perlu build command
4. `vercel.json` mengatur SPA routing & cache headers

### Backend API → Render
1. Connect repo ke Render (root: `functions/`)
2. Build: `npm install` | Start: `node index.js`
3. Set environment variables:
   - `FIREBASE_SERVICE_ACCOUNT` = JSON Service Account (satu baris)
   - `ALLOWED_ORIGIN` = URL Vercel
   - `PORT` = 3000
4. Update `API_BASE_URL` di `assets/js/auth.js`

> **JANGAN** commit `kunci.json` atau `.env`. Firebase `apiKey` di `firebase-config.js` adalah public key by design — aman di repo.

---

## Setup Lokal

```bash
# Clone
git clone https://github.com/USERNAME/jaya-wenter-app.git

# Frontend: buka via Live Server VS Code atau langsung di browser
# Tidak perlu npm install untuk frontend

# Backend (Fase 1):
cd functions
npm install
cp ../.env.example .env   # isi nilai .env
node index.js
```

---

## PROJECT STATUS

| Fase | Nama | Status |
|------|------|--------|
| 0 | Security & Foundation | ✅ SELESAI |
| 1 | Backend API Render | ✅ SELESAI |
| 2 | Migrasi Database | 🔲 BELUM |
| 3 | Deploy Frontend + Auth RBAC | ✅ SELESAI |
| 4 | Multi-Role Dashboard | 🔲 BELUM |
| 5 | Order System (9 status, audit, batch) | 🔲 BELUM |
| 6 | Dashboard Kurir + Setoran | 🔲 BELUM |
| 7 | Tagihan 3 Mode + FIFO | 🔲 BELUM |
| 8 | Keuangan + Laporan Produksi | 🔲 BELUM |
| 9 | Notifikasi Pelanggan | 🔲 BELUM |
| 10 | Dashboard Owner Final | 🔲 BELUM |
| 11 | Logo & Branding | ⏳ PENDING LOGO |

---

## Design Philosophy

- **Simplicity First** — Operasional harian tidak boleh rumit
- **Maintainability First** — Mudah dipelihara tim kecil
- **Scalability Ready** — Berkembang tanpa refactor besar
- **Backward Compatible** — Fitur baru tidak merusak yang sudah ada
- **Low Resource Usage** — Efisien di hardware terbatas (i3, 4GB RAM)
- **Future Ready** — Marketing, payment proof, mobile sudah dipersiapkan

---

## Dokumentasi Teknis

| Dokumen | Isi |
|---------|-----|
| `docs/SYSTEM_ARCHITECTURE.md` | Arsitektur teknis lengkap |
| `docs/CHANGELOG.md` | Riwayat perubahan per fase |
| `docs/DECISION_LOG.md` | Keputusan arsitektur & alasannya |
| `docs/DEVELOPMENT_GUIDE.md` | Standar development |
| `JAYA-WENTER-BLUEPRINT-LOCKED.md` | Blueprint final locked (source of truth) |

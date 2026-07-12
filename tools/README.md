# Development Database Toolkit — Jaya Wenter

Kumpulan utilitas untuk manajemen database Firestore selama development.

> ✅ **Kompatibel dengan Firebase Spark Plan (gratis)**
> Tidak memerlukan Blaze Plan atau Google Cloud Storage.

---

## Daftar Tools

| Tool | Fungsi |
|------|--------|
| `backup-firestore.js` | Backup seluruh collection ke file JSON lokal |
| `restore-firestore.js` | Restore database dari file JSON backup |
| `seed-firestore.js` | Isi Firestore dengan data dummy untuk testing |
| `reset-firestore.js` | Hapus seluruh collection (dengan konfirmasi) |

---

## Persiapan

Semua tool memerlukan akses ke Firebase Admin SDK.
Set salah satu dari dua opsi berikut **sebelum** menjalankan tool.

### Opsi A — Environment Variable (Rekomendasi)
```bash
# Windows PowerShell
$env:FIREBASE_SERVICE_ACCOUNT = Get-Content path\to\sa-key.json -Raw

# Windows CMD
set FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Linux / Mac
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...",...}'
```

### Opsi B — File Credentials
```bash
# Windows PowerShell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\sa-key.json"

# Linux / Mac
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json"
```

> ⚠️ **JANGAN** taruh file service account di dalam folder project.
> Pastikan nama file masuk ke `.gitignore`.

---

## 1. backup-firestore.js

### Fungsi
Backup seluruh collection Firestore menjadi satu file JSON.
File disimpan di folder `backups/` dengan format nama:
```
backup-YYYY-MM-DD-HH-mm.json
```

### Cara menjalankan
```bash
node tools/backup-firestore.js
```

### Contoh output terminal
```
═══════════════════════════════════════════════
  JAYA WENTER — Backup Firestore
═══════════════════════════════════════════════

Project: jaya-wenter-apps
Collections yang akan dibackup: 19

  Backup users               ✅ 5 dokumen
  Backup orders              ✅ 9 dokumen
  Backup hutang              ✅ 3 dokumen
  Backup keuangan            ✅ 6 dokumen
  Backup jadwal              ✅ 5 dokumen
  Backup settings            ✅ 1 dokumen
  Backup agents              ⬜ skip (belum ada)
  Backup roles               ⬜ skip (belum ada)
  ...

═══════════════════════════════════════════════
  ✅ Backup selesai
  Collections : 6 berhasil, 13 di-skip
  Total dokumen: 29
  File        : backups/backup-2026-07-03-14-30.json
  Ukuran      : 12.4 KB
═══════════════════════════════════════════════
```

### Kapan digunakan
- **Sebelum migrasi database** (wajib sebelum Fase 2)
- Sebelum menjalankan `reset-firestore.js`
- Setiap kali ada perubahan data penting
- Sebelum deployment ke production

### Catatan
- Collection yang belum ada di Firestore akan di-skip otomatis (tidak error)
- Subcollection `orders/history` ikut di-backup secara otomatis
- File backup bisa langsung digunakan oleh `restore-firestore.js`

---

## 2. restore-firestore.js

### Fungsi
Restore database dari file JSON hasil `backup-firestore.js`.
Data akan **menimpa** dokumen yang sudah ada (bukan append).

### Cara menjalankan
```bash
node tools/restore-firestore.js backups/backup-2026-07-03-14-30.json
```

### Contoh output terminal
```
═══════════════════════════════════════════════
  JAYA WENTER — Restore Firestore
═══════════════════════════════════════════════

File backup  : backup-2026-07-03-14-30.json
Tanggal backup: 3 Juli 2026, 14.30
Project      : jaya-wenter-apps
Collections  : 6
Total dokumen: 29

⚠️  PERINGATAN: Restore akan MENIMPA data yang sudah ada di Firestore!
   Collections yang akan di-restore:
   - users                5 dokumen
   - orders               9 dokumen
   ...

Ketik YES untuk melanjutkan (atau tekan Enter untuk batal): YES

  Restore users               ✅ 5 dokumen
  Restore orders              ✅ 9 dokumen
  ...

═══════════════════════════════════════════════
  ✅ Restore selesai
  Total dokumen di-restore: 29
═══════════════════════════════════════════════
```

### Kapan digunakan
- Setelah `reset-firestore.js` jika ingin kembali ke data sebelumnya
- Ketika migrasi bermasalah dan perlu rollback
- Memindahkan data antar environment

### Catatan
- Memerlukan konfirmasi `YES` sebelum berjalan
- Subcollection `orders/history` di-restore otomatis
- Dokumen baru di Firestore yang tidak ada di backup **tidak akan dihapus**

---

## 3. seed-firestore.js

### Fungsi
Mengisi Firestore dengan data dummy realistis untuk development dan testing.

### Data yang dibuat
| Collection | Jumlah | Keterangan |
|-----------|--------|-----------|
| users | 5 | 1 owner, 1 kurir, 3 agen |
| jadwal | 5 | Senin–Jumat jam 09.00 |
| orders | 9 | Berbagai status (pending, dijemput, selesai) |
| hutang | 3 | 2 aktif, 1 lunas |
| pembayaran | 3 | Cicilan dan pelunasan |
| keuangan | 6 | 3 pemasukan, 3 pengeluaran |
| pelanggan | 3 | Untuk testing notifikasi WA |
| settings | 1 | Konfigurasi aplikasi + template WA default |

### Cara menjalankan
```bash
node tools/seed-firestore.js
```

### Akun yang tersedia setelah seed
| Username | Role | Keterangan |
|---------|------|-----------|
| `owner_jaya` | owner | Akses penuh |
| `kurir_budi` | kurir | Wilayah Utara |
| `melati_owner` | agen | Laundry Melati |
| `maju_owner` | agen | Laundry Maju |
| `bersih_owner` | agen | Laundry Bersih |

> **Password:** Set manual via Firebase Console → Authentication → Users
> atau gunakan `resetPasswordAgen()` via UI owner setelah backend Render aktif.

### Kapan digunakan
- Setup environment development baru
- Setelah `reset-firestore.js` untuk isi ulang dengan data bersih
- Testing fitur dengan data realistis

### Catatan
- Data seed menggunakan **schema lama** (sebelum migrasi Fase 2)
- Setelah Fase 2 selesai, seed data akan diupdate ke schema baru
- Menjalankan seed dua kali akan **overwrite** data seed sebelumnya (ID sama)

---

## 4. reset-firestore.js

### Fungsi
Menghapus seluruh collection Firestore secara permanen.

### Cara menjalankan
```bash
node tools/reset-firestore.js
```

### Contoh output terminal
```
═══════════════════════════════════════════════
  JAYA WENTER — Reset Firestore (Development)
═══════════════════════════════════════════════

⚠️  ⚠️  ⚠️  PERINGATAN KERAS  ⚠️  ⚠️  ⚠️

Script ini akan MENGHAPUS PERMANEN semua data di Firestore.
Tindakan ini TIDAK DAPAT DI-UNDO.
...

Apakah Anda yakin ingin menghapus seluruh data? Ketik YES: YES
Konfirmasi ulang — ketik YES sekali lagi untuk melanjutkan: YES

  Hapus users               🗑️  5 dokumen dihapus
  Hapus orders              🗑️  9 dokumen dihapus
  Hapus agents              ⬜ kosong / tidak ada
  ...

═══════════════════════════════════════════════
  🗑️  Reset selesai
  Total dihapus : 29 dokumen
  Di-skip       : 13 collection (sudah kosong)
═══════════════════════════════════════════════
```

### Kapan digunakan
- Membersihkan data testing sebelum mulai sesi testing baru
- Reset environment development ke kondisi bersih

### ⚠️ Peringatan penting
- Data yang dihapus **TIDAK DAPAT DIKEMBALIKAN** tanpa backup
- Selalu jalankan `backup-firestore.js` sebelum reset
- Memerlukan konfirmasi `YES` **dua kali** sebelum berjalan
- **JANGAN** jalankan di environment production

---

## Workflow yang Direkomendasikan

### Skenario 1: Setup development dari awal
```bash
# 1. Seed data dummy
node tools/seed-firestore.js

# 2. Set password user via Firebase Console
# 3. Mulai development
```

### Skenario 2: Sebelum migrasi database (Fase 2)
```bash
# 1. Backup data existing
node tools/backup-firestore.js

# 2. Jalankan migration scripts
node tools/migrate/migrate_agents.js
# dst...

# 3. Jika ada masalah, restore
node tools/restore-firestore.js backups/backup-XXXX.json
```

### Skenario 3: Reset dan mulai ulang
```bash
# 1. Backup dulu (wajib!)
node tools/backup-firestore.js

# 2. Reset database
node tools/reset-firestore.js

# 3. Isi ulang dengan data bersih
node tools/seed-firestore.js
```

---

## Struktur Folder

```
tools/
├── backup-firestore.js    ← Backup ke JSON lokal
├── restore-firestore.js   ← Restore dari JSON
├── seed-firestore.js      ← Isi data dummy
├── reset-firestore.js     ← Hapus semua data
└── README.md              ← Dokumentasi ini

backups/                   ← Hasil backup (auto-created)
├── backup-2026-07-03-14-30.json
└── backup-2026-07-04-09-00.json
```

> Folder `backups/` sudah masuk `.gitignore` — file backup tidak ikut ke GitHub.

---

## Kompatibilitas

| Platform | Status |
|---------|--------|
| Firebase Spark Plan | ✅ Kompatibel |
| Firebase Blaze Plan | ✅ Kompatibel |
| Windows 10 | ✅ Tested |
| Node.js >= 18 | ✅ Required |
| npm firebase-admin | ✅ Required |

---

*Development Database Toolkit — Jaya Wenter v1.0.0*

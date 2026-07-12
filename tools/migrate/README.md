# Fase 2 — Migration Scripts

Script migrasi database dari schema lama ke schema Blueprint v4.1.

---

## Urutan Eksekusi (WAJIB BERURUTAN)

```
Step 0  →  Step 1  →  Step 2  →  Step 3  →  Step 4  →  Step 5  →  Step 6
 Check     Agents    Orders    Tagihan   Bayaran    RBAC      Verify
```

---

## Persiapan

Set environment variable sebelum menjalankan script manapun:

```powershell
# Windows PowerShell
$env:FIREBASE_SERVICE_ACCOUNT = Get-Content path\to\sa-key.json -Raw
```

```bash
# Linux / Mac
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

---

## Step 0 — Pre-Migration Check

Cek kondisi database sebelum migrasi. **Jalankan ini dulu.**

```bash
node tools/migrate/0_pre_migration_check.js
```

Output: laporan jumlah dokumen + estimasi migrasi.

---

## ⚠️  Backup Dulu (WAJIB)

Setelah step 0, backup Firestore sebelum mulai migrasi:

```bash
node tools/backup-firestore.js
```

---

## Step 1 — Migrate Agents

Buat collection `agents` dari users yang role='agen'.

```bash
node tools/migrate/1_migrate_agents.js
```

**Yang dilakukan:**
- Buat dokumen baru di `agents` untuk setiap user agen
- Deteksi `mode_tagihan` dari pola hutang: ada nama_pelanggan → Mode A, tidak ada → Mode B
- Update `users`: tambah `agent_id`, ganti role `agen` → `agen_owner`
- Upsert ke `agent_contacts` (marketing layer)
- Simpan `tools/migrate/agent_mapping.json`

**Output file:** `tools/migrate/agent_mapping.json`

---

## Step 2 — Migrate Orders

Update collection `orders` ke schema baru.

```bash
node tools/migrate/2_migrate_orders.js
```

**Prasyarat:** `agent_mapping.json` harus ada (dari Step 1)

**Yang dilakukan:**
- Tambah field `agent_id` dari mapping
- Update status lama → 9 status baru:

| Status Lama | Status Baru |
|-------------|-------------|
| pending | MENUNGGU_DIJEMPUT |
| dijemput | SUDAH_DIJEMPUT |
| diproses | SEDANG_DIPROSES |
| selesai | SUDAH_DIANTAR |

- Tambah semua audit fields: `is_deleted`, `edit_count`, `owner_note`, `batch_id`
- Tambah tracking parsial: `total_received`, `total_completed`, `total_delivered`, `remaining_process`, `remaining_delivery`

---

## Step 3 — Migrate Tagihan

Migrasi collection `hutang` → `tagihan` + `invoices`.

```bash
node tools/migrate/3_migrate_tagihan.js
```

**Prasyarat:** `agent_mapping.json` harus ada (dari Step 1)

**Yang dilakukan:**
- Buat dokumen `tagihan` dari setiap hutang
- Mode A: hutang dengan `nama_pelanggan`
- Mode B: hutang tanpa `nama_pelanggan` → buat juga 1 `invoice` di collection invoices
- Simpan `tools/migrate/tagihan_mapping.json`

**Output file:** `tools/migrate/tagihan_mapping.json`

---

## Step 4 — Migrate Pembayaran

Update FK di collection `pembayaran`.

```bash
node tools/migrate/4_migrate_pembayaran.js
```

**Prasyarat:** `tagihan_mapping.json` harus ada (dari Step 3)

**Yang dilakukan:**
- Tambah `tagihan_id` dari mapping
- Tambah `invoice_id` untuk Mode B
- Tambah field baru: `mode_tagihan`, `diterima_via`, `is_disetor`, `payment_mode`
- Data lama: `diterima_via = 'owner'`, `is_disetor = true`

---

## Step 5 — Setup RBAC

Seed collection `roles` dan `permissions`.

```bash
node tools/migrate/5_setup_rbac.js
```

**Yang dilakukan:**
- Buat 44 permissions di collection `permissions`
- Buat 5 roles: owner, admin, kurir, agen_owner, agen_staff
- Update `settings/app`: tambah `template_wa` dan `website_url`
- Update `jadwal`: tambah field `jam_batas`

---

## Step 6 — Verify Migration

Verifikasi semua hasil migrasi.

```bash
node tools/migrate/6_verify_migration.js
```

**Yang dicek (20 checks):**
- agents tidak kosong, semua punya mode_tagihan
- users tidak ada role 'agen' lama, agen_owner punya agent_id
- orders semua punya agent_id, status baru, is_deleted, tracking parsial
- tagihan ≥ hutang, semua punya mode
- invoices ≥ tagihan mode B
- pembayaran semua punya tagihan_id
- roles ada 5, permissions ada 44+
- settings punya template_wa dan website_url
- jadwal punya jam_batas

**Output file:** `tools/migrate/verify_report.json`

Jika semua pass → **Fase 2 selesai → lanjut ke Fase 3**.

---

## Langkah Manual Setelah Verifikasi

### Update Firestore Security Rules
1. Buka [console.firebase.google.com](https://console.firebase.google.com)
2. Firestore Database → Rules
3. Paste rules dari `JAYA-WENTER-BLUEPRINT-LOCKED.md` bagian Security Rules
4. Klik Publish

### Test Login Semua Role
```
owner     → masuk owner/index.html
agen_owner → masuk agen/index.html
kurir     → (Fase 4: belum ada halaman kurir)
```

---

## Jika Migrasi Bermasalah (Rollback)

```bash
# Restore dari backup
node tools/restore-firestore.js backups/backup-YYYY-MM-DD-HH-mm.json
```

---

## File yang Dihasilkan

```
tools/migrate/
├── 0_pre_migration_check.js
├── 1_migrate_agents.js
├── 2_migrate_orders.js
├── 3_migrate_tagihan.js
├── 4_migrate_pembayaran.js
├── 5_setup_rbac.js
├── 6_verify_migration.js
├── README.md               ← Dokumen ini
├── agent_mapping.json      ← Auto-generated oleh step 1
├── tagihan_mapping.json    ← Auto-generated oleh step 3
└── verify_report.json      ← Auto-generated oleh step 6
```

> `*.json` mapping files masuk `.gitignore` — tidak ikut ke GitHub.

---

*Fase 2 Migration Scripts — Jaya Wenter v2.0*

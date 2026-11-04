# Gap Analysis — Dashboard Kurir (Jaya Wenter)

Status: **DRAFT v2 (semua Open Question terjawab), menunggu persetujuan**. Dokumen analisis saja. Tidak ada kode, komponen React, migrasi, API, tabel Supabase, RLS, bucket, atau deployment yang dibuat.
Dasar: audit repo `NurAbdussalaam/jaya-wenter-app` (HEAD `118e42f`, 30 commit) + Architecture Decision Lock (Vite + React + TS, Tailwind, TanStack Query, Supabase/PostgreSQL/Auth/Storage, Vercel, timezone Asia/Jakarta, tanpa Firebase).
Aturan: jika kode lama bertentangan dengan Decision Lock, **Decision Lock menang**. Hal yang belum diputuskan ditandai `OPEN QUESTION (OQ-n)`.

Catatan: rujukan `(OQ-n)` pada bagian 1-8 adalah rujukan historis; semua OQ sudah terjawab, lihat bagian 17 dan bagian 9-16.

Label bukti: **Terbukti** = terlihat di repo/audit. **Belum dapat dibuktikan** = tidak ada di repo.

---

## 1. Temuan audit aplikasi lama

| # | Temuan | Status bukti |
|---|---|---|
| 1 | Halaman `kurir/index.html` tidak ada. `auth.js` memetakan role `kurir` ke `/kurir/index.html` (halaman tidak ada) | Terbukti |
| 2 | Role `kurir` dan 10 permission sudah dirancang di `api/scripts/setup-rbac.js` | Terbukti |
| 3 | Backend sudah punya `assign-courier`, `temp-courier` (POST/DELETE) di `api/routes/agents.js` | Terbukti |
| 4 | `users/create` menerima role `kurir` dan field `wilayah` (Barat/Timur/Tengah) | Terbukti |
| 5 | Owner tidak punya UI membuat/menonaktifkan kurir atau menetapkan kurir ke agen | Terbukti |
| 6 | Data kurir pada agen disimpan denormalisasi (`default_courier_nama`, `temp_courier.courier_nama`) | Terbukti |
| 7 | Tidak ada konsep foto, nota, hitung jumlah, atau audit status per langkah untuk kurir | Terbukti (tidak ada di repo) |
| 8 | Tidak ada `firestore.rules` di repo; keamanan data tidak dapat diaudit dari repo | Terbukti |
| 9 | Rendering `innerHTML` tanpa escape di 10 file (risiko XSS) | Terbukti |
| 10 | Order produksi lama tidak punya `kurir_id`, `operator_id`, `status_history` | Terbukti (audit data sebelumnya) |
| 11 | Status lama: `pending / dijemput / selesai` (+ 5 status resmi baru sudah didesain di Fase 1 tetapi belum sama dengan 7 status Decision Lock) | Terbukti |
| 12 | Kolom/koleksi `kunjungan`, `setoran`, `tagihan`, `pembayaran` direferensikan permission dan skrip migrasi, tetapi UI kurir tidak ada | Sebagian terbukti (nama ada, perilaku tidak ada) |

## 2. Fitur Kurir yang harus dipertahankan (A)

| Fitur lama | Alasan | Catatan |
|---|---|---|
| Role Kurir | Inti operasional | Dipetakan ke RBAC baru |
| Assignment kurir ke agen (default courier) | Menentukan siapa menjemput/mengantar | Dinormalisasi (lihat bagian 8) |
| Temporary courier (rentang tanggal + alasan) | Kebutuhan cuti/pengganti | Dipertahankan; detail aturan lihat OQ-4 |
| Lihat order | Dasar kerja | Dibatasi pada order yang menjadi tanggung jawabnya |
| Ubah status order | Dasar alur | Dibatasi transisi legal (bagian 13) |
| Lihat tagihan agen | Diperlukan saat delivery | Read-only |
| Catat pembayaran | Diperlukan saat delivery | Mengikuti aturan Type 1/Type 2 |
| Kunjungan: lihat/ubah/reschedule/tambah target custom | Rute harian | Konsep "kunjungan" perlu dikonfirmasi (OQ-5) |
| Setoran: lihat/buat | Kurir menyetor uang | Konsep perlu dikonfirmasi (OQ-6) |
| Wilayah kurir (Barat/Timur/Tengah) | Pembagian area | Perlu dikonfirmasi (OQ-7) |
| Owner membuat/menonaktifkan/menghapus user | Sudah ada API | UI baru dibuat di bagian 16 |

## 3. Fitur yang harus direvisi (B)

| Area | Perilaku lama | Perilaku baru (terkunci) |
|---|---|---|
| Unit kerja | Order berbasis agen dengan jumlah pieces agregat | **1 order = 1 customer = 1 nota = 1 kresek** |
| Status | `pending / dijemput / selesai` | 7 status: `MENUNGGU_PENJEMPUTAN → SUDAH_DIJEMPUT → DITERIMA_WORKSHOP → SEDANG_DIPROSES → SIAP_DIANTAR → SUDAH_DIANTAR → SELESAI` |
| Riwayat status | Tidak ada / array | Tabel history append-only dengan actor, waktu, dan alasan |
| Pickup | Hanya ganti status | Hitung jumlah, cocokkan nota, foto nota, foto isi kresek |
| Delivery | Hanya ganti status | Foto sebelum serah, pembayaran/hutang, selesaikan kunjungan |
| Pembayaran | Satu jalur | Type 1 default LUNAS (boleh ubah ke HUTANG); Type 2 wajib pilih |
| Foto | Tidak ada | Maks 5 per stage per order, tanpa base64, storage privat, metadata di DB, retensi 30 hari |
| Data kurir pada agen | Nama disalin ke dokumen agen | Hanya relasi ID; nama diambil lewat join |
| Wilayah | Field teks pada user | Dipertimbangkan ulang (OQ-7) |
| Otorisasi | Frontend langsung ke Firestore + API Express | Satu lapis otorisasi di database (RLS) + RBAC granular |
| Waktu | `toISOString` campur UTC/lokal | Simpan UTC (`timestamptz`), tampil dan hitung hari bisnis dalam Asia/Jakarta |

## 4. Fitur yang harus dibuang (C)

| Item lama | Alasan dibuang |
|---|---|
| Akses Firestore langsung dari klien dengan rules yang tidak ter-versi | Diganti RLS Supabase yang ter-versi di repo |
| Express API di `api/` sebagai pengelola user | Diganti Supabase Auth + fungsi server yang dirancang kemudian |
| Email sintetis `username@jayawenter.local` | Hanya dipertahankan bila login berbasis username tetap diputuskan (OQ-8) |
| `permissions_override` per user sebagai array bebas | Diganti tabel permission yang tervalidasi |
| Denormalisasi nama kurir pada agen | Anti-pola; sumber kebenaran ganda |
| Pola `innerHTML` mentah | React meng-escape secara default |
| `functions/`, `public/`, `.firebaserc`, `firebase.json`, `firebase-debug.txt` | Legacy Firebase |
| Role string campuran dan permission wildcard `*` untuk owner secara implisit | Owner dimodelkan eksplisit; admin tidak otomatis memiliki hak owner |
| Mode debug Eruda via `?debug=1` | Tidak dibawa ke produksi |

## 5. Mapping permission lama → RBAC baru

Nama lama tidak dipakai persis. Format baru: `resource:action`, scope ditentukan oleh aturan baris (RLS), bukan oleh nama.

| Permission lama | Permission baru (usulan) | Scope baris |
|---|---|---|
| `order.read` | `order:read` | Hanya order agen yang ditugaskan kepada kurir tsb. hari ini (default atau temporary) |
| `order.update_status` | `order:transition` | Hanya transisi yang diizinkan kurir (bagian 13) |
| `tagihan.read` | `billing:read` | Tagihan agen yang ditugaskan |
| `pembayaran.create` | `payment:create` | Hanya pada order saat delivery |
| `kunjungan.read` | `visit:read` | Kunjungan miliknya |
| `kunjungan.update` | `visit:update` | Kunjungan miliknya |
| `kunjungan.reschedule` | `visit:reschedule` | Kunjungan miliknya (OQ-5) |
| `kunjungan.add_custom_target` | `visit:add_target` | Kunjungan miliknya (OQ-5) |
| `setoran.read` | `settlement:read` | Setoran miliknya |
| `setoran.create` | `settlement:create` | Setoran miliknya (OQ-6) |
| (tidak ada) | `photo:upload`, `photo:read` | Foto order miliknya, maks 5 per stage |
| (tidak ada) | `courier:manage` | **Owner saja** (buat, aktif/nonaktif, daftar) |
| (tidak ada) | `assignment:manage` | **Owner saja** (default/temporary); admin hanya jika Owner memberi izin eksplisit |

Prinsip: admin ≠ owner. Hak owner tidak diwariskan lewat wildcard.

## 6. Mapping endpoint lama → service/API baru

Hanya pemetaan konsep. Bentuk akhir (RPC, edge function, atau query langsung ber-RLS) ditentukan di fase desain.

| Endpoint lama | Fungsi | Padanan baru (konsep) |
|---|---|---|
| `POST /api/users/create` | Buat user (termasuk kurir) | Service "buat kurir" (Owner), memakai admin Auth server-side |
| `POST /api/users/reset-password` | Reset password | Service owner-only |
| `POST /api/users/toggle-aktif` | Aktif/nonaktif | Update status profil + cabut sesi |
| `POST /api/users/delete` | Hapus user | Diganti nonaktif/arsip (OQ-9) |
| `GET /api/users/list?role=kurir` | Daftar kurir | Query ber-RLS (Owner) |
| `POST /api/agents/assign-courier` | Default courier | Upsert assignment default |
| `POST /api/agents/temp-courier` | Temporary courier | Insert assignment temporary (rentang tanggal + alasan) |
| `DELETE /api/agents/temp-courier/:id` | Batalkan temporary | Set status dibatalkan (bukan hapus, agar audit-friendly) |
| `GET/POST /api/permissions/*` | Kelola role | Dikelola lewat migrasi/seed; UI kelola role ditunda (OQ-10) |
| (tidak ada) | Transisi status order | Service transisi dengan validasi + tulis history atomik |
| (tidak ada) | Upload foto | Upload langsung ke storage privat dengan URL bertanda tangan + tulis metadata |
| (tidak ada) | Catat pembayaran | Service atomik: pembayaran + tagihan/hutang + history |

## 7. Mapping Firestore lama → PostgreSQL/Supabase baru

Bukan skema final. Tidak ada tabel yang dibuat. Hanya pemetaan konseptual.

| Koleksi lama | Entitas baru (konsep) | Catatan |
|---|---|---|
| `users` | Profil pengguna terhubung ke Supabase Auth | `role`, `aktif`, `wilayah` dipertimbangkan ulang |
| `roles` | Role + permission tervalidasi | Seed, bukan array bebas |
| `agents` | Agen/titik penjemputan | `default_courier_*` dan `temp_courier` dipindah ke assignment |
| `agent_contacts` | Kontak agen | Bisa digabung ke profil/agen |
| `orders` | Order (1 customer, 1 nota, 1 kresek) | Ditambah customer, jumlah, warna, catatan kurir, nomor nota |
| `orders/*/status_history` (desain Fase 1) | Riwayat status append-only | Wajib untuk semua transisi |
| `tagihan` | Tagihan/hutang | Terhubung ke pembayaran |
| `pembayaran` | Transaksi pembayaran | Tidak boleh diedit; koreksi lewat entri baru |
| `settings/app` | Pengaturan (tarif wenter, WA owner, dll.) | Tarif perlu riwayat berlaku (OQ-11) |
| Jadwal regional | Jadwal kunjungan per wilayah | Logika dari `jadwal.js` dibawa sebagai aturan bisnis |
| (tidak ada) | Foto order (metadata) | Baru |
| (tidak ada) | Audit log umum | Baru |

Data produksi lama: 5 order (1 dijemput, 4 selesai) tanpa field kurir/riwayat. Rencana sebelumnya: database di-reset sebelum go-live, sehingga **tidak ada migrasi data lama** kecuali Anda memutuskan lain (OQ-12).

## 8. Mapping assignment courier lama → model baru

| Aspek | Lama | Baru (konsep) |
|---|---|---|
| Default courier | 2 field di dokumen agen (ID + nama) | Relasi agen → kurir dengan status aktif dan riwayat perubahan |
| Temporary courier | Satu map di dokumen agen, hanya satu aktif | Entri bertanggal: kurir, agen, `berlaku_dari`, `berlaku_sampai`, alasan, dibuat oleh, status |
| Penentuan kurir hari ini | Tidak ada logika (hanya data) | Aturan: temporary yang berlaku pada tanggal itu (Asia/Jakarta) mengalahkan default |
| Tanggal | String `YYYY-MM-DD` dibandingkan sebagai teks | Tipe `date` berbasis hari bisnis Asia/Jakarta |
| Validasi | Hanya `dari <= sampai` | Tambah: kurir aktif, tidak tumpang tindih (OQ-4), tanggal tidak di masa lalu |
| Audit | Tidak ada | Siapa menetapkan, kapan, alasan; pembatalan tercatat |

## 9. Workflow Pickup baru

Prinsip SPEED FIRST: satu layar per langkah, tombol besar, input minimal. Daftar tujuan harian (lihat bagian 20) menjadi titik masuk kurir.

| Langkah | Aksi kurir | Data/aturan (keputusan final) |
|---|---|---|
| 1 | Buka agen dari daftar tujuan hari ini | Urutan dapat diatur kurir seperti playlist (drag-and-drop) |
| 2 | Lihat order | Order `MENUNGGU_PENJEMPUTAN` milik agen tsb.; 1 order = 1 customer = 1 nota = 1 kresek |
| 3 | Lihat customer, jumlah, warna, catatan untuk kurir | Tampil sekaligus di kartu order |
| 4 | Hitung jumlah | Angka besar +/- |
| 5 | Cocokkan dengan nota | Jumlah nota awal **tetap tersimpan sebagai pembanding**. Bila hitungan kurir berbeda, kurir mengubah sesuai hitungannya dengan persetujuan agen: **default konfirmasi agen di aplikasi**; sesuai situasi boleh nama saksi atau foto + catatan kurir. Metode yang dipakai tercatat, perubahan masuk audit (OQ-13) |
| 6 | Foto nota | Maks 5 foto per stage; ukuran sekitar 1600 px (OQ-19) |
| 7 | Buka kresek tanpa mengeluarkan pakaian, foto isi | Sekitar 1280 px |
| 8 | Bayar di muka (bila ada) | Dicatat sebagai **titipan uang (deposit)**, bukan pembayaran (OQ-25; bagian 11) |
| 9 | Selesai | `MENUNGGU_PENJEMPUTAN → SUDAH_DIJEMPUT` + history |

Aturan foto (OQ-14): foto wajib, tetapi **boleh menyusul dalam 2 hari** (order ditandai sampai lengkap); sesuai situasi boleh dilewati dengan **alasan wajib** dan kasusnya ditandai untuk ditinjau owner/admin. Setelah batas 2 hari semua proses tetap berjalan, tetapi muncul **peringatan cukup keras** kepada kurir dan kepada admin/bagian operasional terkait.

## 10. Workflow Delivery baru

| Langkah | Aksi kurir | Data/aturan (keputusan final) |
|---|---|---|
| 1 | Buka agen | Agen dengan order `SIAP_DIANTAR` |
| 2 | Lihat order, customer, jumlah | |
| 3 | Lihat tarif wenter dan tagihan agen | Tarif = **tarif saat order dibuat**, tersimpan di order (OQ-11) |
| 4 | Foto pakaian sebelum diserahkan | Maks 5 foto, sekitar 1280 px |
| 5 | Serahkan pakaian | Lihat cabang serah di bawah |
| 6 | Proses pembayaran/hutang | Bagian 11 |
| 7 | Selesaikan kunjungan | Kunjungan/tugas ditutup |

Cabang saat agen tidak di tempat (OQ-24), **kurir memilih di lokasi**:

| Cabang | Perilaku |
|---|---|
| Dititipkan | Pakaian diserahkan ke orang di lokasi; **nama penerima dan foto serah WAJIB**; `SIAP_DIANTAR → SUDAH_DIANTAR`; pembayaran jadi HUTANG |
| Dibawa pulang | Order tetap `SIAP_DIANTAR`; alasan dicatat; diantar lagi di kunjungan berikutnya |

Order menjadi `SELESAI` saat pakaian diserahkan; status pembayaran dilacak terpisah (bagian 13).

## 11. Payment/Hutang workflow Kurir

**Type pembayaran** adalah atribut **agen** (kebiasaan cara membayar), bukan atribut order (OQ-3):

| Type | Kebiasaan | Perilaku kurir saat delivery |
|---|---|---|
| Type 1 | Agen membayar saat pakaian diantar | Default **LUNAS**; dapat diubah ke **HUTANG** (agen tidak punya uang tunai, atau tidak di tempat) |
| Type 2 | Agen membayar setelah customer mengambil pakaian (hari/minggu kemudian, sering di kunjungan berikutnya) | Kurir **wajib memilih** LUNAS atau HUTANG, tanpa default |

Pola membayar hutang, atribut agen yang **dapat berubah sewaktu-waktu** dengan riwayat tanggal berlaku (OQ-26):

| Pola | Perilaku |
|---|---|
| A | Agen membayar per order atau per nama customer; kurir memilih order yang dilunasi |
| B | Agen membayar nominal bebas (contoh: 4 order × Rp25.000 = Rp100.000, dibayar Rp70.000 lalu Rp30.000). Pembayaran dicatat atas nama agen dan **otomatis dialokasikan ke order terlama** |

Aturan umum:

| Aturan | Keputusan |
|---|---|
| Tiga titik pembayaran | Saat pickup (titipan), saat delivery, dan kunjungan berikutnya (pelunasan hutang) |
| Pembayaran sebagian | Boleh; sisa otomatis HUTANG; boleh dicicil berkali-kali, tiap cicilan = entri baru (OQ-1) |
| Hutang | Dicatat **per agen** sebagai total, dengan **rincian per order**; customer akhir tercatat sebagai informasi pada order (OQ-16) |
| Titipan uang (prabayar) | Customer/agen membayar di muka: **bukan pembayaran**, tetapi deposit. Saat tagihan akhir diketahui: kurang → ditagihkan sebesar kekurangan; lebih → **dikembalikan tunai oleh kurir**; semua tercatat (OQ-25) |
| Metode pembayaran | Data master yang dapat ditambah owner. Tunai: tanpa foto, dikonfirmasi lewat setoran. Transfer ke rekening Jaya Wenter: foto bukti wajib dan tidak ikut saldo tunai kurir. Metode lain (mis. QRIS): foto bukti wajib (OQ-17) |
| Audit | Transaksi tidak boleh diubah/dihapus; koreksi lewat entri baru dengan alasan |
| Offline | Lihat bagian 15 (OQ-23) |

**Setoran** (OQ-6): per kejadian (kapan saja); tunai = kurir mengonfirmasi sudah menyetor Rp X (tanda terima) lalu owner/admin mengonfirmasi sudah menerima Rp X; transfer = bukti transfer wajib. Konfirmasi dapat dilakukan **owner maupun admin** (penanggung jawab dapat diubah; saat ini owner). Selisih: default dicatat sebagai **kekurangan kurir berstatus terbuka** sampai diselesaikan; owner/admin dapat memutuskan per kasus (terima, tagih, atau hapus dengan alasan), keputusan tercatat. Uang yang belum tersinkron tidak dapat dikonfirmasi setoran.

## 12. Photo workflow Kurir

| Aturan | Implikasi desain |
|---|---|
| Maks 5 foto per stage per order (terkunci) | Dibatasi di UI **dan** constraint database |
| Tanpa base64, storage privat (terkunci) | Unggah biner; akses lewat URL bertanda tangan berumur pendek |
| Metadata di DB | Order, stage, pengunggah, waktu UTC, ukuran, tipe, path, status file |
| Ukuran (OQ-19) | Nota dan bukti transfer sekitar 1600 px (~400-700 KB); isi kresek dan foto serah sekitar 1280 px (~200-400 KB); kompresi di HP |
| Retensi foto operasional | 30 hari; **hanya file dihapus, metadata tetap** dengan status "file sudah dihapus" (OQ-18) |
| Retensi bukti pembayaran (OQ-2) | Selama hutang terkait terbuka + 1 tahun setelah lunas, minimal 1 tahun sejak unggah; tidak dihapus bila ada hold; owner/admin dapat menandai "simpan permanen". Konfirmasi lama penyimpanan ke akuntan/konsultan pajak |
| Stage | Pickup (nota, isi kresek), Delivery (sebelum serah, serah ke penerima titipan), Bukti pembayaran |
| Foto menyusul | Boleh sampai 2 hari; status per stage: lengkap / menyusul / dilewati + alasan |

## 13. Order state transition dan status terkait

Tujuh status order (terkunci) tidak berubah. Dua jenis status lain **terpisah**, bukan status order tambahan (OQ-15):

| Jenis status | Nilai |
|---|---|
| Status order | `MENUNGGU_PENJEMPUTAN → SUDAH_DIJEMPUT → DITERIMA_WORKSHOP → SEDANG_DIPROSES → SIAP_DIANTAR → SUDAH_DIANTAR → SELESAI` |
| Status pembayaran | mis. menunggu pembayaran / sebagian / lunas (tepatnya ditetapkan di desain data) |
| Status tugas harian kurir | "Selesai" dipicu **tombol oleh kurir** |

Transisi:

| Dari → Ke | Siapa | Syarat |
|---|---|---|
| `MENUNGGU_PENJEMPUTAN → SUDAH_DIJEMPUT` | **Kurir** | Jumlah terisi, foto nota + isi (boleh menyusul) |
| `SUDAH_DIJEMPUT → DITERIMA_WORKSHOP` | **Workshop/operator** (masuk Phase 1, OQ-20) | Penerimaan di workshop |
| `DITERIMA_WORKSHOP → SEDANG_DIPROSES` | Workshop/operator | |
| `SEDANG_DIPROSES → SIAP_DIANTAR` | Workshop/operator | |
| `SIAP_DIANTAR → SUDAH_DIANTAR` | **Kurir** | Foto sebelum serah; bila dititipkan: nama penerima + foto serah |
| `SUDAH_DIANTAR → SELESAI` | Sistem | Terjadi saat pakaian diserahkan; pembayaran dilacak terpisah |

Koreksi (OQ-21): pelaku yang salah tekan boleh **membatalkan dalam waktu singkat (usulan 5 menit)**, **satu langkah mundur**, hanya bila belum ada tindakan lanjutan (status digeser pihak lain, pembayaran tercatat, foto serah terunggah). Setelah itu koreksi hanya oleh **owner/admin dengan alasan wajib**. Riwayat append-only. Setiap transisi menulis history dalam satu transaksi atomik.

## 14. Audit requirements

| Kebutuhan | Rincian |
|---|---|
| Riwayat status | Order, dari, ke, aktor (ID + nama + **peran aktif**), waktu UTC, alasan opsional |
| Pembayaran dan titipan | Append-only; koreksi lewat entri baru dengan alasan; mencatat metode, bukti, status offline |
| Setoran | Konfirmasi dua pihak (kurir + owner/admin) dan penanganan selisih tercatat |
| Assignment | Siapa menetapkan/membatalkan, kapan, alasan |
| Foto | Pengunggah, waktu, stage, status file, status menyusul/dilewati + alasan |
| Persetujuan agen atas perubahan hitungan | Metode (aplikasi/saksi/foto), jumlah nota awal vs hitungan kurir |
| Konfirmasi oleh orang yang sama | **Diizinkan tetapi ditandai** "dikonfirmasi oleh orang yang sama" di laporan (OQ-27) |
| Akun dan peran | Dibuat/diaktifkan/dinonaktifkan; peran ditetapkan/dicabut oleh siapa |
| Field `_nama` | Setiap field aktor memiliki varian nama |
| Tidak dapat diubah | Tabel history/audit tidak dapat di-update/delete oleh peran aplikasi mana pun |
| Waktu | Tampilan WIB; penyimpanan UTC |

## 15. Offline/retry requirements

| Kebutuhan | Perilaku |
|---|---|
| Antrean aksi | Aksi disimpan lokal dan dikirim ulang otomatis |
| Idempotensi | Kunci unik per aksi/transaksi mencegah data ganda |
| Foto | Unggah di latar belakang dengan retry bertahap; status per foto: menunggu / mengunggah / berhasil / gagal |
| Umpan balik | Indikator jelas: tersimpan di perangkat vs sudah terkirim |
| Konflik (OQ-22) | Server = sumber kebenaran. Perubahan tidak bertabrakan digabung; yang **bertabrakan** (status, pembayaran, hitungan) **ditahan untuk tinjauan manual owner/admin**; tidak ada data dibuang; kurir diberi pesan jelas |
| Pembayaran offline (OQ-23) | Boleh dengan pembatasan: hanya **tunai**; penanda "dicatat offline" + waktu catat asli; tidak dapat diubah/dihapus (koreksi lewat entri baru); batas sinkron usulan **24 jam** dengan peringatan keras ke kurir dan owner/admin; setoran tidak bisa mengonfirmasi uang yang belum tersinkron |
| Cache baca | Daftar tujuan/agen/order hari ini tersedia saat offline (TanStack Query persist) |
| Service worker | Versi cache otomatis per build |

## 16. Owner UI requirements untuk management Kurir dan peran

| Kebutuhan | Keterangan |
|---|---|
| Daftar kurir | Nama, username, telepon, wilayah, status, jumlah agen default |
| Buat kurir | Nama, username, telepon; **kata sandi awal dibuat owner** (OQ-8) |
| Login | Username **atau** nomor telepon + kata sandi, bergantian untuk akun yang sama; keduanya wajib unik |
| Aktif/nonaktif | Boleh walau masih memegang order: order **menunggu**, owner/admin memilih kurir pengganti **manual**; peringatan sampai pengganti ditetapkan; order tanpa kurir **tetap tampil** di dashboard owner/admin (OQ-9) |
| Reset kata sandi | Owner |
| Peran per orang (Phase 1, OQ-10, OQ-20) | Layar sederhana untuk menetapkan/mencabut peran (contoh "Budi = kurir + operasional"); satu akun dapat memegang **beberapa peran**; owner saat ini merangkap semua peran. Mengubah isi izin tiap peran **ditunda** |
| Kurir default per agen | Dari halaman agen dan halaman kurir |
| Temporary courier (OQ-4) | **Satu agen hanya satu temporary courier pada satu waktu**; satu kurir boleh menggantikan banyak agen; ada **aksi massal** ("kurir A cuti, digantikan B") yang membuat satu entri per agen dengan tanggal dan alasan; pembatalan dicatat |
| Wilayah (OQ-7) | Data master; atribut agen **dan** kurir; dapat diubah dengan riwayat tanggal berlaku; order berjalan **tidak otomatis pindah kurir** |
| Metode pembayaran, tarif | Owner mengelola daftar metode dan tarif (tarif tersimpan di order saat dibuat; koreksi per order hanya owner/admin dengan alasan) |
| Setoran dan selisih | Konfirmasi owner/admin; penanggung jawab dapat diubah |
| Peninjauan | Antrean konflik offline, kasus foto dilewati, tindakan "dikonfirmasi oleh orang yang sama" |
| Hak akses | Admin tidak otomatis memiliki hak owner; izin eksplisit (mis. `courier:manage`, `assignment:manage`) |
| Tidak hapus permanen | Nonaktif/arsip agar riwayat transaksi utuh |

## 17. Register keputusan (semua Open Question terjawab, 2026-11-02 s.d. 2026-11-03)

Semua OQ-1 sampai OQ-27 sudah dijawab. Keputusan rinci ada di bagian 9-16 dan 20-21. Tabel ini menjadi indeks dan mencatat **sisa kecil** yang belum diputuskan.

| ID | Topik | Keputusan singkat | Sisa kecil yang masih terbuka |
|---|---|---|---|
| OQ-1 | Bayar sebagian | Boleh; sisa HUTANG; dicicil berkali-kali | Siapa yang boleh mencatat cicilan susulan (kurir/owner/admin) |
| OQ-2 | Retensi bukti bayar | Hutang terbuka + 1 tahun setelah lunas; hold/permanen | Konfirmasi ke akuntan/pajak |
| OQ-3 | Type 1/2 | Atribut agen berdasar kebiasaan bayar | - |
| OQ-4 | Temporary courier | Satu per agen; aksi massal | - |
| OQ-5 | Kunjungan | Entitas tetap; sumber otomatis + custom; drag-and-drop | - |
| OQ-6 | Setoran | Per kejadian; konfirmasi dua pihak; selisih | - |
| OQ-7 | Wilayah | Atribut agen dan kurir; berubah; order berjalan tidak pindah | Apakah owner boleh menambah/mengganti nama wilayah (usul: ya, data master) |
| OQ-8 | Login | Username atau telepon; sandi awal owner; unik | - |
| OQ-9 | Nonaktif kurir | Order menunggu; manual; tampil | - |
| OQ-10 | UI peran | Peran-per-orang di Phase 1 | - |
| OQ-11 | Tarif | Tarif saat order dibuat; disalin ke order | - |
| OQ-12 | Data lama | Mulai bersih; arsip ekspor | Lokasi/format arsip dan kapan boleh dihapus |
| OQ-13 | Hitungan vs nota | Hitungan kurir + persetujuan agen; nota awal disimpan | - |
| OQ-14 | Foto | Wajib, boleh menyusul 2 hari atau dilewati dengan alasan | - |
| OQ-15 | Akhir siklus | 7 status tetap; status pembayaran dan tugas kurir terpisah | - |
| OQ-16 | Hutang | Per agen + rincian per order | - |
| OQ-17 | Metode bayar | Tunai/transfer/lain; bukti per metode | - |
| OQ-18 | Metadata foto | File dihapus, metadata tetap | - |
| OQ-19 | Ukuran foto | 1600 px untuk dokumen, 1280 px lainnya | Angka disesuaikan setelah uji lapangan |
| OQ-20 | Workshop | Masuk Phase 1; owner merangkap semua peran | - |
| OQ-21 | Koreksi status | Undo singkat (5 menit) lalu owner/admin | Angka 5 menit dapat disesuaikan |
| OQ-22 | Konflik offline | Server menang; tabrakan ditahan untuk tinjauan | Batas waktu tinjauan; siapa meninjau |
| OQ-23 | Bayar offline | Tunai saja, dibatasi, batas sinkron 24 jam | Angka 24 jam dapat disesuaikan |
| OQ-24 | Agen tidak di tempat | Titip (penerima + foto wajib) atau bawa pulang | Batas berapa kali gagal antar |
| OQ-25 | Prabayar | Titipan uang; kurang ditagih; lebih dikembalikan tunai | - |
| OQ-26 | Alokasi bayar | Pola A/B (berubah); B ke order terlama | - |
| OQ-27 | Konfirmasi orang sama | Diizinkan, ditandai | - |

Catatan: beberapa keputusan (OQ-2, 4, 18, 21, 22, 23) diserahkan pemilik kepada saya dengan arahan "paling aman dan terbaik". Keputusan itu layak ditinjau ulang setelah uji lapangan.

## 18. Risiko migrasi dari desain lama ke aplikasi baru

| Risiko | Tingkat | Mitigasi |
|---|---|---|
| Membawa permission/endpoint lama tanpa menilai ulang | Tinggi | Pakai pemetaan bagian 5-6, bukan salin nama |
| Keamanan data tidak terbukti di sistem lama (tanpa rules di repo) | Tinggi | RLS ter-versi sejak awal; sistem lama bukan acuan keamanan |
| Aturan bisnis tersirat di kode lama hilang (mis. jadwal regional) | Sedang | Tulis sebagai aturan bisnis sebelum rebuild |
| Aturan Asia/Jakarta salah (bug tanggal lama) | Sedang | Hari bisnis dihitung terpusat; uji 23:59, 00:00, 06:59, 07:00 WIB |
| Mulai bersih tanpa migrasi: agen harus dimasukkan ulang | Rendah | Ekspor cadangan Firestore sebelum sistem lama dimatikan; checklist data agen |
| Dua sistem berjalan paralel saat transisi | Sedang | Tetapkan tanggal potong dan satu sumber kebenaran |
| Kurir menolak aplikasi jika lambat atau banyak langkah | Tinggi | SPEED FIRST; uji lapangan dengan kurir nyata |
| Foto menggelembungkan storage/biaya | Sedang | Kompresi, retensi 30 hari, batas 5 |
| Cakupan Phase 1 membengkak (workshop, setoran, jadwal, peran, deposit) | **Tinggi** | Pecah Phase 1 menjadi tahap kecil (bagian 19), satu persetujuan per tahap |
| Pembayaran offline menimbulkan selisih | Tinggi | Pagar OQ-23, setoran hanya atas data tersinkron |
| Satu orang memegang semua peran: pemisahan tugas lemah | Sedang | Penanda "orang yang sama" (OQ-27); aturan ketat diaktifkan saat tugas dibagi |
| Model pembayaran kompleks (titipan, hutang per agen, pola A/B, cicilan) rawan salah hitung | **Tinggi** | Desain data dan uji hitung kasus nyata sebelum UI delivery |

## 19. Rekomendasi implementasi Phase 1

Usulan, **belum disetujui**. Tidak ada yang dikerjakan sebelum persetujuan per tahap.

| Urutan | Isi | Syarat mulai |
|---|---|---|
| 0 | Persetujuan dokumen ini + sisa kecil di bagian 17 | Keputusan Anda |
| 1 | Dokumen desain data dan RBAC final (tanpa migrasi, tanpa tabel dibuat) | Persetujuan tahap 0 |
| 2 | Fondasi: Auth (login ganda), multi-peran, RLS, helper hari bisnis Asia/Jakarta, audit | Persetujuan desain tahap 1 |
| 3 | Owner: kurir (buat/aktif/nonaktif), assignment default dan temporary (+massal), wilayah, peran-per-orang, metode pembayaran, tarif | Fondasi selesai |
| 4 | Daftar tujuan harian + Pickup (hitung, persetujuan agen, foto, titipan uang) | Tahap 3 selesai |
| 5 | Workshop: layar sederhana untuk tiga status tengah | Pickup stabil |
| 6 | Delivery + pembayaran/hutang (Type, pola A/B, cicilan) + setoran | Desain pembayaran diuji dengan kasus nyata |
| 7 | Offline/retry penuh + uji lapangan dengan kurir | Pickup dan Delivery stabil |
| Ditunda | Mengubah isi izin per peran (editor izin) | Fase berikutnya |

Setiap tahap mengikuti alur kerja: Diagnosis → Evidence → Approval → Fix → Deploy → Regression Test → Approval.

## 20. Lampiran: kunjungan dan daftar tujuan harian (OQ-5)

| Aspek | Keputusan |
|---|---|
| Entitas | Kunjungan/daftar tujuan harian tetap ada |
| Frekuensi | Dapat diatur (sekarang 2x seminggu, bisa 3x atau berubah lain), berriwayat; **kurir juga boleh mengatur** |
| Sumber tujuan (otomatis) | (a) order baru yang harus dijemput; (b) order selesai yang harus diantar; (c) agen berjadwal tetap, walau tanpa order |
| Tujuan tambahan | Tempat lain (contoh: toko ABC untuk beli barang): **catatan wajib, biaya opsional** |
| Urutan | Diatur seperti playlist (drag-and-drop) |
| Status | "Tugas selesai" dipicu tombol kurir (OQ-15) |

## 21. Lampiran: penanganan data lama (OQ-12)

Mulai bersih, tanpa migrasi. Data lama (5 order, agen, akun uji) disimpan sebagai arsip ekspor di luar aplikasi. Daftar agen aktif dimasukkan ulang. Ekspor cadangan Firestore dilakukan sebelum sistem lama dimatikan.

---

Dokumen berhenti di sini. Tidak ada kode, komponen, migrasi, API, tabel, RLS, bucket, atau deployment yang dibuat. Menunggu persetujuan Anda untuk tahap berikutnya.

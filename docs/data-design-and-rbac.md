# Desain Data dan RBAC — Jaya Wenter (Phase 1, tahap 1)

Status: **FINAL untuk tahap 1.** Bagian 1-8 semuanya disetujui (2026-11-04). Menunggu keputusan memulai tahap 2.
Dasar: `docs/courier-dashboard-gap-analysis.md` v2 (27 keputusan). Nomor OQ merujuk ke dokumen itu.
Batasan: konseptual saja. **Tidak ada SQL, tabel, migrasi, RLS, bucket, API, atau kode.** Angka dalam contoh adalah ilustrasi.

## Daftar bagian

| Bagian | Isi | Status |
|---|---|---|
| 1 | Model pembayaran dan hutang | **Disetujui 2026-11-03** |
| 2 | Identitas, peran, izin, wilayah | **Disetujui 2026-11-03** |
| 3 | Master: agen, tarif, metode pembayaran | **Disetujui 2026-11-03** |
| 4 | Penugasan kurir dan jadwal/kunjungan | **Disetujui 2026-11-03** |
| 5 | Order, riwayat status, foto | **Disetujui 2026-11-03** |
| 6 | Setoran, peringatan, konflik offline, audit | **Disetujui 2026-11-04** |
| 7 | Matriks izin dan aturan baris per peran | **Disetujui 2026-11-04** |
| 8 | Aturan hari bisnis Asia/Jakarta | **Disetujui 2026-11-04** |

---

# Bagian 1. Model pembayaran dan hutang

## 1.1 Prinsip

| Prinsip | Arti |
|---|---|
| Append-only | Pembayaran, titipan, pengembalian, setoran tidak pernah diubah atau dihapus. Koreksi = entri baru berlawanan + alasan |
| Hutang dihitung, bukan disimpan | Sisa hutang selalu dihitung dari tagihan dikurangi pembayaran dan titipan yang teralokasi. Tidak ada kolom "saldo hutang" yang bisa melenceng |
| Uang punya tiga jenis | **Titipan** (dibayar di muka, belum menjadi pembayaran), **pembayaran** (melunasi tagihan), **pengembalian** (kelebihan titipan dikembalikan) |
| Satu sumber kebenaran per angka | Tagihan order = jumlah final × tarif yang disalin ke order. Tidak dihitung ulang dari tarif terbaru |
| Idempotensi | Setiap transaksi punya kunci unik dari perangkat. Kunci yang sama dua kali = diabaikan |
| Waktu | Disimpan UTC; juga waktu catat asli perangkat; ditampilkan WIB |

## 1.2 Entitas

| Entitas | Isi utama | Aturan integritas |
|---|---|---|
| Tagihan order | order, baris item (jenis, ukuran, jumlah, tarif salinan), total tagihan | Total = jumlah baris item × tarif salinan (OQ-31 terjawab: tarif berdasar jenis dan ukuran, bukan warna). Terkunci pada titik OQ-28 |
| Titipan (deposit) | agen, order, nominal, metode, penerima (kurir), waktu | Append-only. Status turunan: ditahan / diterapkan / sebagian dikembalikan |
| Pembayaran | agen, nominal, metode, penerima (kurir), waktu catat perangkat, waktu sinkron, penanda offline, kunci unik, bukti (non-tunai) | Append-only. Nominal positif. Koreksi lewat entri pembalik |
| Alokasi pembayaran | pembayaran, order, nominal | Jumlah alokasi satu pembayaran tidak boleh melebihi nominal pembayaran. Alokasi satu order tidak boleh melebihi sisa tagihannya |
| Pengembalian titipan | titipan, nominal, dikembalikan oleh (kurir), waktu | Tidak boleh melebihi titipan yang belum diterapkan. Dicatat sebagai kas keluar kurir |
| Kredit agen | agen, nominal, asal (kelebihan bayar), dipakai pada tagihan mana | Append-only; otomatis dipakai pada tagihan berikutnya; dikembalikan tunai hanya atas permintaan agen (OQ-29) |
| Pembalik (koreksi) | referensi ke entri asal, alasan, pelaku | Hanya owner/admin (di luar jendela undo) |
| Riwayat Type dan pola agen | agen, Type (1/2), pola (A/B), berlaku dari | Berriwayat; pola yang berlaku saat pembayaran dipakai untuk alokasi |

Metode pembayaran adalah data master (OQ-17): punya aturan "butuh bukti" dan "ikut saldo tunai kurir".

## 1.3 Perhitungan turunan

| Angka | Rumus |
|---|---|
| Total tagihan order | jumlah jumlah item per jenis/ukuran × tarif per jenis/ukuran yang disalin ke order (jumbo: harga yang disepakati) |
| Titipan diterapkan ke order | min(titipan order, total tagihan order) |
| Sisa tagihan order | total tagihan − titipan diterapkan − jumlah alokasi pembayaran ke order |
| Kelebihan titipan | max(0, titipan order − total tagihan) → wajib dikembalikan tunai oleh kurir (OQ-25) |
| Status pembayaran order | Belum dibayar (sisa = total) / Sebagian / Lunas (sisa = 0). Tidak berlaku sebelum order `SUDAH_DIANTAR` |
| Hutang agen | jumlah sisa tagihan semua order milik agen yang sudah `SUDAH_DIANTAR` dan sisanya > 0 |
| Saldo tunai kurir | tunai diterima (pembayaran + titipan, tersinkron) − pengembalian tunai berbukti − biaya tempat custom − setoran terkonfirmasi |

Order yang belum `SUDAH_DIANTAR` belum menjadi hutang. Ia hanya tagihan yang belum jatuh tempo.

## 1.4 Aturan alokasi

| Pola agen | Cara alokasi |
|---|---|
| A (per order/customer) | Kurir memilih order yang dilunasi. Saran awal: terlama dulu |
| B (nominal bebas) | **Otomatis ke order terlama**; urutan memakai tanggal order dibuat (lihat OQ-33). Pembayaran bisa terbagi: order terlama dilunasi penuh, sisanya masuk ke order berikutnya (sebagian) |
| Pola berubah | Pola yang berlaku pada waktu pembayaran dicatat; pembayaran lama tidak dialokasikan ulang |
| Kelebihan bayar | Bila nominal melebihi seluruh hutang agen: kelebihan menjadi **kredit agen** untuk tagihan berikutnya (OQ-29) |

## 1.5 Alur pembayaran saat delivery

| Kondisi | Perilaku |
|---|---|
| Type 1 | Default LUNAS sebesar sisa tagihan. Kurir dapat memilih HUTANG (nol) atau sebagian |
| Type 2 | Tanpa default. Kurir wajib memilih LUNAS, SEBAGIAN, atau HUTANG |
| Sebagian | Nominal diterima = pembayaran; sisa otomatis menjadi hutang |
| Dititipkan ke orang lain (agen tidak ada) | Pembayaran otomatis HUTANG (nol). Nama penerima dan foto serah wajib |
| Dibawa pulang | Belum ada tagihan jatuh tempo; tidak ada pembayaran |
| Ada titipan | Titipan lebih dulu diterapkan ke tagihan; hanya sisanya yang ditagih ke agen |

## 1.6 Kasus uji (harus lulus sebelum layar delivery dibangun)

Angka ilustrasi. Setiap kasus menyatakan hasil yang harus dihasilkan model.

| # | Kasus | Hasil yang diharapkan |
|---|---|---|
| 1 | Type 1, tagihan Rp25.000, dibayar tunai penuh saat delivery | Sisa 0, status Lunas, saldo tunai kurir +25.000 |
| 2 | Type 1, agen tidak ada uang tunai, kurir memilih HUTANG | Sisa 25.000, status Belum dibayar, hutang agen +25.000 |
| 3 | Type 1, agen tidak di tempat, titip ke penerima (nama + foto) | Order `SUDAH_DIANTAR`, hutang +25.000, penerima tercatat |
| 4 | Type 2 pola B, 4 order × 25.000 (hutang 100.000). Bayar 70.000 | Order 1 dan 2 lunas (50.000), order 3 sebagian (20.000 dari 25.000), order 4 belum. Hutang agen 30.000 |
| 5 | Lanjutan kasus 4: bayar 30.000 | Order 3 lunas (+5.000), order 4 lunas (+25.000). Hutang 0 |
| 6 | Type 2 pola A, agen membayar khusus order milik customer X (25.000) | Hanya order itu lunas. Order lain tetap hutang |
| 7 | Titipan 60.000, tagihan final 60.000 | Titipan diterapkan penuh; sisa 0; tidak ada pembayaran saat delivery |
| 8 | Titipan 50.000, tagihan final 60.000 | Titipan diterapkan 50.000; sisa 10.000 ditagih mengikuti Type agen |
| 9 | Titipan 70.000 (tunai), tagihan final 60.000 | Diterapkan 60.000; kelebihan 10.000 dikembalikan tunai oleh kurir dan tercatat. Saldo tunai kurir: +70.000 − 10.000 = 60.000 |
| 10 | Pembayaran salah nominal (tercatat 25.000, seharusnya 20.000) | Entri pembalik −25.000 + entri baru 20.000, dengan alasan. Entri asli tidak berubah |
| 11 | Perangkat mengirim transaksi yang sama dua kali (kunci unik sama) | Entri kedua diabaikan; tidak ada pembayaran ganda |
| 12 | Pola agen berubah B → A di tengah, ada hutang berjalan | Pembayaran baru mengikuti pola A. Alokasi lama tidak berubah |
| 13 | Saldo tunai kurir 200.000; kurir menyatakan setor 190.000; owner mengonfirmasi terima 190.000 | Kekurangan kurir 10.000 berstatus terbuka (OQ-6) |
| 14 | Pembayaran tunai dicatat offline, belum tersinkron | Tidak masuk saldo tunai yang bisa disetor sampai tersinkron (OQ-23) |
| 15 | Pembayaran melebihi seluruh hutang agen (bayar 100.000, hutang 80.000) | Hutang 0; kelebihan 20.000 menjadi kredit agen untuk tagihan berikutnya |
| 16 | Workshop mengubah ukuran satu item dari normal (30.000) ke jumbo (harga disepakati 40.000) sebelum `SIAP_DIANTAR` | Total tagihan naik 10.000; agen diberi notifikasi; perubahan tercatat dengan alasan; titipan dihitung ulang |
| 17 | Pengembalian titipan 10.000: agen mengonfirmasi di aplikasi | Pengembalian sah; saldo tunai kurir berkurang 10.000; bukti konfirmasi tersimpan |

## 1.7 Keputusan tambahan dari penyusunan model (semua terjawab)

| ID | Pertanyaan | Dampak |
|---|---|---|
| OQ-28 | ~~Kapan tagihan final terkunci~~ **TERJAWAB 2026-11-03:** terkunci saat order **`SIAP_DIANTAR`**. Setelah titik kunci, **workshop masih boleh mengubah dengan alasan wajib**, dan setiap perubahan tercatat (plus notifikasi ke agen dan peringatan terlihat agen dan kurir, OQ-35). **Kunci bersifat "lunak"**: bukan larangan, tetapi perubahan sesudahnya selalu beralasan, tercatat, dan diberitahukan. Bila agen tidak setuju: jalur **manual lewat WhatsApp** ke admin/workshop (tanpa fitur keberatan di aplikasi untuk Phase 1) | Titik acuan rekonsiliasi titipan; perubahan pasca-kunci menghasilkan entri koreksi dan memicu penghitungan ulang sisa tagihan
| OQ-29 | ~~Bayar melebihi seluruh hutang~~ **TERJAWAB 2026-11-03:** kelebihan menjadi **kredit agen** untuk tagihan berikutnya; dikembalikan tunai hanya bila agen meminta (tercatat) | Perlu entitas kredit agen (append-only) yang otomatis dipakai pada tagihan berikutnya |
| OQ-30 | ~~Pembatalan order~~ **TERJAWAB 2026-11-03:** pada `MENUNGGU_PENJEMPUTAN`: kurir, owner, atau admin boleh membatalkan (alasan wajib). Sesudah `SUDAH_DIJEMPUT`: hanya owner/admin; kurir hanya **mengajukan**. Titipan uang dikembalikan tunai dan pengembalian tercatat. Sisa: status pembatalan (bukan salah satu dari 7 status; dimodelkan terpisah) | Perlu penanda pembatalan terpisah dari 7 status terkunci |
| OQ-31 | ~~Tarif per pieces~~ **TERJAWAB 2026-11-03:** warna **tidak** memengaruhi tarif. Tarif berdasar **jenis dan ukuran**: ukuran dewasa normal untuk jaket, celana, kaos, hem, rok = **Rp30.000**; topi dewasa normal = **Rp25.000**; ukuran **jumbo** (lebih besar) lebih mahal, tetapi **dikonfirmasi dulu ke agen/customer**. Sisa: tarif jumbo, ukuran anak, jenis lain, siapa yang mencatat jenis/ukuran per item (OQ-35) | Total tagihan dihitung per baris item; harga jumbo disepakati per kasus |
| OQ-32 | ~~Biaya tempat custom~~ **TERJAWAB 2026-11-03:** dibayar dari tunai kurir; dicatat, mengurangi saldo tunai, dan diganti lewat catatan setoran | Saldo tunai kurir = diterima − pengembalian − biaya custom − setoran terkonfirmasi |
| OQ-33 | ~~Urutan "order terlama"~~ **TERJAWAB 2026-11-03:** memakai **tanggal order dibuat** | Urutan alokasi pola B |
| OQ-34 | ~~Konfirmasi pengembalian titipan~~ **TERJAWAB 2026-11-03 (pilihan diserahkan ke Claude; syarat: kurir punya bukti pengembalian ke agen):** **default konfirmasi agen di aplikasi** (agen ingat, kurir punya bukti); bila tidak memungkinkan, boleh nama saksi atau foto + catatan kurir (sama seperti persetujuan hitungan, OQ-13). Metode tercatat | Pengembalian tanpa bukti tidak dianggap sah untuk menutup saldo tunai kurir |
| OQ-35 | ~~Siapa mencatat jenis/ukuran item~~ **TERJAWAB 2026-11-03:** **agen mencatat perkiraan** saat input order; **workshop memverifikasi** dan **dapat mengubah** jenis/ukuran/tarif bila ternyata lebih besar atau lebih kecil; perubahan **memberi notifikasi ke agen**, **tercatat**, dan ada **peringatan yang dapat dilihat agen dan kurir**. Hitungan kurir saat pickup (jumlah vs nota, OQ-13) tetap berlaku sebagai tahap tengah. **Update 2026-11-03:** bila agen tidak setuju, jalurnya manual lewat WhatsApp ke admin/workshop; perubahan setelah titik kunci masih boleh dengan alasan dan tercatat (OQ-28) | Alur tiga tahap: perkiraan agen → hitungan kurir → verifikasi workshop; perlu riwayat perubahan baris item dan notifikasi |

Semua OQ-28 sampai OQ-35 sudah terjawab (2026-11-03). Sisa kecil dicatat pada baris masing-masing.

## 1.8 Keputusan yang menjadi dasar Bagian 1

OQ-1, 2, 3, 6, 11, 15, 16, 17, 23, 24, 25, 26, 27 (lihat `courier-dashboard-gap-analysis.md`, bagian 17).

---

# Bagian 2. Identitas, peran, izin, dan wilayah

## 2.1 Prinsip

| Prinsip | Arti |
|---|---|
| Satu orang = satu akun, banyak peran | Owner saat ini merangkap semua peran; peran dapat ditambah atau dicabut tanpa membuat akun baru (OQ-20, OQ-10) |
| Peran aktif tercatat | Setiap tindakan di audit mencatat **peran yang sedang dipakai**, bukan hanya orangnya |
| Izin granular | Format `resource:action`; peran hanyalah kumpulan izin. Isi izin awal dari seed; editor izin ditunda (OQ-10) |
| Batas data di database | Siapa boleh melihat/mengubah baris apa dijaga aturan database, bukan hanya layar |
| Admin bukan owner | Tidak ada izin yang diwariskan otomatis dari owner |
| Tidak hapus permanen | Akun dinonaktifkan atau diarsipkan agar riwayat transaksi utuh |

## 2.2 Entitas

| Entitas | Isi utama | Aturan integritas |
|---|---|---|
| Profil pengguna | nama, username, nomor telepon, status aktif, dibuat oleh, kata sandi awal dibuat owner | Username **unik**, nomor telepon **unik**; login memakai salah satunya bergantian (OQ-8) |
| Peran | owner, admin, kurir, operasional (workshop), agen pemilik, agen staf | Data seed; peran sistem tidak dapat dihapus |
| Izin | daftar `resource:action` | Data seed |
| Izin per peran | peran → izin | Data seed; diubah lewat pengembang pada Phase 1 |
| Peran per orang | orang, peran, berlaku dari, berlaku sampai, ditetapkan oleh | Berriwayat; pencabutan dicatat; satu orang boleh banyak peran aktif |
| Keterkaitan agen | profil agen pemilik/staf → agen | Pemilik dan staf hanya melihat data agennya sendiri |
| Wilayah | nama, aktif | **Data master** (bukan nilai tetap di kode); owner dapat menambah (OQ-7) |
| Wilayah agen | agen, wilayah, berlaku dari | Berriwayat; perubahan tidak memindahkan order berjalan |
| Wilayah kurir | kurir, wilayah utama, berlaku dari | Berriwayat; wilayah utama = default penugasan |

## 2.3 Katalog izin (daftar, bukan matriks; matriks per peran ada di Bagian 7)

| Sumber daya | Aksi |
|---|---|
| order | baca, buat, ubah-perkiraan, batalkan, ajukan-pembatalan |
| order_item | catat-perkiraan, hitung-kurir, verifikasi, ubah-pasca-kunci |
| status_order | transisi-kurir, transisi-workshop, koreksi-owner-admin, batalkan-singkat (undo) |
| foto | unggah, baca, tandai-hold, tandai-permanen, lewati-dengan-alasan |
| titipan, pembayaran, kredit, pengembalian | baca, catat, koreksi (pembalik) |
| setoran | ajukan, konfirmasi, tangani-selisih |
| kunjungan | baca, atur-urutan, tambah-tujuan-custom, atur-frekuensi, tutup-tugas |
| penugasan | tetapkan-default, tetapkan-sementara, batalkan, massal |
| kurir | buat, aktif-nonaktif, daftar, reset-sandi |
| peran_per_orang | tetapkan, cabut |
| wilayah, tarif, metode_pembayaran | baca, kelola |
| agen | baca, buat, ubah, ubah-type-pola |
| antrean_peninjauan | baca, putuskan (konflik offline, foto dilewati, konfirmasi orang sama) |
| peringatan | baca |
| audit | baca |

## 2.4 Aturan penting

| Aturan | Keterangan |
|---|---|
| Satu orang memegang beberapa peran | Layar pemilih peran; tindakan mencatat peran aktif (OQ-20) |
| Konfirmasi dua pihak oleh orang yang sama | Diizinkan tetapi **ditandai** di laporan (OQ-27) |
| Nonaktif | Mencabut akses dan sesi; kurir nonaktif memicu aturan OQ-9 (order menunggu, peringatan sampai pengganti) |
| Perlindungan akun owner (usulan, OQ-38) | Sistem menolak mencabut peran owner atau menonaktifkan akun owner **terakhir** yang aktif |
| Pembuatan akun | Owner membuat kurir dan akun lain; kata sandi awal dibuat owner (OQ-8); siapa yang boleh membuat akun agen: OQ-37 |

---

# Bagian 3. Data master: agen, tarif, metode pembayaran

## 3.1 Entitas

| Entitas | Isi utama | Aturan integritas |
|---|---|---|
| Agen | nama, nomor WhatsApp, alamat/penanda lokasi, aktif | Wilayah dan kurir default lewat riwayat (Bagian 2 dan 4) |
| Riwayat Type dan pola bayar agen | agen, Type (1/2), pola (A/B), berlaku dari, diubah oleh | Berriwayat; pembayaran memakai pola yang berlaku pada waktunya (Bagian 1) |
| Jenis pakaian | jaket, celana, kaos, hem, rok, topi, dan lainnya | Master yang dapat ditambah owner |
| Ukuran | **per jenis pakaian** (bukan daftar global): mis. kaos/jaket/celana/hem/rok: dewasa normal, jumbo; sprei: beberapa ukuran; sarung tangan: satu ukuran | Master per jenis; owner dapat menambah |
| Tarif | jenis × ukuran → harga, berlaku dari | Berriwayat; **warna tidak memengaruhi tarif**. Contoh: dewasa normal jaket/celana/kaos/hem/rok Rp30.000; topi Rp25.000; sprei sekitar Rp90.000-120.000 (menurut ukuran); sarung tangan Rp10.000. Harga baku dapat disesuaikan per kasus menurut ukuran, ketebalan, dan kesulitan, dengan alasan dan konfirmasi sebelum dikerjakan (OQ-40, OQ-41) |
| Konfirmasi harga jumbo | baris item, harga disepakati, dikonfirmasi oleh (agen/customer), cara konfirmasi, waktu | Item jumbo wajib punya konfirmasi sebelum pickup dianggap final |
| Warna | hitam, biru tua, hijau tua, coklat tua, abu tua, dan lainnya | Master informasi; tidak memengaruhi harga |
| Metode pembayaran | nama, butuh bukti, ikut saldo tunai kurir, rekening tujuan (bila transfer), aktif | Owner dapat menambah (OQ-17); tunai: tanpa bukti, ikut saldo kurir; transfer: bukti wajib, tidak ikut saldo kurir |

## 3.2 Aturan

| Aturan | Keterangan |
|---|---|
| Tarif disalin ke baris item order saat dibuat | Perubahan tarif tidak menyentuh order lama (OQ-11) |
| Tarif tidak dihapus | Hanya diberi tanggal berakhir, agar riwayat dapat ditelusuri |
| Customer akhir bukan master | Nama customer hanya informasi pada order (OQ-16). Apakah nomor WhatsApp customer dicatat: OQ-39 |
| Pemisahan Type dan pola | Type (kapan agen biasanya membayar) dan pola (cara melunasi) adalah dua atribut berbeda yang berubah terpisah |

## 3.3 Pertanyaan baru dari Bagian 2-3

| ID | Pertanyaan | Usul saya |
|---|---|---|
| OQ-36 | ~~Keuangan untuk agen staf~~ **TERJAWAB 2026-11-03 (setuju usul):** hanya **agen pemilik** melihat hutang, tagihan, dan saldo; **agen staf** hanya order | Aturan baris: data keuangan agen terbatas pada peran agen pemilik |
| OQ-37 | ~~Pembuat akun agen~~ **TERJAWAB 2026-11-03 (setuju usul):** **owner dan admin** (admin dengan izin eksplisit); akun kurir tetap **owner saja** | Izin `agen:buat` terpisah dari `kurir:buat` |
| OQ-38 | ~~Perlindungan owner terakhir~~ **TERJAWAB 2026-11-03 (setuju usul):** sistem **menolak** mencabut peran atau menonaktifkan akun owner terakhir yang aktif | Guard di database |
| OQ-39 | ~~WhatsApp customer pada order~~ **TERJAWAB 2026-11-03 (setuju usul):** nomor WhatsApp customer **dicatat sebagai kolom opsional** pada order; fitur kirim pesan ke customer **ditunda** | Kolom opsional; tidak ada fitur kirim di Phase 1 |
| OQ-40 | ~~Ukuran dan tarif lain~~ **TERJAWAB sebagian 2026-11-03:** tarif **sangat bervariasi dan bergantung ukuran**; satu jenis pakaian bisa punya banyak ukuran. Contoh: **sprei sekitar Rp90.000-120.000**, **sarung tangan Rp10.000**. Jadi ukuran bukan daftar global, melainkan **per jenis**. Sisa (OQ-41): apakah rentang seperti sprei berupa ukuran tetap dengan harga masing-masing, atau harga bebas dalam rentang yang disepakati per kasus | Model tarif: daftar (jenis, ukuran) → harga; mekanisme harga disepakati untuk yang di luar daftar | **Update 2026-11-03:** rentang seperti 90-120rb hanyalah contoh; rentang lain banyak. Harga dipengaruhi **ukuran, ketebalan, dan tingkat kesulitan**; kesulitan sulit diukur sebelum kondisi barang diketahui pasti.
| OQ-41 | ~~Penetapan harga berentang~~ **TERJAWAB 2026-11-03 (usul gabungan, disesuaikan dengan penjelasan pemilik):** ada **harga baku per (jenis, ukuran)** sebagai acuan; harga final dapat **disesuaikan per kasus** menurut ukuran, ketebalan, dan tingkat kesulitan, dengan **alasan tercatat**. Harga yang berbeda dari baku/barang di luar daftar **wajib dikonfirmasi ke agen/customer sebelum dikerjakan**. Sisa (OQ-42): di tahap mana harga dikunci dan bagaimana konfirmasi dicatat | Tarif baku + penyesuaian beralasan + konfirmasi sebelum proses; workshop memverifikasi kondisi barang (OQ-35) |
| OQ-41 | ~~Penetapan harga yang berentang~~ **TERJAWAB sebagian 2026-11-03:** rentang sprei Rp90.000-120.000 hanyalah **contoh**. Tarif sebenarnya dipengaruhi **ukuran, ketebalan, dan tingkat kesulitan**; tingkat kesulitan sulit diukur sebelum kondisi barang diperiksa. Harga **selalu dikonfirmasi dulu sebelum dikerjakan**. Maka tarif di master berfungsi sebagai **harga acuan**, dan harga final per item dapat ditetapkan workshop saat memeriksa barang (dengan faktor dan alasan tercatat). Sisa: OQ-42 (gerbang konfirmasi dan bentuk konfirmasi) | Model: harga acuan (master) vs harga final per baris item; faktor penentu (ukuran, ketebalan, kesulitan); status harga (baku / perlu konfirmasi / dikonfirmasi) |
| OQ-42 | ~~Konfirmasi harga: cara dan kewajiban~~ **TERJAWAB 2026-11-03:** (1) **Metode boleh bervariasi dan tercatat**: admin/workshop menghubungi dan mencatat siapa yang mengonfirmasi, bagaimana, dan kapan; agen boleh mengonfirmasi di aplikasi atau lewat WhatsApp yang dicatat. **Bila nomor HP customer tercatat di order, konfirmasi langsung ditanyakan ke customer; agen hanya diberi pemberitahuan.** (2) **Harga baku tanpa penyesuaian boleh langsung dikerjakan** tanpa konfirmasi; konfirmasi hanya untuk harga yang berbeda dari baku atau barang di luar daftar. Titik gerbang: konfirmasi harus ada sebelum `SEDANG_DIPROSES` bagi item yang memerlukannya | Entitas konfirmasi harga (siapa: agen/customer, metode, waktu, pencatat); nomor HP customer pada order (OQ-39) kini punya fungsi nyata; syarat tambahan transisi `DITERIMA_WORKSHOP → SEDANG_DIPROSES` |

## 3.4 Keputusan yang menjadi dasar Bagian 2-3

OQ-7, 8, 9, 10, 11, 17, 20, 27, 31, 35 (lihat `courier-dashboard-gap-analysis.md` bagian 17 dan Bagian 1 dokumen ini).

---

# Bagian 4. Penugasan kurir, jadwal, dan kunjungan

## 4.1 Prinsip

| Prinsip | Arti |
|---|---|
| Kunjungan tetap entitas sendiri | Satu kunjungan = satu kurir mendatangi satu agen pada satu hari bisnis; boleh berisi jemput, antar, atau keduanya (OQ-5) |
| Daftar kunjungan dibentuk otomatis | Dari order baru, order siap diantar, dan jadwal tetap agen; kurir dapat menambah kunjungan khusus |
| Penanggung jawab ditentukan berlapis | Kurir sementara (bila ada) > kurir default agen > kurir wilayah. Order yang sedang berjalan **tidak otomatis pindah kurir** (OQ-7) |
| Riwayat, bukan timpa | Perubahan kurir default, kurir sementara, dan jadwal disimpan berriwayat |
| Tidak ada yang diblokir diam-diam | Kurir nonaktif yang masih memegang order memunculkan peringatan, bukan penolakan (OQ-9) |

## 4.2 Entitas

| Entitas | Isi utama | Aturan integritas |
|---|---|---|
| Kurir default agen | agen, kurir, berlaku dari, berlaku sampai, ditetapkan oleh | Satu kurir default aktif per agen pada satu waktu |
| Kurir sementara | agen, kurir pengganti, mulai, selesai, alasan, dibuat oleh | **Satu kurir sementara aktif per agen**; satu kurir boleh menggantikan banyak agen; tersedia aksi massal (pilih banyak agen sekaligus) |
| Jadwal agen | agen, frekuensi (hari dalam minggu atau interval), berlaku dari, diatur oleh | Frekuensi dapat diatur; owner/admin dan kurir yang berwenang boleh mengatur (OQ-5); berriwayat |
| Kunjungan | tanggal bisnis, kurir, agen, sumber (order baru / siap diantar / jadwal tetap / khusus), urutan, status, catatan, biaya khusus opsional | Kunjungan khusus **wajib catatan**; biaya opsional dibayar dari kas kurir (masuk rumus saldo tunai, Bagian 1) |
| Isi kunjungan | kunjungan, order, tindakan (jemput / antar) | Satu order bisa muncul di dua kunjungan berbeda (jemput lalu antar) |
| Urutan kunjungan | kunjungan, nomor urut | Diatur seret-dan-lepas oleh kurir; hanya mengubah urutan, bukan data lain |
| Status tugas harian kurir | kurir, tanggal bisnis, status (belum mulai / berjalan / selesai), waktu mulai/selesai | Diubah oleh **tombol kurir**, terpisah dari status order dan status bayar |

## 4.3 Status kunjungan

| Status | Arti | Kapan |
|---|---|---|
| DIRENCANAKAN | Terbentuk, belum didatangi | Awal |
| SELESAI | Semua isi kunjungan tuntas | Kurir menandai |
| SEBAGIAN | Sebagian isi tuntas (mis. jemput jadi, antar ditunda) | Kurir menandai dengan alasan |
| GAGAL | Tidak bertemu agen dan tidak ada yang dititipi | Alasan wajib; order antar tetap SIAP_DIANTAR (OQ-24) |
| DIBATALKAN | Tidak jadi didatangi | Alasan wajib; hanya kurir pemilik atau owner/admin |

## 4.4 Aturan

| Aturan | Keterangan |
|---|---|
| Pembentukan otomatis | Setiap hari bisnis, sistem membentuk kunjungan dari tiga sumber di atas; duplikat untuk agen yang sama pada hari yang sama **digabung** jadi satu kunjungan |
| Kurir nonaktif | Order yang dipegang tetap menunggu, tampil di dasbor owner/admin dengan peringatan, dan owner/admin memilih pengganti (OQ-9) |
| Perubahan wilayah | Hanya memengaruhi order dan kunjungan **baru**; yang sedang berjalan tetap pada kurir lama sampai dipindah manual |
| Pemindahan manual | Owner/admin dapat memindah satu order/kunjungan ke kurir lain dengan alasan; tercatat di audit |
| Kunjungan tertunda | Kunjungan yang tidak selesai pada hari bisnis tidak hilang; muncul lagi di hari berikutnya sebagai bawaan (usul, OQ-44) |

## 4.5 Pertanyaan dari Bagian 4 (OQ-43 sampai 45 terjawab, setuju usul)

| No | Pertanyaan | Usul | Dampak |
|---|---|---|---|
| OQ-43 | **TERJAWAB 2026-11-03 (setuju usul).** Apakah kurir boleh melihat dan menambah kunjungan untuk agen di luar wilayah/daftar agennya sendiri? | **Tidak secara default**; kurir hanya melihat agen miliknya (default, sementara, wilayah). Menambah kunjungan khusus ke agen lain hanya lewat owner/admin | Aturan baris per kurir (Bagian 7) |
| OQ-44 | **TERJAWAB 2026-11-03 (setuju usul).** Kunjungan GAGAL atau tidak selesai: otomatis muncul lagi besok? Berapa kali gagal sebelum owner/admin diberi peringatan? | **Otomatis muncul lagi** sebagai bawaan; setelah **3 kali gagal beruntun** untuk agen yang sama muncul peringatan ke owner/admin (angka dapat diubah) | Penanda bawaan pada kunjungan; ambang peringatan |
| OQ-45 | **TERJAWAB 2026-11-03 (setuju usul).** Siapa boleh mengatur jadwal tetap agen: semua kurir untuk agennya, atau hanya owner/admin dengan kurir hanya mengusulkan? | **Kurir dapat mengatur jadwal agen yang menjadi tanggung jawabnya** (sesuai jawaban OQ-5), semua perubahan tercatat, dan owner/admin dapat membatalkan | Izin `jadwal:atur` untuk kurir dibatasi ke agennya |

## 4.6 Keputusan yang menjadi dasar Bagian 4

OQ-5, 6, 7, 9, 24 (lihat `courier-dashboard-gap-analysis.md` bagian 17).

---

# Bagian 5. Order, riwayat status, dan foto

## 5.1 Prinsip

| Prinsip | Arti |
|---|---|
| 1 order = 1 customer = 1 nota = 1 kresek | Aturan terkunci; tidak diubah |
| 7 status order tetap | MENUNGGU_PENJEMPUTAN, SUDAH_DIJEMPUT, DITERIMA_WORKSHOP, SEDANG_DIPROSES, SIAP_DIANTAR, SUDAH_DIANTAR, SELESAI |
| Tiga hal terpisah | Status order, status bayar (menunggu pembayaran / lunas), dan status tugas harian kurir tidak saling menggantikan |
| Tiga tahap pencatatan item | Agen mencatat perkiraan, kurir menghitung saat jemput (dengan persetujuan agen), workshop memverifikasi (OQ-35) |
| Riwayat tidak ditimpa | Setiap perubahan status dan perubahan harga menambah baris riwayat; koreksi lewat entri pembalik |
| Foto: metadata di database, berkas di penyimpanan privat | Tidak ada base64; maksimal 5 foto per tahap |

## 5.2 Entitas

| Entitas | Isi utama | Aturan integritas |
|---|---|---|
| Order | nomor order, agen, nama customer (info), WhatsApp customer (opsional), nomor nota, status, kurir jemput, kurir antar, tanggal bisnis dibuat, catatan, dibuat oleh | Satu agen per order; kurir jemput/antar tidak berubah otomatis (Bagian 4) |
| Baris item | order, jenis, ukuran, warna (info), jumlah catatan agen, jumlah hitungan kurir, jumlah verifikasi workshop, tarif acuan (salinan), harga final, status harga (BAKU / PERLU_KONFIRMASI / DIKONFIRMASI), alasan penyesuaian, catatan kondisi | Tarif disalin saat order dibuat (OQ-11); total tagihan = jumlah dari item (Bagian 1) |
| Persetujuan hitungan jemput | order, hitungan kurir, hitungan nota asli (pembanding), metode (agen di aplikasi / nama saksi / foto + catatan), pemberi persetujuan, waktu | Hitungan kurir dipakai; hitungan nota asli disimpan sebagai pembanding (OQ-13) |
| Konfirmasi harga | baris item, harga, dikonfirmasi oleh (agen/customer), metode, pencatat, waktu | Wajib untuk harga di luar baku sebelum SEDANG_DIPROSES (OQ-42) |
| Riwayat status | order, dari, ke, oleh, peran aktif, waktu, alasan, penanda undo | Hanya tambah; satu langkah mundur sesuai aturan undo |
| Permintaan pembatalan | order, pemohon, alasan, status (menunggu / disetujui / ditolak), diputuskan oleh | Dipakai kurir setelah jemput (OQ-30) |
| Foto | order, tahap, jalur penyimpanan, ukuran, diambil oleh, waktu ambil, waktu unggah, status (ada / dilewati + alasan / berkas dihapus), tanda tahan | Maks 5 per tahap; berkas dihapus setelah 30 hari, metadata tetap; bukti bayar mengikuti aturan hutang + 1 tahun |

## 5.3 Transisi status

| Dari → Ke | Siapa | Syarat |
|---|---|---|
| (baru) → MENUNGGU_PENJEMPUTAN | owner, admin, agen, kurir | Agen dan item tercatat; tarif disalin |
| MENUNGGU_PENJEMPUTAN → SUDAH_DIJEMPUT | kurir | Hitungan kurir + persetujuan agen (atau cadangan saksi / foto + catatan); foto boleh menyusul 2 hari atau dilewati dengan alasan |
| SUDAH_DIJEMPUT → DITERIMA_WORKSHOP | operasional (juga owner/admin) | Workshop memverifikasi jenis, ukuran, jumlah; selisih dengan hitungan jemput memicu peringatan, tidak memblokir |
| DITERIMA_WORKSHOP → SEDANG_DIPROSES | operasional | **Gerbang harga:** semua item berstatus PERLU_KONFIRMASI sudah DIKONFIRMASI; item harga baku lolos tanpa konfirmasi |
| SEDANG_DIPROSES → SIAP_DIANTAR | operasional | Tagihan terkunci lunak: perubahan setelahnya hanya workshop, dengan alasan, agen diberi tahu |
| SIAP_DIANTAR → SUDAH_DIANTAR | kurir | Pembayaran dicatat (Bagian 1) atau HUTANG; bila dititipkan ke orang: nama dan foto penerima wajib; bila agen tidak ada dan dibawa pulang: tetap SIAP_DIANTAR |
| SUDAH_DIANTAR → SELESAI | sistem / owner / admin | Keputusan pembayaran tercatat (LUNAS atau HUTANG); **tidak menunggu hutang lunas** (usul, OQ-46) |
| MENUNGGU_PENJEMPUTAN → batal | kurir, owner, admin | Alasan wajib |
| setelah jemput → batal | owner/admin memutuskan | Kurir hanya mengajukan permintaan pembatalan |

Undo: pelaku dapat mundur **satu langkah** dalam sekitar 5 menit bila belum ada tindakan lanjutan; setelah itu hanya owner/admin dengan alasan (angka dapat diubah).

## 5.4 Foto

| Tahap | Isi | Ukuran target |
|---|---|---|
| Jemput | nota + barang/kresek | nota ~1600 px, lainnya ~1280 px |
| Workshop | kondisi barang saat diterima | ~1280 px |
| Antar | barang diserahkan; penerima bila dititipkan | ~1280 px |
| Bukti bayar | transfer/QRIS (tunai tanpa foto) | ~1600 px |

Aturan: foto wajib tetapi boleh menyusul (2 hari) atau dilewati dengan alasan; lewat 2 hari muncul peringatan kuat tanpa memblokir; berkas operasional dihapus setelah 30 hari, metadata tetap; tanda tahan mencegah penghapusan.

## 5.5 Pertanyaan baru dari Bagian 5 (dengan usul paling aman)

| No | Pertanyaan | Usul | Dampak |
|---|---|---|---|
| OQ-46 | **TERJAWAB 2026-11-03 (setuju usul).** Kapan order menjadi SELESAI? | Otomatis setelah SUDAH_DIANTAR **dan** keputusan pembayaran (LUNAS atau HUTANG) tercatat; hutang tidak menahan status (hutang dilacak per agen). Untuk agen Type 2, order tetap SUDAH_DIANTAR sampai kurir memilih | Aturan transisi terakhir |
| OQ-47 | **TERJAWAB 2026-11-03 (diubah pemilik):** nomor nota unik **dibentuk sistem** dan **mengandung kode agen, tanggal, dan jam order dimasukkan ke aplikasi** (zona Asia/Jakarta). Sisa: OQ-50 (format, bentrok jam, hubungan dengan nota kertas). Usul awal "unik per agen, boleh kosong" digantikan | Nomor nota otomatis dan unik; kode agen menjadi atribut tetap agen | Batas unik pada order |
| OQ-48 | **TERJAWAB 2026-11-03 (setuju usul, dengan tambahan alur konfirmasi dari pemilik).** Bila hitungan workshop berbeda dari hitungan jemput? | Peringatan ke owner/admin dan agen; order lanjut; tagihan memakai hitungan workshop terverifikasi, selisih tercatat | Peringatan Bagian 6; sumber jumlah tagihan |

### Tambahan jawaban OQ-48 (alur konfirmasi workshop, 2026-11-03)

| Hal | Aturan |
|---|---|
| Ada nomor HP customer | Workshop mengonfirmasi **manual ke customer lewat WhatsApp**; **setelah disetujui baru dikerjakan** |
| Tidak ada nomor HP customer | Workshop memberi tahu **agen**, lewat WhatsApp atau **notifikasi otomatis di aplikasi agen** |
| Kasus tertentu (contoh: pakaian sangat besar dan tebal, tarif bisa 4-5 kali tarif biasa) | **Wajib persetujuan agen dulu**, baru dikerjakan; ini gerbang keras sebelum SEDANG_DIPROSES |
| Sisa | OQ-49: batas yang menentukan "kasus tertentu", dan apakah customer juga perlu setuju bila nomor HP ada |

### Pertanyaan lanjutan (usul paling aman)

| No | Pertanyaan | Usul | Dampak |
|---|---|---|---|
| OQ-49 | **TERJAWAB 2026-11-03 (setuju usul).** Batas "kasus tertentu" yang wajib disetujui agen | Harga final **>= 2x harga baku** (atau barang di luar daftar) = wajib persetujuan **agen**, tercatat; bila nomor HP customer ada, customer **juga** dimintai (agen tetap diberi tahu); angka 2x dapat diubah | Aturan gerbang harga |
| OQ-50 | **TERJAWAB 2026-11-03 (setuju usul).** Format nomor nota otomatis | Kode agen + tanggal + jam, mis. `AGN012-20261103-213600` (sampai detik agar tidak bentrok); nomor nota kertas dari agen, bila ada, dicatat terpisah sebagai pembanding | Kolom nomor nota sistem + nomor nota kertas |

## 5.6 Keputusan yang menjadi dasar Bagian 5

OQ-11, 12, 13, 14, 15, 16, 19, 21, 22, 23, 30, 35, 41, 42 (lihat `courier-dashboard-gap-analysis.md` bagian 17 dan Bagian 1, 3 dokumen ini).

---

# Bagian 6. Setoran, peringatan, konflik offline, dan audit

## 6.1 Prinsip

| Prinsip | Arti |
|---|---|
| Server adalah sumber kebenaran | Data di perangkat kurir hanyalah antrean; yang berlaku adalah yang diterima server (OQ-21) |
| Dua pihak untuk uang | Setoran dikonfirmasi kurir (menyerahkan) lalu owner/admin (menerima); orang yang sama boleh memegang dua peran, tetapi **ditandai** (OQ-20) |
| Peringatan tidak memblokir | Kelalaian foto, selisih hitungan, atau keterlambatan memunculkan peringatan, bukan penolakan |
| Hanya tambah | Setoran, konflik, peringatan, dan audit tidak diubah atau dihapus; koreksi lewat entri pembalik |

## 6.2 Setoran

| Entitas | Isi utama | Aturan integritas |
|---|---|---|
| Setoran | kurir, tanggal bisnis, jumlah diserahkan (kata kurir), jumlah diterima (kata penerima), penerima, status, catatan | Per kejadian (bukan per hari); dua langkah: kurir mengonfirmasi, lalu owner/admin mengonfirmasi (OQ-3) |
| Selisih setoran | setoran, jumlah selisih, status (kekurangan kurir terbuka / diputuskan), keputusan, alasan, diputuskan oleh | **Default: kekurangan kurir terbuka**; owner/admin dapat memutuskan per kasus (dihapuskan, dipotong, dicicil) dengan alasan |
| Saldo tunai kurir | Turunan, tidak disimpan | tunai diterima - pengembalian tunai terverifikasi - biaya kunjungan khusus - setoran terkonfirmasi - kekurangan terbuka tidak dihitung ganda (rumus di Bagian 1) |

Status setoran: DIAJUKAN_KURIR, DITERIMA, DITERIMA_DENGAN_SELISIH, DIKOREKSI (lewat entri pembalik).

## 6.3 Katalog peringatan

| Peringatan | Pemicu | Tampil ke | Memblokir? |
|---|---|---|---|
| Foto terlambat | Foto belum ada setelah 2 hari | kurir, owner/admin | Tidak |
| Foto dilewati | Dilewati dengan alasan | owner/admin | Tidak |
| Selisih hitungan | Hitungan workshop berbeda dari hitungan jemput (OQ-48) | owner/admin, agen | Tidak |
| Harga perlu konfirmasi | Item PERLU_KONFIRMASI sebelum SEDANG_DIPROSES | workshop, owner/admin | **Ya**, gerbang harga (OQ-42, OQ-49) |
| Harga diubah workshop | Perubahan setelah kunci | agen, kurir | Tidak |
| Kurir nonaktif memegang order | Kurir dinonaktifkan saat memegang order (OQ-9) | owner/admin | Tidak |
| Kunjungan gagal beruntun | 3 kali berturut-turut untuk agen yang sama (OQ-44) | owner/admin | Tidak |
| Pembayaran offline | Setiap pembayaran tunai yang dicatat offline | owner/admin | Tidak |
| Konfirmasi oleh orang yang sama | Dua pihak diisi satu orang | owner/admin | Tidak |
| Setoran selisih | Jumlah diterima berbeda dari jumlah diserahkan | owner/admin | Tidak |
| Sinkron offline lewat batas | Belum tersinkron setelah sekitar 24 jam | owner/admin, kurir | Tidak |

## 6.4 Offline dan konflik

| Aturan | Keterangan |
|---|---|
| Yang boleh offline | Mencatat hitungan, foto (antre unggah), perubahan status; pembayaran offline **hanya tunai** |
| Pembayaran offline | Ditandai, tidak dapat diubah, memakai **kunci idempotensi** agar tidak tercatat ganda saat diulang |
| Batas sinkron | Sekitar 24 jam; lewat batas tidak ditolak otomatis, melainkan **ditandai** untuk ditinjau |
| Konflik | Dua perubahan bertabrakan pada baris yang sama (mis. status berbeda dari dua perangkat): **ditahan**, tidak diterapkan otomatis; entri konflik menyimpan kedua versi |
| Peninjauan | owner/admin memilih versi yang berlaku atau menggabungkan, dengan alasan; keduanya tercatat |
| Transfer/QRIS offline | Tidak diizinkan (bukti dan verifikasi perlu koneksi) |

## 6.5 Audit

| Hal | Aturan |
|---|---|
| Isi | siapa, **peran aktif**, kapan (UTC + hari bisnis Asia/Jakarta), tindakan, objek, nilai sebelum, nilai sesudah, alasan, perangkat/sumber (online/offline) |
| Apa yang dicatat | Perubahan status, harga, tarif, tagihan, pembayaran, setoran, peran, penugasan, jadwal, penonaktifan akun, keputusan konflik |
| Sifat | Hanya tambah; tidak dapat diubah atau dihapus oleh siapa pun, termasuk owner |
| Undo | Dicatat sebagai tindakan sendiri, bukan penghapusan |
| Akses | owner dan admin (izin eksplisit) melihat semua; kurir melihat riwayat tindakannya sendiri |

## 6.6 Pertanyaan baru dari Bagian 6 (dengan usul paling aman)

| No | Pertanyaan | Usul | Dampak |
|---|---|---|---|
| OQ-51 | **TERJAWAB 2026-11-04 (setuju usul).** Siapa mencatat cicilan hutang berikutnya? | Kurir bila menerima **tunai** saat kunjungan (ikut saldo kurir); owner/admin bila agen **mentransfer** ke rekening (dengan bukti); keduanya terhubung ke agen, alokasi sesuai pola A/B | Izin `pembayaran:catat` untuk kurir dan owner/admin |
| OQ-52 | **TERJAWAB 2026-11-04 (setuju usul).** Batas waktu peninjauan konflik offline? | Peringatan bila **3 hari** belum ditinjau; data konflik tidak berlaku sampai diputuskan | Ambang peringatan |
| OQ-53 | **TERJAWAB 2026-11-04 (setuju usul).** Lama penyimpanan audit? | **Permanen** (barisnya kecil, tanpa foto); tidak ada penghapusan otomatis | Tidak ada pembersihan terjadwal untuk audit |

## 6.7 Keputusan yang menjadi dasar Bagian 6

OQ-3, 9, 19, 20, 21, 22, 23, 44, 48 (lihat `courier-dashboard-gap-analysis.md` bagian 17 dan Bagian 1, 4, 5 dokumen ini).

---

# Bagian 7. Matriks izin dan aturan baris per peran

Lambang: **Y** = boleh; **-** = tidak; **B** = boleh dengan batas baris (lihat 7.2). Daftar izin mengikuti katalog 2.3. Isi matriks adalah **data seed**; editor izin ditunda (OQ-10). Satu orang dapat memegang beberapa peran; izin yang berlaku mengikuti **peran aktif**.

## 7.1 Matriks

| Sumber daya : aksi | Owner | Admin | Kurir | Operasional | Agen pemilik | Agen staf |
|---|---|---|---|---|---|---|
| order : baca | Y | Y | B | B | B | B |
| order : buat | Y | Y | B | - | B | B (OQ-56) |
| order : ubah-perkiraan | Y | Y | - | - | B | B |
| order : batalkan | Y | Y | B (hanya MENUNGGU_PENJEMPUTAN) | - | - | - |
| order : ajukan-pembatalan | - | - | B (setelah jemput) | - | - | - |
| order_item : hitung-kurir | - | - | B | - | - | - |
| order_item : verifikasi | Y | Y | - | Y | - | - |
| order_item : ubah-pasca-kunci | Y | Y | - | Y (alasan wajib) | - | - |
| persetujuan hitungan jemput | - | - | - | - | B | B (OQ-56) |
| konfirmasi harga | Y (atas nama) | Y (atas nama) | - | Y (mencatat) | B | B (OQ-56) |
| status_order : transisi-kurir | - | - | B | - | - | - |
| status_order : transisi-workshop | Y | Y | - | Y | - | - |
| status_order : koreksi-owner-admin | Y | Y | - | - | - | - |
| status_order : undo singkat | B (tindakannya sendiri) | B | B | B | - | - |
| foto : unggah / baca | Y | Y | B | B | B (baca) | B (baca) |
| foto : tandai-hold / permanen | Y | Y | - | - | - | - |
| foto : lewati-dengan-alasan | Y | Y | Y | Y | - | - |
| titipan, pembayaran : catat | Y | Y | B (tunai) | - | - | - |
| titipan, pembayaran, kredit : baca | Y | Y | B (agen yang dilayani) | - (usul, OQ-55) | B | - |
| pengembalian : catat | - | - | B | - | - | - |
| pengembalian : konfirmasi | - | - | - | - | B | - |
| koreksi (pembalik) keuangan | Y | Y (izin eksplisit) | - | - | - | - |
| setoran : ajukan | - | - | B | - | - | - |
| setoran : konfirmasi, tangani-selisih | Y | Y | - | - | - | - |
| kunjungan : baca / atur-urutan / tutup-tugas | Y | Y | B | - | - | - |
| kunjungan : tambah-tujuan-custom | Y | Y | B (agennya) | - | - | - |
| kunjungan : atur-frekuensi | Y | Y | B (agennya) | - | - | - |
| penugasan : default / sementara / massal | Y | Y | - | - | - | - |
| kurir : buat, aktif-nonaktif, reset-sandi | Y | - | - | - | - | - |
| kurir : daftar | Y | Y | - | - | - | - |
| peran_per_orang : tetapkan / cabut | Y | - | - | - | - | - |
| wilayah, tarif, metode_pembayaran : baca | Y | Y | Y | Y | - | - |
| wilayah, tarif, metode_pembayaran : kelola | Y | - (usul, OQ-54) | - | - | - | - |
| agen : baca | Y | Y | B | B | B (miliknya) | B (miliknya) |
| agen : buat | Y | B (izin eksplisit, OQ-37) | - | - | - | - |
| agen : ubah / ubah-type-pola | Y | Y | - | - | - | - |
| antrean_peninjauan : baca / putuskan | Y | Y | - | - | - | - |
| peringatan : baca | Y | Y | B (miliknya) | B | B (terkait agennya) | - |
| audit : baca | Y | B (izin eksplisit) | B (tindakannya sendiri) | B (tindakannya sendiri) | - | - |

## 7.2 Aturan baris (dijaga database, bukan hanya layar)

| Peran | Baris yang boleh dilihat atau diubah |
|---|---|
| Owner | Semua |
| Admin | Semua data operasional; **tidak** mengelola master, akun kurir, atau peran per orang; bukan owner |
| Kurir | Order, kunjungan, dan agen yang menjadi tanggung jawabnya (kurir sementara > default agen > wilayah, Bagian 4); keuangan hanya untuk agen yang ia layani dan saldo tunainya sendiri; tidak melihat order agen lain (OQ-43) |
| Operasional | Order dari DITERIMA_WORKSHOP sampai SIAP_DIANTAR; tidak melihat keuangan agen |
| Agen pemilik | Hanya agennya sendiri: order, tagihan, titipan, hutang, kredit, notifikasi |
| Agen staf | Hanya order agennya sendiri; **tanpa keuangan** (keputusan pemilik: hanya agen pemilik melihat keuangan agen) |

## 7.3 Aturan tambahan

| Aturan | Keterangan |
|---|---|
| Tidak ada izin diwariskan otomatis | Admin tidak otomatis memperoleh izin owner (admin bukan owner) |
| Peran aktif menentukan izin | Orang dengan peran kurir dan owner memakai izin sesuai peran yang dipilih saat bertindak; audit mencatatnya |
| Pencabutan segera berlaku | Nonaktif atau cabut peran mengakhiri sesi dan akses baru |
| Nol akses default | Tabel baru tidak terbuka sampai diberi aturan; tidak ada akses anonim ke data atau foto |
| Foto privat | Dibaca lewat tautan sementara yang mengikuti aturan baris order |
| Dua pihak | Tindakan yang menuntut dua pihak (setoran, pengembalian, persetujuan hitungan) ditandai bila dilakukan orang yang sama (OQ-27) |

## 7.4 Pertanyaan baru dari Bagian 7 (dengan usul paling aman)

| No | Pertanyaan | Usul | Dampak |
|---|---|---|---|
| OQ-54 | **TERJAWAB 2026-11-04 (setuju usul).** Apakah admin boleh mengelola master (tarif, wilayah, metode pembayaran)? | **Tidak**; owner saja, admin hanya membaca. Dapat diberikan per orang lewat izin eksplisit nanti | Pemisahan owner/admin |
| OQ-55 | **TERJAWAB 2026-11-04 (setuju usul).** Apakah operasional (workshop) boleh melihat pembayaran dan hutang agen? | **Tidak**; hanya order dan tagihan item yang perlu diproses | Aturan baris operasional |
| OQ-56 | **TERJAWAB 2026-11-04 (diubah pemilik).** Apa yang boleh dilakukan agen staf? | Boleh **membuat dan melihat order**, **menyetujui hitungan jemput**, dan **mengonfirmasi harga** (diubah pemilik); **tidak** boleh titipan, pengembalian, atau melihat keuangan (hanya agen pemilik) | Pembagian pemilik vs staf |

## 7.5 Keputusan yang menjadi dasar Bagian 7

OQ-7, 8, 10, 11, 17, 20, 27, 37, 38, 43 (lihat `courier-dashboard-gap-analysis.md` bagian 17 dan Bagian 2, 4, 5, 6 dokumen ini).

---

# Bagian 8. Aturan hari bisnis (Asia/Jakarta)

## 8.1 Prinsip

| Prinsip | Arti |
|---|---|
| Zona bisnis tunggal | Semua aturan hari bisnis memakai **Asia/Jakarta (UTC+7, tanpa waktu musim panas)**, apa pun zona waktu perangkat atau lokasi pengguna |
| Simpan UTC, hitung hari bisnis di server | Waktu disimpan sebagai titik waktu absolut (UTC); **hari bisnis diturunkan server**, bukan dikirim perangkat |
| Jam server menang | Waktu perangkat dicatat sebagai informasi, tidak dipakai untuk menentukan hari bisnis atau batas waktu |
| Satu definisi | Hari bisnis = tanggal kalender Asia/Jakarta, dari 00:00 sampai 23:59:59 (OQ-57) |

## 8.2 Aturan per hal

| Hal | Aturan |
|---|---|
| Tanggal bisnis order, kunjungan, setoran, pembayaran | Diturunkan server dari waktu kejadian diterima, dicatat sebagai kolom tanggal bisnis |
| Pembentukan kunjungan harian | Dibuat sekali per hari bisnis, saat hari bisnis dimulai atau saat pertama dibutuhkan; menghindari duplikat (Bagian 4) |
| Nomor nota | Tanggal dan jam di dalam nomor memakai waktu Asia/Jakarta (OQ-50) |
| Batas foto menyusul (2 hari) | Dihitung dalam **hari bisnis kalender**: dari tanggal bisnis kejadian sampai akhir hari bisnis ke-2 (OQ-58) |
| Penghapusan berkas foto (30 hari) | Dihitung dari tanggal bisnis foto, dijalankan setelah akhir hari bisnis ke-30 |
| Retensi bukti bayar | Selama hutang terbuka + 1 tahun, dihitung dari tanggal bisnis hutang lunas; tanda tahan mengalahkan semuanya |
| Batas undo (sekitar 5 menit), sinkron offline (sekitar 24 jam), peninjauan konflik (3 hari) | Dihitung **berdasarkan lama waktu berlalu**, bukan pergantian hari bisnis, dari jam server |
| Entri offline | Menyimpan dua waktu: waktu kejadian menurut perangkat dan waktu diterima server; **tanggal bisnis memakai waktu kejadian bila selisih dengan jam server masih wajar, bila tidak, memakai waktu diterima server dan ditandai** (OQ-59) |
| Laporan dan rekap harian | Dikelompokkan menurut tanggal bisnis Asia/Jakarta; pemilik di zona lain tetap melihat jam bisnis |
| Tampilan waktu | Selalu ditampilkan dalam Asia/Jakarta dengan penanda zona bila perangkat berbeda zona |
| Hari libur | Tidak ada kalender libur di Phase 1; jadwal tetap berjalan, owner/admin atau kurir dapat meniadakan kunjungan dengan alasan (OQ-60) |

## 8.3 Pertanyaan baru dari Bagian 8 (dengan usul paling aman)

| No | Pertanyaan | Usul | Dampak |
|---|---|---|---|
| OQ-57 | **TERJAWAB 2026-11-04 (setuju usul).** Hari bisnis berganti pukul berapa? | **00:00 Asia/Jakarta** (tanggal kalender biasa); bila nanti ada kerja lewat tengah malam yang membingungkan, jam pergantian dapat dijadikan pengaturan | Definisi tunggal hari bisnis |
| OQ-58 | **TERJAWAB 2026-11-04 (setuju usul).** "2 hari" untuk foto menyusul: 48 jam atau 2 hari bisnis? | **2 hari bisnis kalender** (sampai akhir hari ke-2), lebih mudah dipahami kurir dan laporan | Perhitungan peringatan foto terlambat |
| OQ-59 | **TERJAWAB 2026-11-04 (setuju usul).** Perangkat kurir offline dengan jam salah: pakai jam apa? | Pakai waktu kejadian bila selisih dengan server **kurang dari 5 menit**; lebih dari itu pakai waktu diterima server dan **tandai** untuk ditinjau (angka dapat diubah) | Penanda jam perangkat menyimpang |
| OQ-60 | **TERJAWAB 2026-11-04 (setuju usul).** Perlu kalender hari libur? | **Belum di Phase 1**; kunjungan dapat ditiadakan manual dengan alasan | Menunda tabel libur |

## 8.4 Keputusan yang menjadi dasar Bagian 8

Aturan terkunci: zona bisnis Asia/Jakarta; OQ-21, 22, 23, 44, 50, 52 (lihat Bagian 4-6 dokumen ini).

---

# Penutup: ringkasan akhir

## Status keputusan

| Hal | Isi |
|---|---|
| Keputusan tercatat | OQ-1 sampai OQ-60, seluruhnya terjawab (OQ-1..27 di `courier-dashboard-gap-analysis.md`; OQ-28..60 di dokumen ini) |
| Cakupan | Bagian 1 pembayaran dan hutang; 2 identitas dan izin; 3 master; 4 penugasan dan kunjungan; 5 order dan foto; 6 setoran, offline, audit; 7 matriks izin; 8 hari bisnis |
| Yang belum dibuat | Kode, tabel, migrasi, aturan RLS, bucket, API, deploy. Semuanya menunggu persetujuan tahap berikutnya |

## Sisa yang masih terbuka

| No | Hal | Kapan diputuskan |
|---|---|---|
| 1 | Lokasi dan format arsip ekspor data lama, dan kapan boleh dihapus (OQ-12) | Sebelum data lama diekspor, bukan sebelum tahap 2 |
| 2 | Angka yang dapat diubah: undo 5 menit, sinkron offline 24 jam, foto menyusul 2 hari, peninjauan konflik 3 hari, ambang kunjungan gagal 3 kali, ambang harga 2x baku, toleransi jam perangkat 5 menit, daftar ukuran per jenis | Setelah uji lapangan tahap 7 |
| 3 | Keputusan yang diserahkan pemilik kepada saya ("pilihkan yang paling aman") | **Ditinjau ulang setelah uji lapangan**; ditandai usul paling aman di tiap bagian |
| 4 | Ditunda ke phase berikutnya: editor izin per peran, fitur kirim WhatsApp ke customer, kalender hari libur | Setelah Phase 1 stabil |

## Langkah berikutnya

Tahap 2 Phase 1: fondasi (login ganda, multi-peran, RLS, hari bisnis, audit). **Tidak dimulai sebelum Anda menyetujuinya.** Seperti tahap sebelumnya, saya mulai dengan rencana teknis tertulis (tanpa kode) untuk disetujui terlebih dahulu.

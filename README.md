# Pertandingan — Mini Soccer Live

Website mini soccer dengan skor live, match center, profil tim dan pemain, serta papan mabar. Dibuat dengan Node.js tanpa dependency dan frontend vanilla agar ringan, mudah dijalankan, dan mudah dimodifikasi.

## Jalankan

```bash
npm start
```

Buka `http://localhost:4173`.

- PIN operator default: **2468**
- Ubah PIN: `ADMIN_PIN=pin-rahasia npm start`
- Ubah port: `PORT=8080 npm start`
- Mode watch saat development: `npm run dev`

Tidak ada proses build. Semua aset ada di `public/`, data tersimpan di `data/db.json`.

## Fitur

- **Live score** — pertandingan berdurasi **2 × 15 menit**. Operator menambah skor, mencatat gol/kartu/pergantian, mengatur menit, menjeda jam, dan menutup pertandingan. Panel kontrol hanya menampilkan laga live dan laga yang dipilih lewat **Tambah dari jadwal**; semua layar diperbarui otomatis lewat Server-Sent Events (SSE).
- **Turnamen fase grup** — halaman `/turnamen` menampilkan 4 grup dengan format 3 atau 4 tim per grup, klasemen lengkap (main, menang, seri, kalah, selisih gol, kartu, poin), penanda zona lolos, dan keterangan bahwa 2 tim teratas setiap grup maju ke babak 8 besar. Operator dapat mengklik slot kosong di kartu Grup A–D untuk memasukkan tim; tim yang sudah masuk grup tidak muncul lagi di pilihan. Jadwal grup bisa dibuat otomatis sebagai round-robin atau ditambah satu per satu lewat **Laga manual**, dengan nama tim lengkap dan jam sendiri.
- **Fase gugur otomatis/manual** — setelah fase grup selesai, operator bisa memilih bracket otomatis dari klasemen atau mengisi manual. Mencakup 8 besar, semifinal, perebutan juara 3, final, serta podium juara 1–4. Nama tim dan jam setiap laga bisa diatur pada mode manual; pemenang otomatis maju pada mode otomatis.
- **Papan kartu & gol** — posisi pencetak gol terbanyak, kartu kuning terbanyak, dan kartu merah terbanyak tersedia di beranda serta halaman turnamen. Jumlah kartu juga tampil di direktori pemain, profil, klasemen grup, dan laporan PDF.
- **Match center** — skor live, jalannya pertandingan, statistik duel, jadwal, hasil, dan arsip semua laga yang dikelompokkan per tanggal.
- **Tim & pemain** — operator bisa membuat tim baru lengkap dengan nama, kode, kota, warna, pelatih, markas, **logo**, dan daftar nama pemain sekaligus. Setiap baris **Skuad awal** punya tombol foto; pemain lain bisa ditambahkan kemudian lewat panel **Tambah pemain ke skuad**.
- **Laporan PDF tim** — tombol **Unduh PDF** di profil tim menghasilkan laporan berisi profil klub, posisi liga, selisih gol, roster, gol, assist, kartu kuning, dan kartu merah.
- **Pemain** — direktori dengan pencarian, filter tim, sorting (termasuk kartu), serta profil dan statistik individual. Foto pemain bisa diunggah saat menambah pemain atau langsung dari profil.
- **Mabar** — daftar sesi terbuka, join/leave tanpa akun, pembuatan sesi oleh pengunjung, progres slot, dan peserta.
- **Tema gelap/terang** — tombol di header, tersimpan di browser, dan langsung berlaku di semua halaman.
- **Operator** — login PIN, kontrol skor, pencatatan kejadian, pengaturan turnamen, pembagian grup, pembuatan jadwal, serta manajemen tim/pemain/mabar.

## Alur operator

1. Buka `/admin` lalu masuk dengan PIN.
2. Pilih pertandingan dari **Tambah dari jadwal** agar muncul di panel Kontrol live. Stepper skor dipakai untuk koreksi cepat; form kejadian mencatat gol sekaligus menambah skor.
3. Atur status menjadi **Live** untuk memulai jam 2 × 15 menit, dan **Full time** saat selesai. Laga fase gugur tidak boleh berakhir seri.
4. Tab **Tim & pemain** untuk menginput tim baru, logo, serta nama dan foto pemain di **Skuad awal**. Tambah pemain berikutnya lewat panel **Tambah pemain ke skuad**.
5. Di profil pemain, operator juga bisa **Upload foto**, **Ganti foto**, atau **Hapus foto**.
6. Tab **Turnamen** menampilkan urutan **Pengaturan turnamen → Pembagian grup → Jadwal fase grup → Fase gugur**. Isi semua slot grup, lalu buat jadwal round-robin atau tambah laga grup satu per satu lewat **Laga manual** (nama tim lengkap dan jam sendiri).
7. Setelah semua laga grup selesai, pilih **Isi otomatis** untuk bracket dari klasemen atau **Isi manual** untuk mengisi tim dan jam 8 besar hingga final. Pemenang dicatat lewat Kontrol live.
8. Setelah final dan perebutan juara 3 selesai, klik **Tutup & selesaikan turnamen**. Panel **Buat turnamen baru** akan muncul; event lama otomatis masuk **Riwayat turnamen**.
9. Semua penonton menerima pembaruan tanpa refresh.

Logo tim dan foto pemain menerima PNG, JPG, atau WebP. Browser mengecilkan gambar menjadi maksimal 512px sebelum dikirim, lalu server menyimpannya di `public/uploads/`.

## Data demo

Data awal dibuat otomatis saat server pertama kali dijalankan. Untuk mengembalikan skor, peserta mabar, tim tambahan, dan logo yang diunggah ke kondisi awal:

```bash
npm run reset
```

Lalu restart server agar seed baru dibuat.

## Struktur

```text
server.js          HTTP server, API, SSE, auth operator
pdf-report.js      generator laporan PDF tim tanpa dependency
seed.js            data liga, pemain, jadwal, mabar, dan turnamen demo
reset.js           penghapus data demo
public/index.html  shell aplikasi
public/app.js      router SPA, komponen, modal, realtime
public/styles.css  design system, responsive layout, tema gelap/terang
data/db.json       dibuat otomatis saat runtime
public/uploads/    logo tim dan foto pemain hasil unggahan
```

Data turnamen dipasang otomatis pada database lama saat server dimulai. Format default adalah 4 grup × 3 tim; tim yang tersedia dibagi merata ke empat grup (maksimal 12 tim) dan slot sisanya menunggu tim baru. Operator dapat mengubah format menjadi 4 grup × 4 tim.

## Auto push ke GitHub

Repository ini menyertakan hook `.githooks/post-commit`. Setiap commit akan otomatis melakukan `git push origin main`, dengan log di `.git/auto-push.log`.

Aktifkan hook setelah clone di mesin baru:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-commit
```

Jika tidak ingin push otomatis, kosongkan kembali dengan `git config --unset core.hooksPath`.

## Catatan keamanan

PIN disimpan di environment, sesi admin memakai cookie HttpOnly bertanda tangan HMAC, dan login dibatasi 5 percobaan per 10 menit. Logo dan foto pemain dibatasi tipe gambar raster, ukuran, dan validasi signature file. Untuk produksi, jalankan di belakang HTTPS, ganti PIN default, dan backup `data/db.json` beserta `public/uploads/`.

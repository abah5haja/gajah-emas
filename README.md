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

- **Live score** — operator menambah skor, mencatat gol/kartu/pergantian, mengatur menit, menjeda jam, dan menutup pertandingan. Semua layar diperbarui otomatis lewat Server-Sent Events (SSE).
- **Turnamen fase grup** — halaman `/turnamen` menampilkan 4 grup dengan format 3 atau 4 tim per grup, klasemen lengkap (main, menang, seri, kalah, selisih gol, kartu, poin), penanda zona lolos, dan keterangan bahwa 2 tim teratas setiap grup maju ke babak 8 besar. Operator dapat membagi tim ke grup dan membuat jadwal round-robin otomatis.
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
2. Pilih pertandingan di tab **Kontrol live**.
3. Gunakan stepper skor untuk koreksi cepat, atau isi form kejadian untuk mencatat gol sekaligus menambah skor.
4. Atur status menjadi **Live** untuk memulai jam pertandingan, dan **Selesai** saat full time.
5. Tab **Tim & pemain** untuk menginput tim baru, logo, serta nama dan foto pemain di **Skuad awal**. Tambah pemain berikutnya lewat panel **Tambah pemain ke skuad**.
6. Di profil pemain, operator juga bisa **Upload foto**, **Ganti foto**, atau **Hapus foto**.
7. Tab **Turnamen** untuk mengatur nama/status/format grup, membagi tim ke Grup A–D, dan membuat jadwal round-robin. Klasemen grup otomatis dihitung dari pertandingan berstatus selesai.
8. Semua penonton menerima pembaruan tanpa refresh.

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

## Catatan keamanan

PIN disimpan di environment, sesi admin memakai cookie HttpOnly bertanda tangan HMAC, dan login dibatasi 5 percobaan per 10 menit. Logo dan foto pemain dibatasi tipe gambar raster, ukuran, dan validasi signature file. Untuk produksi, jalankan di belakang HTTPS, ganti PIN default, dan backup `data/db.json` beserta `public/uploads/`.

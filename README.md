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
- **Match center** — skor live, jalannya pertandingan, statistik duel, jadwal, hasil, dan arsip semua laga yang dikelompokkan per tanggal.
- **Tim & pemain** — operator bisa membuat tim baru lengkap dengan nama, kode, kota, warna, pelatih, markas, **logo**, dan daftar nama pemain sekaligus. Setiap baris **Skuad awal** punya tombol foto; pemain lain bisa ditambahkan kemudian lewat panel **Tambah pemain ke skuad**. Logo dan foto tampil di kartu tim, skor, arsip, roster, dan profil.
- **Pemain** — direktori dengan pencarian, filter tim, sorting, serta profil dan statistik individual. Foto pemain bisa diunggah saat menambah pemain atau langsung dari profil pemain (tombol admin **Upload foto/Ganti foto**) dan tampil bulat di direktori, roster, serta papan skor.
- **Mabar** — daftar sesi terbuka, join/leave tanpa akun, pembuatan sesi oleh pengunjung, progres slot, dan peserta.
- **Tema gelap/terang** — tombol di header, tersimpan di browser, dan langsung berlaku di semua halaman.
- **Operator** — login PIN, kontrol skor, pencatatan kejadian, pembuatan pertandingan/tim/pemain/mabar, serta penghapusan data.

## Alur operator

1. Buka `/admin` lalu masuk dengan PIN.
2. Pilih pertandingan di tab **Kontrol live**.
3. Gunakan stepper skor untuk koreksi cepat, atau isi form kejadian untuk mencatat gol sekaligus menambah skor.
4. Atur status menjadi **Live** untuk memulai jam pertandingan, dan **Selesai** saat full time.
5. Tab **Tim & pemain** untuk menginput tim baru, logo, serta nama dan foto pemain di **Skuad awal**. Tambah pemain berikutnya lewat panel **Tambah pemain ke skuad**.
6. Di profil pemain, operator juga bisa **Upload foto**, **Ganti foto**, atau **Hapus foto**.
7. Semua penonton menerima pembaruan tanpa refresh.

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
seed.js            data liga, pemain, jadwal, dan mabar demo
reset.js           penghapus data demo
public/index.html  shell aplikasi
public/app.js      router SPA, komponen, modal, realtime
public/styles.css  design system, responsive layout, tema gelap/terang
data/db.json       dibuat otomatis saat runtime
public/uploads/    logo tim hasil unggahan
```

## Catatan keamanan

PIN disimpan di environment, sesi admin memakai cookie HttpOnly bertanda tangan HMAC, dan login dibatasi 5 percobaan per 10 menit. Logo dan foto pemain dibatasi tipe gambar raster, ukuran, dan validasi signature file. Untuk produksi, jalankan di belakang HTTPS, ganti PIN default, dan backup `data/db.json` beserta `public/uploads/`.

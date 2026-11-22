'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'data', 'db.json');
const uploads = path.join(__dirname, 'public', 'uploads');
if (fs.existsSync(file)) {
  fs.rmSync(file);
  console.log('Data demo dihapus. Restart server agar data awal dibuat kembali.');
} else {
  console.log('Data demo sudah dalam kondisi awal.');
}
if (fs.existsSync(uploads)) {
  fs.rmSync(uploads, { recursive: true, force: true });
  console.log('Logo tim yang diunggah ikut dibersihkan.');
}

# Tethered Capture (Versi Browser) — Kamera HP via USB, tanpa install apa-apa di laptop

Versi ini jalan langsung di **Chrome/Edge** menggunakan **WebUSB**, tanpa perlu install Python
atau ADB terpisah di laptop. HP tetap perlu USB debugging aktif (satu kali setup), sama seperti
versi Python.

## Kenapa perlu di-deploy, tidak bisa dobel-klik file HTML?
WebUSB (fitur browser untuk akses perangkat USB) hanya berfungsi di halaman yang dibuka lewat
**HTTPS** atau **localhost** — tidak bisa langsung buka file HTML dari komputer (`file://`).
Solusi paling praktis: deploy ke **GitHub Pages** (gratis, otomatis dapat HTTPS). Setelah itu
kamu tinggal buka satu link di Chrome, tanpa install atau jalankan apa pun di laptop.

## Cara Deploy ke GitHub Pages

1. Buat repository baru di GitHub, misalnya `tethered-capture`.
2. Upload semua isi folder ini ke repo tersebut (lewat GitHub Desktop, `git push`, atau upload
   manual via web GitHub — semua file termasuk folder `.github`).
3. Di GitHub, buka repo → **Settings → Pages** → pada bagian **Build and deployment**, pilih
   source: **GitHub Actions**.
4. Push ke branch `main` (atau jalankan workflow secara manual dari tab **Actions**).
   Workflow (`.github/workflows/deploy.yml`) akan otomatis build project dan men-deploy ke
   GitHub Pages setiap kali kamu push.
5. Setelah selesai (cek tab **Actions** sampai centang hijau), buka:
   ```
   https://<username-github>.github.io/<nama-repo>/
   ```
   Contoh: `https://bayusetiadji07.github.io/tethered-capture/`

## Persiapan HP (sekali saja)
Sama seperti tethering ADB pada umumnya:
1. **Setelan → Tentang Ponsel**, ketuk **Nomor Build** 7x sampai muncul "Mode Pengembang aktif".
2. **Setelan → Opsi Pengembang**, aktifkan **USB Debugging**.
3. Sambungkan HP ke laptop via kabel USB, mode USB pilih **File Transfer (MTP)**.

## Cara Pakai
1. Buka aplikasi **Kamera** bawaan di HP, arahkan ke subjek.
2. Buka link GitHub Pages kamu di **Chrome atau Edge**.
3. Klik **"🔌 Sambungkan HP"** → pilih perangkat di dialog yang muncul dari Chrome →
   (mungkin muncul popup izin ADB di layar HP, tekan Allow).
4. Klik **"📁 Pilih Folder Tujuan"** → pilih folder di laptop tempat menyimpan foto.
5. Preview layar HP akan mulai muncul. Klik **"📸 AMBIL FOTO"** setiap kali mau memotret.
6. Foto otomatis tersimpan dengan nama urut (`foto_0001.jpg`, `foto_0002.jpg`, dst) — nomor
   lanjut otomatis kalau folder sudah ada isinya.

## Menjalankan secara lokal (opsional, untuk development)
```bash
npm install
npm run dev
```
Buka `http://localhost:5173` di Chrome (localhost dianggap "secure context" jadi WebUSB tetap jalan).

## Batasan
- Hanya jalan di **Chrome atau Edge** (Firefox & Safari belum mendukung WebUSB).
- Preview berbasis screenshot layar HP (±1 foto per detik), bukan video real-time — trade-off
  supaya bisa pakai kamera asli HP dengan resolusi penuh.
- `KEYCODE_CAMERA` (tombol shutter) bekerja di sebagian besar aplikasi Kamera bawaan (stock).
  Beberapa custom camera app mungkin tidak merespons perintah ini.
- Folder tujuan dipilih ulang setiap kali membuka halaman (browser tidak menyimpan akses folder
  secara permanen demi keamanan) — cukup klik "Pilih Folder Tujuan" lagi setelah refresh.
- Setelah izin USB diberikan sekali ke sebuah origin, Chrome biasanya mengingatnya untuk
  koneksi berikutnya (tidak perlu approve ulang setiap saat, kecuali kamu mencabut izinnya).

## Struktur Proyek
```
index.html          Halaman utama
src/main.ts          Logika koneksi ADB/WebUSB, preview, shutter, simpan file
src/style.css         Styling
src/webapis.d.ts      Deklarasi tipe TypeScript untuk WebUSB & File System Access API
vite.config.ts        Konfigurasi build (base path relatif untuk GitHub Pages)
.github/workflows/deploy.yml   Auto-deploy ke GitHub Pages saat push ke main
```

## Kredit
Aplikasi ini menggunakan [ya-webadb](https://github.com/yume-chan/ya-webadb) (paket
`@yume-chan/adb` dan sekelilingnya), implementasi protokol ADB murni JavaScript untuk browser.

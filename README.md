# Dashboard Kehadiran — UPT Puskesmas Sedau

Dashboard kehadiran pegawai puskesmas. Front-end statis, tanpa proses build, tanpa `npm install`.
Bisa langsung di-push ke GitHub dan di-deploy ke Vercel.

```
index.html
assets/
  config.js        ← SATU-SATUNYA file yang perlu diedit
  data-sample.js   ← data contoh: 54 pegawai, Juli 2026, dari lembar absen manual
  data.js          ← lapisan data: sample | sheets | supabase
  app.js           ← logika & grafik (SVG buatan sendiri, nol dependensi)
  style.css
sql/schema.sql     ← skema Supabase: tabel, RLS, audit trigger, view penyamaran
vercel.json
```

---

## Deploy dalam 5 menit

```bash
git init
git add .
git commit -m "Dashboard Kehadiran Puskesmas Sedau"
git branch -M main
git remote add origin https://github.com/<user>/dashboard-kehadiran.git
git push -u origin main
```

Lalu di Vercel: **Add New → Project → Import** repo tadi.

| Setelan Vercel | Nilai |
|---|---|
| Framework Preset | **Other** |
| Root Directory | `./` |
| Build Command | *(kosongkan)* |
| Output Directory | *(kosongkan)* |

Nama file **wajib** `index.html` di root. Setiap `git push` ke `main` otomatis deploy ulang.

Uji lokal (jangan buka `file://` — CORS akan memblokir):
```bash
python3 -m http.server 8000     # lalu buka http://localhost:8000
```

---

## Apakah perlu Supabase?

Tergantung satu hal: **apakah data diinput dari dalam aplikasi, atau dari luar.**

| | Mode `sheets` | Mode `supabase` |
|---|---|---|
| Input harian oleh PIC | Di Google Sheets, di luar aplikasi | Di dalam aplikasi |
| Login & role (4 role) | Tidak ada | Ada, dipaksa di level database |
| Audit trail anti-manipulasi | Tidak mungkin | Ada, lewat trigger `SECURITY DEFINER` |
| Kerahasiaan data sakit | **Sheet publik = bisa dibaca siapa saja** | Terkendali RLS |
| Biaya | Rp 0 | Rp 0 di free tier |
| Kerumitan | Sangat rendah | Sedang, sekali setup |

Spesifikasi Anda meminta empat hal yang **tidak bisa** dipenuhi mode `sheets`:
RBAC sungguhan, audit trail yang tidak bisa dipalsukan, QR verifikasi yang bisa dicek ulang,
dan ekspor terjadwal di sisi server. Ketiga hal pertama menuntut penegakan di sisi server.

Karena itu: **ya, Supabase diperlukan** — begitu input harian dipindahkan ke dalam aplikasi.
Selama input masih di Sheets dan kode `S` (sakit) tidak dipublikasikan, mode `sheets` masih layak
sebagai tahap transisi.

### Alur mode `supabase`

```
Browser (Vercel, statis)
   │  supabase-js + anon key
   ▼
Supabase Auth ──► JWT berisi user id
   │
   ▼
Postgres + Row Level Security
   ├─ pegawai            baca: semua role   tulis: administrator
   ├─ kehadiran          baca: semua role   tulis: administrator + pic_kehadiran
   │                     tanpa policy DELETE → baris tidak bisa dihapus, hanya diubah
   ├─ audit_log          baca: administrator + kepala
   │                     tulis: HANYA trigger, tidak bisa dari browser
   └─ kehadiran_tampil   view: menyamarkan alasan rinci untuk role staf
```

Tidak ada server aplikasi. Browser bicara langsung ke Postgres, dan **RLS-lah yang menjadi
lapisan otorisasi**. Anon key aman diletakkan di `config.js` justru karena setiap kebijakan
akses dipaksa di database, bukan di JavaScript. `service_role` key tidak boleh pernah masuk repo.

### Langkah setup

1. Buat project di [supabase.com](https://supabase.com) — pilih region **Singapore (ap-southeast-1)**.
2. **SQL Editor → New query** → tempel seluruh isi `sql/schema.sql` → Run.
3. **Authentication → Providers** → aktifkan Email, matikan "Enable email signups"
   (akun dibuat manual oleh administrator, bukan pendaftaran terbuka).
4. Tambah pengguna di **Authentication → Users**, lalu petakan role-nya:
   ```sql
   insert into profil (id, nama, role)
   values ('<uuid-dari-tabel-users>', 'Nama Lengkap', 'pic_kehadiran');
   ```
   Role yang tersedia: `administrator`, `pic_kehadiran`, `kepala`, `staf`.
5. Impor pegawai lewat **Table Editor → pegawai → Insert → Import data from CSV**.
6. Di `index.html`, hapus komentar pada baris `<script src=".../supabase-js@2...">`.
7. Di `assets/config.js`: `mode: 'supabase'`, lalu isi `url` dan `anonKey`.
8. Setiap pagi, PIC menekan tombol siapkan hari — atau jalankan otomatis lewat `pg_cron`:
   ```sql
   select cron.schedule('siapkan-apel', '0 22 * * *',   -- 22:00 UTC = 06:00 WITA
     $$ insert into kehadiran (pegawai_id, tanggal, shift, kode)
        select id, (now() at time zone 'Asia/Makassar')::date, 'PAGI', 'BELUM'
        from pegawai where aktif
        on conflict do nothing $$);
   ```
   Tanpa langkah ini, "belum diinput" tidak akan muncul sebagai baris eksplisit.

### Ekspor terjadwal (WhatsApp, tiap 15.00)

Butuh satu serverless function. Tambahkan `api/ekspor.js` di repo, lalu di `vercel.json`:

```json
"crons": [{ "path": "/api/ekspor", "schedule": "0 7 * * *" }]
```

Cron Vercel memakai **UTC**, jadi `0 7 * * *` = 15.00 WITA. Paket Hobby dibatasi
satu cron per hari — cukup untuk kebutuhan ini. Simpan `service_role` key sebagai
Environment Variable di Vercel (**bukan** di `config.js`), karena kode ini berjalan di server.

---

## Konfigurasi yang mengubah angka

Dua setelan di `config.js` langsung mengubah persentase yang tampil. Sadari konsekuensinya:

**1. Kategori kode `TAP`.** Saat ini `tidak_sah`, artinya TAP dihitung sebagai tidak hadir dan
tetap masuk penyebut. Kalau ternyata TAP adalah penugasan resmi (misalnya bertugas di apotek saat
apel), ubah menjadi `sah` — pegawai bersangkutan akan keluar dari penyebut. Definisi resmi TAP
belum ada di legenda form dan **perlu ditetapkan Kepala Puskesmas** sebelum angka ini dipakai.

**2. Status `aktif` pegawai.** Tiga pegawai pada data contoh (Ida Ayu Putu Widiani,
Wahyuni Kurniawati, Nurhayani Hasti) kosong di seluruh 19 hari kerja. Mereka sengaja dibiarkan
`aktif: true` agar muncul di panel "Belum diinput" dan ditindaklanjuti. Setelah statusnya jelas
(tugas belajar / cuti besar / mutasi), set `aktif: false` — mereka akan keluar dari penyebut
dan persentase melonjak naik. Jangan biarkan mereka tercatat sebagai tidak hadir 19 hari.

Karena itu dashboard **tidak pernah menampilkan satu angka kehadiran** selama masih ada sel
`BELUM`, melainkan rentang batas bawah–batas atas. Itu keputusan desain yang sengaja, bukan
kekurangan: satu angka tunggal di atas 19% data yang tidak diketahui akan menyesatkan.

---

## Catatan kepatuhan

- **Kode `S` (sakit) adalah data kesehatan** — data pribadi bersifat spesifik menurut
  UU No. 27/2022 Pasal 4 ayat (2). Untuk membuka data seluruh pegawai kepada role `staf`
  tanpa memaparkan riwayat sakit: set `samarkanAlasan: true` di `config.js` dan arahkan
  `data.js` ke view `kehadiran_tampil`. Staf tetap melihat semua pegawai, tetapi alasan
  ketidakhadiran tampil sebagai "Berizin". Yang justru perlu terlihat semua orang —
  `TK` dan `Belum diinput` — tetap terbuka.
- **Domisili data.** PP No. 71/2019 Pasal 20 mewajibkan penyelenggara sistem elektronik
  lingkup publik mengelola dan menyimpan data di wilayah Indonesia. Supabase managed terdekat
  ada di Singapura. Kalau ini dipersoalkan, opsinya: Supabase self-hosted atau PocketBase di
  VPS Indonesia (Biznet / IDCloudHost, sekitar Rp 100–200 rb/bulan). Perlu dikonfirmasi ke
  Dinas Kesehatan sebelum sistem dipakai resmi.
- **Jangan pernah** menaruh `service_role` key di file yang dikirim ke browser.

---

## Keterbatasan yang diketahui

- Mode `sample` dan `sheets` bersifat hanya-baca. Perubahan dropdown hanya tersimpan di memori
  browser dan hilang saat halaman dimuat ulang. Peringatan ini tampil di UI.
- Belum ada mode offline. Untuk kondisi koneksi tidak stabil, langkah berikutnya adalah
  antrean tulis di IndexedDB yang disinkronkan saat koneksi kembali.
- Baru shift `PAGI` yang dirender. Skema database sudah mendukung `SIANG` dan `MALAM`.
- QR verifikasi laporan belum diimplementasikan; butuh satu route publik `/verifikasi`.

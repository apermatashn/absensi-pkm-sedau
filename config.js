/* =====================================================================
   config.js — SATU-SATUNYA file yang perlu diedit untuk ganti sumber data
   =====================================================================
   MODE:
     'sample'   → data contoh yang sudah ditanam di assets/data-sample.js.
                  Tidak perlu backend apa pun. Dipakai untuk demo & uji tampilan.
     'sheets'   → baca dari Google Sheets publik (read-only, tanpa login).
                  Cocok kalau input tetap dilakukan manual di Sheets.
                  PERINGATAN: sheet publik = data bisa dibaca siapa saja.
                  Jangan pakai mode ini kalau kolom status memuat kode S (sakit),
                  karena itu data kesehatan (UU 27/2022 Pasal 4 ayat 2).
     'supabase' → Postgres + Auth + Row Level Security. Untuk multi-user,
                  input harian, audit trail, dan pembatasan akses sungguhan.
   ===================================================================== */

window.APP_CONFIG = {
  mode: 'sample',

  org: {
    nama: 'UPT Puskesmas Sedau',
    aplikasi: 'Dashboard Kehadiran',
    // Kalender kerja. Puskesmas Sedau: Senin–Sabtu masuk, Minggu libur.
    hariKerja: [1, 2, 3, 4, 5, 6],   // 0=Minggu ... 6=Sabtu
    hariLibur: []                    // 'YYYY-MM-DD' untuk libur nasional / cuti bersama
  },

  // Sembunyikan alasan rinci ketidakhadiran dari role 'staf'.
  // true  → staf melihat "Berizin" saja untuk S/I/C/TD/DS/F (rekomendasi kepatuhan)
  // false → staf melihat kode aslinya (transparansi penuh)
  samarkanAlasan: false,

  sheets: {
    sheetId: 'GANTI_DENGAN_SHEET_ID',   // ID dari URL /spreadsheets/d/<ID>/edit — BUKAN publish ID
    tabPegawai: 'Pegawai',
    tabKehadiran: 'Kehadiran'
  },

  supabase: {
    url: 'https://GANTI.supabase.co',
    anonKey: 'GANTI_ANON_KEY'          // Anon key aman di front-end SELAMA RLS aktif
  }
};

/* Kamus kode status. Tambah kode baru di sini saja — UI, warna, legenda,
   dan denominator ikut menyesuaikan otomatis.
   kategori:
     'hadir'     → masuk pembilang % kehadiran
     'sah'       → ketidakhadiran sesuai prosedur, DIKELUARKAN dari penyebut
     'tidak_sah' → tidak hadir tanpa dasar, masuk penyebut sebagai tidak hadir
     'belum'     → belum ada data. Bukan tidak hadir. Bikin hasil jadi rentang. */
window.KODE_STATUS = {
  H:     { nama: 'Hadir',               kategori: 'hadir',     warna: '#16A085' },
  TAP:   { nama: 'Tidak apel pagi',     kategori: 'tidak_sah', warna: '#FF8A00' },
  S:     { nama: 'Sakit',               kategori: 'sah',       warna: '#C0473E', sensitif: true },
  I:     { nama: 'Izin',                kategori: 'sah',       warna: '#2F7DC4' },
  C:     { nama: 'Cuti',                kategori: 'sah',       warna: '#7E6BE6' },
  IA:    { nama: 'Izin apel',           kategori: 'sah',       warna: '#C6E72E' },
  F:     { nama: 'Fakultatif',          kategori: 'sah',       warna: '#E9E6D6' },
  TD:    { nama: 'Tugas dinas',         kategori: 'sah',       warna: '#0F4C4B' },
  DS:    { nama: 'Dispensasi sekolah',  kategori: 'sah',       warna: '#2E2A24' },
  TK:    { nama: 'Tanpa keterangan',    kategori: 'tidak_sah', warna: '#6B6154' },
  BELUM: { nama: 'Belum diinput',       kategori: 'belum',     warna: 'transparent' }
};

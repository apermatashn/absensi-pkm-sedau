/* =====================================================================
   config.js — SATU-SATUNYA file yang perlu diedit untuk ganti sumber data
   =====================================================================
   MODE:
     'sample'   -> data contoh yang ditanam di assets/data-sample.js.
                   Tidak perlu backend. Untuk demo dan uji tampilan.
     'sheets'   -> baca dari Google Sheets publik (read-only, tanpa login).
                   PERINGATAN: sheet publik bisa dibaca siapa saja. Jangan pakai
                   kalau kolom status memuat kode S (sakit) - itu data kesehatan
                   menurut UU 27/2022 Pasal 4 ayat (2).
     'supabase' -> Postgres + Auth + Row Level Security. Untuk multi-user,
                   input harian, audit trail, dan pembatasan akses sungguhan.
   ===================================================================== */

window.APP_CONFIG = {
  mode: 'sample',

  org: {
    nama: 'Puskesmas Sedau',
    namaPanjang: 'UPT Puskesmas Sedau',
    kabupaten: 'Kabupaten Lombok Barat',
    aplikasi: 'Dashboard Kehadiran',
    logo: 'assets/logo.png',
    hariKerja: [1, 2, 3, 4, 5, 6],   // 0=Minggu ... 6=Sabtu
    hariLibur: []                    // 'YYYY-MM-DD' untuk libur nasional / cuti bersama
  },

  /* ---------------------------------------------------------------------
     LOGIN - HANYA UNTUK PROTOTIPE
     ---------------------------------------------------------------------
     Password di bawah ini ada di dalam file JavaScript yang dikirim ke
     browser. Siapa pun bisa membukanya lewat View Source atau DevTools.
     Ini BUKAN autentikasi - hanya pemilih peran untuk keperluan demo.

     Sebelum data pegawai yang sebenarnya masuk, ganti dengan Supabase Auth
     (mode: 'supabase'). Lihat README bagian "Login".
     --------------------------------------------------------------------- */
  loginPrototipe: true,

  peran: {
    administrator: {
      label: 'Administrator', sandi: '123#',
      deskripsi: 'Mengelola seluruh sistem dan data master.',
      lihatAlasan: true, lihatAudit: true, shiftBoleh: ['PAGI', 'SIANG', 'MALAM']
    },
    pic_kehadiran: {
      label: 'PIC Kehadiran', sandi: '456#',
      deskripsi: 'Menginput absensi apel pagi dan seluruh shift.',
      lihatAlasan: true, lihatAudit: false, shiftBoleh: ['PAGI', 'SIANG', 'MALAM']
    },
    pic_shift: {
      label: 'PIC Shift', sandi: '789#',
      deskripsi: 'Menginput absensi shift siang dan malam serta jadwal shift.',
      lihatAlasan: true, lihatAudit: false, shiftBoleh: ['SIANG', 'MALAM']
    },
    kepala: {
      label: 'Kepala Puskesmas', sandi: '987#',
      deskripsi: 'Melihat data dan mengunduh laporan resmi.',
      lihatAlasan: true, lihatAudit: true, shiftBoleh: []
    },
    staf: {
      label: 'Staf', sandi: '654#',
      deskripsi: 'Melihat data kehadiran seluruh pegawai.',
      lihatAlasan: true, lihatAudit: false, shiftBoleh: []
    }
  },

  // Sembunyikan alasan rinci ketidakhadiran dari role yang lihatAlasan = false.
  // true  -> tampil "Berizin" untuk S/I/C/TD/DS/F (rekomendasi kepatuhan)
  // false -> tampil kode aslinya (transparansi penuh)
  samarkanAlasan: false,

  shift: {
    PAGI:  { label: 'Apel pagi',   jam: '07:30' },
    SIANG: { label: 'Piket siang', jam: '14:00' },
    MALAM: { label: 'Piket malam', jam: '21:00' }
  },

  sheets: {
    sheetId: 'GANTI_DENGAN_SHEET_ID',
    tabPegawai: 'Pegawai',
    tabKehadiran: 'Kehadiran'
  },

  supabase: {
    url: 'https://GANTI.supabase.co',
    anonKey: 'GANTI_ANON_KEY'
  }
};

/* Kamus kode status. Tambah kode baru di sini saja - UI, warna, legenda,
   dan denominator ikut menyesuaikan otomatis.
   kategori:
     'hadir'     -> masuk pembilang % kehadiran
     'sah'       -> ketidakhadiran sesuai prosedur, DIKELUARKAN dari penyebut
     'tidak_sah' -> tidak hadir tanpa dasar, masuk penyebut sebagai tidak hadir
     'belum'     -> belum ada data. Bukan tidak hadir. Membuat hasil jadi rentang. */
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

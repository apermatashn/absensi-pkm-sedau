/* =====================================================================
   session.js — dipakai bersama oleh index.html (login) dan dashboard.html
   ---------------------------------------------------------------------
   CATATAN PENTING
   Selama mode masih 'sample' atau 'sheets', ini BUKAN keamanan.
   Penjaga halaman di bawah hanya mengalihkan pengguna yang belum memilih
   peran — bukan mencegah akses. Berkas data tetap bisa diambil langsung
   lewat URL, dan siapa pun bisa menulis sesi palsu dari DevTools.
   Keamanan sungguhan baru ada di mode 'supabase', di mana pembatasan
   dijalankan oleh Row Level Security di database.
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'dk-sesi';

  window.Sesi = {
    key: KEY,

    /** Baca sesi aktif. null kalau belum login atau perannya tidak dikenal. */
    baca: function () {
      try {
        var a = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
        if (!a) return null;
        var s = JSON.parse(a);
        if (!s || !s.role || !window.APP_CONFIG.peran[s.role]) return null;
        return s;
      } catch (e) { return null; }
    },

    /** Simpan sesi. ingat=true -> localStorage (bertahan), false -> sessionStorage. */
    tulis: function (s, ingat) {
      try {
        var v = JSON.stringify(s);
        if (ingat) { localStorage.setItem(KEY, v); sessionStorage.removeItem(KEY); }
        else { sessionStorage.setItem(KEY, v); localStorage.removeItem(KEY); }
      } catch (e) { /* penyimpanan diblokir browser */ }
    },

    hapus: function () {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
    },

    /** Terapkan tema & lebar sidebar sebelum halaman tampil, cegah kedip. */
    tema: function () {
      try {
        document.documentElement.dataset.theme = localStorage.getItem('dk-theme') || 'light';
        document.documentElement.dataset.side = localStorage.getItem('dk-side') || 'full';
      } catch (e) { document.documentElement.dataset.theme = 'light'; }
    },

    /** Halaman awal sesuai peran. */
    mulaiDi: function (role) {
      var p = window.APP_CONFIG.peran[role];
      return (p && p.mulaiDi) || 'dashboard';
    },

    keLogin: function () { location.replace('index.html'); },
    keDashboard: function (role) {
      location.replace('dashboard.html#' + window.Sesi.mulaiDi(role));
    }
  };
})();

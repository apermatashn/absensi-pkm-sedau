/* =====================================================================
   login.js — halaman masuk (index.html)
   Setelah peran & password benar, sesi disimpan lalu dialihkan ke
   dashboard.html pada tampilan awal yang sesuai peran.
   ===================================================================== */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG;
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isi() {
    $('#inPeran').innerHTML = '<option value="">-- Pilih Peran --</option>' +
      Object.keys(CFG.peran).map(function (k) {
        return '<option value="' + k + '">' + esc(CFG.peran[k].label) + '</option>';
      }).join('');
    $('#loginJudul').innerHTML = esc(CFG.org.aplikasi) + '<br>' + esc(CFG.org.nama);
    $('#loginKab').textContent = CFG.org.kabupaten;
    $('#loginLogo').src = CFG.org.logo;
    $('#loginLogo').alt = 'Logo ' + CFG.org.nama;
    $('#loginFoot').textContent = '© ' + new Date().getFullYear() + ' ' + CFG.org.pemilik + '. All rights reserved.';
    document.title = 'Masuk — ' + CFG.org.aplikasi;
  }

  function pesan(txt) {
    var e = $('#loginErr');
    e.textContent = txt; e.hidden = false;
  }

  function masuk() {
    var role = $('#inPeran').value, sandi = $('#inSandi').value;
    if (!role) { pesan('Pilih peran terlebih dahulu.'); $('#inPeran').focus(); return; }
    if (!sandi) { pesan('Masukkan password.'); $('#inSandi').focus(); return; }
    if (CFG.peran[role].sandi !== sandi) {
      pesan('Password salah untuk peran ' + CFG.peran[role].label + '.');
      $('#inSandi').select(); return;
    }
    $('#loginErr').hidden = true;
    var btn = $('#btnMasuk');
    btn.disabled = true; btn.textContent = 'Mengalihkan…';
    window.Sesi.tulis({ role: role, nama: CFG.peran[role].label, pegawai_id: null, pada: Date.now() },
                      $('#inIngat').checked);
    window.Sesi.keDashboard(role);
  }

  function boot() {
    isi();
    $('#btnMasuk').addEventListener('click', masuk);
    $('#inSandi').addEventListener('keydown', function (e) { if (e.key === 'Enter') masuk(); });
    $('#inPeran').addEventListener('change', function () {
      $('#loginErr').hidden = true;
      if ($('#inPeran').value) $('#inSandi').focus();
    });
    $('#btnMata').addEventListener('click', function () {
      var i = $('#inSandi');
      i.type = i.type === 'password' ? 'text' : 'password';
      $('#btnMata').setAttribute('aria-label',
        i.type === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
      i.focus();
    });
    $('#btnLupa').addEventListener('click', function () {
      pesan(CFG.loginPrototipe
        ? 'Mode prototipe: password diatur di assets/config.js. Hubungi administrator sistem.'
        : 'Hubungi administrator untuk pengaturan ulang password.');
    });
    $('#inPeran').focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

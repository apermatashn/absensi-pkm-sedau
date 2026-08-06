/* =====================================================================
   data.js — lapisan data. Satu antarmuka, tiga sumber.
   Semua fungsi mengembalikan Promise dan bentuk data yang sama, jadi
   app.js tidak perlu tahu sumbernya apa.

   Bentuk kanonik:
     pegawai   : { id, nip, nama, golongan, jabatan, kelompok, aktif }
     kehadiran : { pegawai_id, tanggal:'YYYY-MM-DD', shift, kode }
   ===================================================================== */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG;

  function err(msg) { return new Error('[data] ' + msg); }

  /* ---------- CSV parser (menangani kutip & pemisah ; atau ,) ---------- */
  function parseCSV(text) {
    var sep = (text.split('\n')[0].match(/;/g) || []).length >
              (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    return rows.slice(1).filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); })
      .map(function (r) {
        var o = {};
        head.forEach(function (h, j) { o[h] = (r[j] || '').trim(); });
        return o;
      });
  }

  /* ================= MODE: sample ================= */
  var sampleStore = null;
  function sampleLoad() {
    if (!window.SAMPLE_DATA) throw err('assets/data-sample.js belum dimuat.');
    if (!sampleStore) {
      sampleStore = {
        pegawai: window.SAMPLE_DATA.pegawai.map(function (p) { return Object.assign({}, p); }),
        kehadiran: window.SAMPLE_DATA.kehadiran.map(function (k) {
          return { pegawai_id: k[0], tanggal: k[1], shift: k[2], kode: k[3] };
        })
      };
    }
    return sampleStore;
  }

  /* ================= MODE: sheets ================= */
  function gvizUrl(sheetId, tab) {
    return 'https://docs.google.com/spreadsheets/d/' + sheetId +
           '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab);
  }
  function fetchSheet(tab) {
    var id = CFG.sheets.sheetId;
    if (!id || id.indexOf('GANTI') === 0) throw err('sheets.sheetId belum diisi di config.js');
    return fetch(gvizUrl(id, tab)).then(function (r) {
      if (!r.ok) throw err('Gagal membaca tab "' + tab + '" (HTTP ' + r.status + '). Pastikan Sheet dibagikan publik.');
      return r.text();
    }).then(parseCSV);
  }

  /* ================= MODE: supabase ================= */
  var sb = null;
  function sbClient() {
    if (sb) return sb;
    if (!window.supabase) throw err('supabase-js belum dimuat. Tambahkan <script src> di index.html.');
    var c = CFG.supabase;
    if (!c.url || c.url.indexOf('GANTI') > -1) throw err('supabase.url / anonKey belum diisi di config.js');
    sb = window.supabase.createClient(c.url, c.anonKey);
    return sb;
  }

  /* ================= API publik ================= */
  var API = {
    mode: CFG.mode,

    /** Ambil daftar pegawai. */
    pegawai: function () {
      if (CFG.mode === 'sample') return Promise.resolve(sampleLoad().pegawai);
      if (CFG.mode === 'sheets') {
        return fetchSheet(CFG.sheets.tabPegawai).then(function (rows) {
          return rows.map(function (r, i) {
            return {
              id: r.id ? Number(r.id) : i + 1,
              nip: r.nip || null, nama: r.nama || '(tanpa nama)',
              golongan: r.golongan || r.gol || null, jabatan: r.jabatan || null,
              kelompok: r.kelompok || 'Lainnya',
              aktif: String(r.aktif || 'true').toLowerCase() !== 'false'
            };
          });
        });
      }
      return sbClient().from('pegawai').select('*').eq('aktif', true).order('kelompok').order('nama')
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    /** Ambil kehadiran dalam rentang tanggal (inklusif). */
    kehadiran: function (dari, sampai) {
      if (CFG.mode === 'sample') {
        return Promise.resolve(sampleLoad().kehadiran.filter(function (k) {
          return k.tanggal >= dari && k.tanggal <= sampai;
        }));
      }
      if (CFG.mode === 'sheets') {
        return fetchSheet(CFG.sheets.tabKehadiran).then(function (rows) {
          return rows.map(function (r) {
            return {
              pegawai_id: Number(r.pegawai_id || r.id),
              tanggal: (r.tanggal || '').slice(0, 10),
              shift: r.shift || 'PAGI',
              kode: (r.kode || r.status || 'BELUM').toUpperCase()
            };
          }).filter(function (k) { return k.tanggal >= dari && k.tanggal <= sampai; });
        });
      }
      return sbClient().from('kehadiran').select('pegawai_id,tanggal,shift,kode')
        .gte('tanggal', dari).lte('tanggal', sampai)
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    /** Simpan satu sel kehadiran. Hanya berfungsi di mode supabase. */
    simpan: function (pegawai_id, tanggal, shift, kode) {
      if (CFG.mode !== 'supabase') {
        var st = sampleLoad();
        var hit = st.kehadiran.filter(function (k) {
          return k.pegawai_id === pegawai_id && k.tanggal === tanggal && k.shift === shift;
        })[0];
        if (hit) hit.kode = kode;
        else st.kehadiran.push({ pegawai_id: pegawai_id, tanggal: tanggal, shift: shift, kode: kode });
        return Promise.resolve({ lokal: true });
      }
      return sbClient().from('kehadiran')
        .upsert({ pegawai_id: pegawai_id, tanggal: tanggal, shift: shift, kode: kode },
                { onConflict: 'pegawai_id,tanggal,shift' })
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    /** Role pengguna aktif. Di mode non-supabase selalu 'administrator' (demo). */
    sesi: function () {
      if (CFG.mode !== 'supabase') {
        return Promise.resolve({ nama: 'Mode demo', role: 'administrator', pegawai_id: null, demo: true });
      }
      var c = sbClient();
      return c.auth.getUser().then(function (u) {
        if (!u.data || !u.data.user) return null;
        return c.from('profil').select('nama,role,pegawai_id').eq('id', u.data.user.id).single()
          .then(function (res) {
            if (res.error) throw res.error;
            return Object.assign({ email: u.data.user.email }, res.data);
          });
      });
    },

    /** Audit trail — hanya tersedia di mode supabase. */
    audit: function (limit) {
      if (CFG.mode !== 'supabase') return Promise.resolve(null);
      return sbClient().from('audit_log').select('*').order('pada', { ascending: false })
        .limit(limit || 30)
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    }
  };

  window.DataAPI = API;
})();

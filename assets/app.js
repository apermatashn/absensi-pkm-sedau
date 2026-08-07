/* =====================================================================
   app.js — logika Dashboard Kehadiran
   Tanpa dependensi saat memuat halaman. SheetJS dimuat hanya saat
   tombol Unduh ditekan, supaya halaman tetap ringan di koneksi lambat.
   ===================================================================== */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG, KODE = window.KODE_STATUS, API = window.DataAPI;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var HARI_S = ['Mgg', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
               'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var REKAP_URUT = ['H', 'S', 'I', 'C', 'F', 'IA', 'TK', 'TD', 'DS', 'TAP', 'BELUM'];
  var GRUP = [
    { kel: 'ASN',               sheet: '01_ASN',        judul: 'A. PNS / ASN' },
    { kel: 'PPPK Penuh Waktu',  sheet: '02_PPPK_Penuh', judul: 'B. PPPK Penuh Waktu' },
    { kel: 'PPPK Paruh Waktu',  sheet: '03_PPPK_Paruh', judul: 'C. PPPK Paruh Waktu' },
    { kel: 'Non-ASN',           sheet: '04_NonASN',     judul: 'D. Non-ASN / Kontrak' }
  ];

  var S = {
    pegawai: [], kehadiran: [], map: {}, sesi: null,
    tanggal: null, bulan: null, shift: 'PAGI',
    cari: '', kelompok: '', sort: { k: 'no', dir: 'asc' }, notif: []
  };

  /* ---------- util ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isKerja(s) {
    if (CFG.org.hariLibur.indexOf(s) > -1) return false;
    return CFG.org.hariKerja.indexOf(parse(s).getDay()) > -1;
  }
  function labelTanggal(s) {
    var d = parse(s);
    return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }
  function labelBulan(b) { return BULAN[+b.slice(5, 7) - 1] + ' ' + b.slice(0, 4); }
  function hariBulan(y, m) { return new Date(y, m + 1, 0).getDate(); }
  var pct = function (v) { return v === null ? '–' : (v * 100).toFixed(1) + '%'; };

  var tt;
  function toast(msg, bad) {
    clearTimeout(tt);
    var el = $('#toast');
    el.textContent = msg;
    el.style.background = bad ? '#C0473E' : '#0F4C4B';
    el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)';
    tt = setTimeout(function () {
      el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(8px)';
    }, 3000);
  }

  /* ---------- hak akses ---------- */
  function peran() { return (CFG.peran[S.sesi && S.sesi.role]) || CFG.peran.staf; }
  function bolehLihatAlasan() { return !CFG.samarkanAlasan || peran().lihatAlasan; }
  function shiftBoleh() { return peran().shiftBoleh || []; }
  function bolehInput(shift) { return shiftBoleh().indexOf(shift || S.shift) > -1; }
  function tampilKode(kode, pid) {
    if (bolehLihatAlasan()) return kode;
    if (S.sesi && S.sesi.pegawai_id && S.sesi.pegawai_id === pid) return kode;
    var k = KODE[kode];
    return (k && k.kategori === 'sah') ? 'BERIZIN' : kode;
  }

  /* ---------- indeks ---------- */
  function bangunMap() {
    _kosongCache = { key: null, set: null };
    S.map = {};
    S.kehadiran.forEach(function (k) { S.map[k.pegawai_id + '|' + k.tanggal + '|' + (k.shift || 'PAGI')] = k.kode; });
  }
  /* Hari kerja yang NOL catatan di seluruh pegawai = belum ada pencatatan,
     bukan "semua tidak hadir". Dikeluarkan dari denominator dan ditampilkan
     terpisah, supaya tidak diam-diam dianggap absen maupun diam-diam diabaikan. */
  var _kosongCache = { key: null, set: null };
  function hariKosong(bulan, shift) {
    var key = bulan + '|' + shift;
    if (_kosongCache.key === key) return _kosongCache.set;
    var y = +bulan.slice(0, 4), m = +bulan.slice(5, 7) - 1, n = hariBulan(y, m);
    var ada = {};
    S.kehadiran.forEach(function (k) {
      if ((k.shift || 'PAGI') === shift && k.tanggal.indexOf(bulan) === 0 && k.kode && k.kode !== 'BELUM') ada[k.tanggal] = 1;
    });
    var set = {};
    for (var d = 1; d <= n; d++) {
      var t = bulan + '-' + String(d).padStart(2, '0');
      if (isKerja(t) && !ada[t]) set[t] = 1;
    }
    _kosongCache = { key: key, set: set };
    return set;
  }
  function belumTercatat(tgl) { return !!hariKosong(tgl.slice(0, 7), S.shift)[tgl]; }

  function kodeDi(pid, tgl, shift) {
    var v = S.map[pid + '|' + tgl + '|' + (shift || S.shift)];
    if (v) return v;
    if (!isKerja(tgl)) return null;
    if (belumTercatat(tgl)) return null;
    return 'BELUM';
  }
  function pegawaiAktif() {
    return S.pegawai.filter(function (p) {
      if (p.aktif === false) return false;
      if (S.kelompok && p.kelompok !== S.kelompok) return false;
      if (S.cari) {
        var q = S.cari.toLowerCase();
        if ((p.nama || '').toLowerCase().indexOf(q) < 0 && String(p.nip || '').indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* ---------- hitung ---------- */
  function ringkas(tgl, list) {
    var c = {}; Object.keys(KODE).forEach(function (k) { c[k] = 0; });
    list.forEach(function (p) { var k = kodeDi(p.id, tgl); if (k && c[k] !== undefined) c[k]++; });
    var sah = 0, tidakSah = 0;
    Object.keys(KODE).forEach(function (k) {
      if (KODE[k].kategori === 'sah') sah += c[k];
      if (KODE[k].kategori === 'tidak_sah') tidakSah += c[k];
    });
    var wajib = list.length - sah;
    return {
      c: c, total: list.length, sah: sah, tidakSah: tidakSah, belum: c.BELUM, wajib: wajib, hadir: c.H,
      bawah: wajib > 0 ? c.H / wajib : null,
      atas: wajib > 0 ? (c.H + c.BELUM) / wajib : null
    };
  }
  function rekapPegawai(pid, bulan) {
    var r = {}; REKAP_URUT.forEach(function (k) { r[k] = 0; });
    var y = +bulan.slice(0, 4), m = +bulan.slice(5, 7) - 1, n = hariBulan(y, m);
    var kosong = hariKosong(bulan, S.shift);
    for (var d = 1; d <= n; d++) {
      var s = bulan + '-' + String(d).padStart(2, '0');
      if (!isKerja(s) || kosong[s]) continue;
      var k = S.map[pid + '|' + s + '|' + S.shift];
      if (k === undefined) k = 'BELUM';
      if (r[k] !== undefined) r[k]++;
    }
    var wajib = r.H + r.TK + r.TAP + r.BELUM;
    r.wajib = wajib;
    r.bawah = wajib ? r.H / wajib : null;
    r.atas = wajib ? (r.H + r.BELUM) / wajib : null;
    return r;
  }

  /* ================= NOTIFIKASI ================= */
  var NKEY = 'dk-notif';
  function notifMuat() {
    try { S.notif = JSON.parse(localStorage.getItem(NKEY) || '[]'); } catch (e) { S.notif = []; }
  }
  function notifSimpan() {
    try { localStorage.setItem(NKEY, JSON.stringify(S.notif.slice(0, 120))); } catch (e) { /* kuota penuh */ }
  }
  function notifTambah(n) {
    S.notif.unshift(Object.assign({ ts: Date.now(), baca: false }, n));
    notifSimpan(); notifRender();
  }
  function waktuRelatif(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    var d = new Date(ts);
    return d.getDate() + ' ' + BULAN[d.getMonth()].slice(0, 3) + ' ' +
      String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
  }
  function notifRender() {
    var belum = S.notif.filter(function (n) { return !n.baca; }).length;
    $('#notifBadge').hidden = belum === 0;
    var host = $('#notifList');
    if (!S.notif.length) {
      host.innerHTML = '<p class="empty">Belum ada aktivitas. Setiap perubahan status kehadiran akan tercatat di sini.</p>';
    } else {
      host.innerHTML = S.notif.slice(0, 60).map(function (n) {
        var w = KODE[n.ke] ? KODE[n.ke].warna : '#6B6154';
        if (w === 'transparent') w = '#6B6154';
        return '<div class="nitem' + (n.baca ? '' : ' unread') + '">' +
          '<span class="nicon" style="background:' + w + '">' +
          '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>' +
          '<span class="nbody"><b>' + esc(n.aktor) + '</b> mengubah <b>' + esc(n.pegawai) + '</b> ' +
          'pada ' + esc(n.tglLabel) + ' (' + esc(n.shift) + ') dari <b>' + esc(n.dari) + '</b> ke <b>' + esc(n.ke) + '</b>' +
          '<span class="ntime">' + waktuRelatif(n.ts) + '</span></span></div>';
      }).join('');
    }
    $('#notifFoot').innerHTML = API.mode === 'supabase'
      ? 'Diambil dari audit trail di database.'
      : 'Mode <b>' + API.mode + '</b>: notifikasi tersimpan di browser ini saja, bukan lintas pengguna. ' +
        'Di mode supabase, sumbernya audit trail database.';
  }
  function notifDariAudit() {
    if (API.mode !== 'supabase') return;
    API.audit(40).then(function (rows) {
      if (!rows) return;
      S.notif = rows.map(function (a) {
        var lama = a.nilai_lama || {}, baru = a.nilai_baru || {};
        var p = S.pegawai.filter(function (x) { return String(x.id) === String(baru.pegawai_id || lama.pegawai_id); })[0];
        return {
          ts: new Date(a.pada).getTime(), baca: true,
          aktor: (CFG.peran[a.role] ? CFG.peran[a.role].label : (a.oleh_nama || a.role || 'Sistem')),
          pegawai: p ? p.nama : (a.tabel === 'pegawai' ? (baru.nama || lama.nama || '—') : '—'),
          tglLabel: baru.tanggal || lama.tanggal || '—',
          shift: baru.shift || lama.shift || '—',
          dari: lama.kode || '—', ke: baru.kode || '—'
        };
      });
      notifRender();
    }).catch(function () { /* diamkan: notifikasi bukan fitur kritis */ });
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    var tgl = S.tanggal, list = pegawaiAktif(), r = ringkas(tgl, list);
    $('#tglLabel').textContent = labelTanggal(tgl);

    var bn = $('#banner');
    if (!isKerja(tgl)) {
      bn.hidden = false;
      $('#bannerTxt').innerHTML = '<b>' + labelTanggal(tgl) + '</b> bukan hari kerja menurut kalender di config.js.';
    } else if (belumTercatat(tgl)) {
      bn.hidden = false;
      $('#bannerTxt').innerHTML = '<b>Belum ada pencatatan untuk ' + labelTanggal(tgl) + '.</b> ' +
        'Tidak satu pun pegawai terisi pada shift ' + esc((CFG.shift[S.shift] || {}).label) + '. ' +
        'Ini dibaca sebagai hari yang belum diinput, bukan sebagai seluruh pegawai tidak hadir — ' +
        'karena itu tanggal ini tidak dihitung dalam persentase mana pun.';
    } else if (r.belum > 0) {
      bn.hidden = false;
      $('#bannerTxt').innerHTML = '<b>' + r.belum + ' dari ' + r.wajib + ' pegawai belum diinput.</b> ' +
        'Selama belum ditutup, kehadiran hari ini hanya bisa dinyatakan sebagai rentang <b>' +
        pct(r.bawah) + ' – ' + pct(r.atas) + '</b>, bukan satu angka. Belum diinput bukan berarti tidak hadir.';
    } else bn.hidden = true;

    var hadirTxt = (r.bawah !== null && r.bawah === r.atas) ? pct(r.bawah) : pct(r.bawah) + ' – ' + pct(r.atas);
    var p = function (v) { return r.total ? (v / r.total * 100).toFixed(1) + '%' : '0%'; };
    var K = [
      ['', 'Total pegawai', r.total, 'orang'],
      ['k-h', 'Hadir', r.c.H, hadirTxt],
      ['k-b', 'Belum diinput', r.belum, p(r.belum)],
      ['k-t', 'TAP', r.c.TAP, p(r.c.TAP)],
      ['k-s', 'Sakit', r.c.S, p(r.c.S)],
      ['k-i', 'Izin', r.c.I, p(r.c.I)],
      ['k-d', 'Tugas dinas', r.c.TD, p(r.c.TD)],
      ['k-c', 'Cuti', r.c.C, p(r.c.C)]
    ];
    $('#kpis').innerHTML = K.map(function (k) {
      return '<div class="kpi ' + k[0] + '"><span>' + k[1] + '</span><b>' + k[2] + '</b><i>' + k[3] + '</i></div>';
    }).join('');

    renderDonut(r);
    renderTapBulan();
    renderBelum(tgl, list);
    renderTapTop();
  }

  function renderDonut(r) {
    var urut = Object.keys(KODE).filter(function (k) { return r.c[k] > 0; });
    if (!urut.length) { $('#chDonut').innerHTML = '<p class="empty">Tidak ada data pada tanggal ini.</p>'; return; }
    var tot = urut.reduce(function (a, k) { return a + r.c[k]; }, 0);
    var off = 25, arcs = '', leg = '';
    urut.forEach(function (k) {
      var v = r.c[k] / tot * 100;
      var w = KODE[k].warna === 'transparent' ? '#6B6154' : KODE[k].warna;
      var nm = (!bolehLihatAlasan() && KODE[k].kategori === 'sah') ? 'Berizin' : KODE[k].nama;
      arcs += '<circle class="arc" cx="21" cy="21" r="15.9" fill="none" stroke="' + w + '" stroke-width="5" ' +
        'stroke-dasharray="' + v.toFixed(2) + ' ' + (100 - v).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" ' +
        'data-nm="' + esc(nm) + '" data-n="' + r.c[k] + '" data-p="' + v.toFixed(1) + '" ' +
        'tabindex="0" role="img" aria-label="' + esc(nm) + ': ' + r.c[k] + ' orang, ' + v.toFixed(1) + ' persen"/>';
      off -= v;
      leg += '<em data-nm="' + esc(nm) + '"><span class="dot" style="background:' + w + '"></span>' + nm + '</em>';
    });
    $('#chDonut').innerHTML =
      '<div class="donutbox">' +
        '<svg class="donut" viewBox="0 0 42 42" role="group" aria-label="Diagram donat distribusi kehadiran">' +
          '<circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--line)" stroke-width="5"/>' + arcs +
        '</svg>' +
        '<div class="donuttip" id="donutTip" hidden></div>' +
        '<div class="donutctr" id="donutCtr"><b>' + tot + '</b><span>pegawai</span></div>' +
      '</div>' +
      '<div class="donutlegend">' + leg + '</div>';

    var tip = $('#donutTip'), ctr = $('#donutCtr'), box = $('.donutbox');
    function tampil(el) {
      tip.innerHTML = '<b>' + el.dataset.nm + '</b><span>' + el.dataset.n + ' (' + el.dataset.p + '%)</span>';
      tip.hidden = false; ctr.style.opacity = '0';
      $$('.donutlegend em').forEach(function (e) {
        e.classList.toggle('dim', e.dataset.nm !== el.dataset.nm);
      });
    }
    function sembunyi() {
      tip.hidden = true; ctr.style.opacity = '1';
      $$('.donutlegend em').forEach(function (e) { e.classList.remove('dim'); });
    }
    $$('#chDonut .arc').forEach(function (el) {
      el.addEventListener('mouseenter', function () { tampil(el); });
      el.addEventListener('focus', function () { tampil(el); });
      el.addEventListener('blur', sembunyi);
      el.addEventListener('mousemove', function (ev) {
        var b = box.getBoundingClientRect();
        tip.style.left = Math.max(4, Math.min(b.width - 4, ev.clientX - b.left)) + 'px';
        tip.style.top = (ev.clientY - b.top - 12) + 'px';
      });
    });
    box.addEventListener('mouseleave', sembunyi);
  }

  /* Langkah sumbu Y yang "bulat": 1, 2, 5, 10, 20, 50, ... */
  function langkahBagus(kasar) {
    if (kasar <= 0) return 1;
    var p10 = Math.pow(10, Math.floor(Math.log(kasar) / Math.LN10));
    var r = kasar / p10;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p10;
  }

  function renderTapBulan() {
    var thn = S.bulan.slice(0, 4);
    var blnAktif = +S.bulan.slice(5, 7) - 1;
    $('#tapTahun').textContent = thn;

    // hitung TAP tiap bulan pada tahun aktif
    var per = [];
    for (var m = 0; m < 12; m++) per.push(0);
    S.kehadiran.forEach(function (k) {
      if (k.kode !== 'TAP' || k.tanggal.slice(0, 4) !== thn) return;
      per[+k.tanggal.slice(5, 7) - 1]++;
    });

    // Sumbu X hanya memuat bulan yang PUNYA catatan absensi. Bulan tanpa catatan
    // tidak digambar sebagai 0, karena 0 berarti "tidak ada TAP" sedangkan yang
    // sebenarnya terjadi adalah "belum ada data" - dua hal yang sangat berbeda.
    var adaData = [];
    for (var m3 = 0; m3 < 12; m3++) adaData.push(false);
    S.kehadiran.forEach(function (k) {
      if (k.tanggal.slice(0, 4) !== thn || !k.kode || k.kode === 'BELUM') return;
      adaData[+k.tanggal.slice(5, 7) - 1] = true;
    });
    var data = [];
    for (var m2 = 0; m2 < 12; m2++) {
      if (adaData[m2]) data.push({ m: m2, n: per[m2], ada: true });
      else if (m2 === blnAktif) data.push({ m: m2, n: 0, ada: false });
    }
    if (!data.length) {
      $('#chTap').innerHTML = '<p class="empty">Belum ada catatan absensi pada ' + thn + '.</p>';
      return;
    }
    var maxNilai = Math.max.apply(null, data.map(function (d) { return d.n; }));
    var tanpaData = data.filter(function (d) { return !d.ada; }).length;
    if (maxNilai === 0) {
      $('#chTap').innerHTML = '<p class="empty">Tidak ada kejadian TAP pada ' +
        (data.length === 1 ? BULAN[data[0].m] + ' ' + thn : thn) + '.</p>';
      return;
    }

    // ---- geometri ----
    var W = 520, H = 268;
    var L = 62, R = 18, T = 24, B = 56;              // margin: L untuk label sumbu Y
    var pw = W - L - R, ph = H - T - B;
    var step = langkahBagus(maxNilai / 4);
    var atas = Math.ceil(maxNilai / step) * step;
    var y = function (v) { return T + ph - (v / atas) * ph; };

    // band per bulan; batang selebar 52% band -> otomatis ada jarak dari sumbu Y
    var band = pw / data.length;
    var bw = Math.min(46, band * 0.52);

    // ---- garis bantu + tik sumbu Y ----
    var grid = '', tick = '';
    for (var v = 0; v <= atas + 0.001; v += step) {
      var yy = y(v);
      grid += '<line x1="' + L + '" y1="' + yy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + yy.toFixed(1) +
        '" stroke="var(--line)"' + (v === 0 ? '' : ' stroke-dasharray="3 4"') + '/>';
      tick += '<text x="' + (L - 10) + '" y="' + (yy + 3.5).toFixed(1) + '" font-size="10.5" ' +
        'fill="var(--muted)" text-anchor="end">' + v + '</text>';
    }

    // ---- batang ----
    var bars = '';
    data.forEach(function (d, i) {
      var cx = L + band * i + band / 2;
      var x = cx - bw / 2;
      var aktif = d.m === blnAktif;
      var warna = aktif ? '#FF8A00' : '#0F4C4B';
      if (!d.ada) {
        // bulan tanpa catatan: kotak bergaris putus-putus, bukan batang bernilai 0
        bars += '<rect x="' + x.toFixed(1) + '" y="' + (T + ph - 16) + '" width="' + bw.toFixed(1) +
          '" height="16" rx="3" fill="none" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".55">' +
          '<title>' + BULAN[d.m] + ' ' + thn + ': belum ada catatan absensi</title></rect>';
      } else if (d.n === 0) {
        bars += '<rect x="' + x.toFixed(1) + '" y="' + (T + ph - 3) + '" width="' + bw.toFixed(1) +
          '" height="3" rx="1.5" fill="' + warna + '" opacity=".35">' +
          '<title>' + BULAN[d.m] + ' ' + thn + ': 0 TAP</title></rect>';
      }
      if (d.n > 0) {
        var h = ph - (y(d.n) - T);
        bars += '<rect x="' + x.toFixed(1) + '" y="' + y(d.n).toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + Math.max(2, h).toFixed(1) + '" rx="3" fill="' + warna + '">' +
          '<title>' + BULAN[d.m] + ' ' + thn + ': ' + d.n + ' TAP</title></rect>' +
          '<text x="' + cx.toFixed(1) + '" y="' + (y(d.n) - 7).toFixed(1) + '" font-size="11" ' +
          'font-weight="600" fill="var(--ink)" text-anchor="middle">' + d.n + '</text>';
      }
      bars += '<text x="' + cx.toFixed(1) + '" y="' + (T + ph + 18) + '" font-size="10.5" ' +
        'fill="' + (aktif ? 'var(--ink)' : 'var(--muted)') + '"' +
        (aktif ? ' font-weight="600"' : '') + ' text-anchor="middle">' +
        BULAN[d.m].slice(0, 3) + '</text>';
    });

    $('#chTap').innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Diagram batang jumlah TAP per bulan tahun ' +
        thn + '. ' + data.map(function (d) { return BULAN[d.m] + ' ' + d.n; }).join(', ') + '.">' +
        grid + tick +
        // sumbu
        '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (T + ph) + '" stroke="var(--line)"/>' +
        bars +
        // judul sumbu
        '<text x="' + (L + pw / 2) + '" y="' + (H - 12) + '" font-size="11" font-weight="600" ' +
          'fill="var(--muted)" text-anchor="middle">Bulan ' + thn + '</text>' +
        '<text transform="translate(15 ' + (T + ph / 2) + ') rotate(-90)" font-size="11" font-weight="600" ' +
          'fill="var(--muted)" text-anchor="middle">Jumlah kejadian TAP</text>' +
      '</svg>' +
      '<div class="chartnote"><em><span class="dot" style="background:#FF8A00"></span>Bulan yang dipilih</em>' +
      '<em><span class="dot" style="background:#0F4C4B"></span>Bulan lain</em>' +
      (tanpaData ? '<em><span class="dot dash"></span>Belum ada catatan absensi</em>' : '') +
      '</div>';
  }

  function renderBelum(tgl, list) {
    var b = list.filter(function (p) { return kodeDi(p.id, tgl) === 'BELUM'; });
    $('#belumCount').textContent = b.length ? b.length + ' pegawai' : '';
    if (!b.length) { $('#belumList').innerHTML = '<p class="empty">Semua pegawai sudah diinput.</p>'; return; }
    $('#belumList').innerHTML = '<ul class="lst">' + b.map(function (p) {
      return '<li><span class="nm">' + esc(p.nama) + '</span><span class="pill">' + esc(p.kelompok) + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderTapTop() {
    $('#tapBulanLabel').textContent = labelBulan(S.bulan);
    var pref = S.bulan, hit = {};
    S.kehadiran.forEach(function (k) {
      if (k.kode === 'TAP' && k.tanggal.indexOf(pref) === 0) hit[k.pegawai_id] = (hit[k.pegawai_id] || 0) + 1;
    });
    var arr = Object.keys(hit).map(function (id) {
      var p = S.pegawai.filter(function (x) { return String(x.id) === String(id); })[0];
      return { nama: p ? p.nama : 'ID ' + id, kel: p ? p.kelompok : '—', n: hit[id] };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    if (!arr.length) { $('#tapTop').innerHTML = '<p class="empty">Tidak ada TAP pada ' + labelBulan(S.bulan) + '.</p>'; return; }
    var max = arr[0].n;
    $('#tapTop').innerHTML = '<ul class="lst" style="max-height:none">' + arr.map(function (a, i) {
      return '<li><span class="rank">' + (i + 1) + '</span><span class="nm">' + esc(a.nama) + '</span>' +
        '<span class="pill">' + esc(a.kel) + '</span>' +
        '<span class="bar" style="width:' + (a.n / max * 90).toFixed(0) + 'px"></span>' +
        '<span style="min-width:52px;text-align:right">' + a.n + ' kali</span></li>';
    }).join('') + '</ul>';
  }

  /* ================= KEHADIRAN HARIAN ================= */
  function renderHarian() {
    var tgl = S.tanggal;
    $('#hTglLabel').textContent = labelTanggal(tgl) + ' · ' + (CFG.shift[S.shift] || {}).label;
    var editable = bolehInput() && isKerja(tgl);
    var pr = peran();
    // Catatan hanya ditampilkan bila pengguna TIDAK bisa mengedit, karena itu
    // menjelaskan sebabnya. Saat bisa mengedit, tidak ada yang perlu dijelaskan.
    var nt = $('#hNote');
    if (editable) { nt.hidden = true; nt.innerHTML = ''; }
    else {
      nt.hidden = false;
      nt.innerHTML = !isKerja(tgl)
        ? 'Bukan hari kerja — tidak ada absensi.'
        : 'Peran <b>' + esc(pr.label) + '</b> tidak berhak menginput shift ' +
          esc((CFG.shift[S.shift] || {}).label) + '. Tampilan hanya-baca.' +
          (pr.shiftBoleh.length ? ' Shift yang boleh Anda input: <b>' + pr.shiftBoleh.join(', ') + '</b>.' : '');
    }

    var list = pegawaiAktif().map(function (p, i) {
      return { p: p, no: i + 1, kode: kodeDi(p.id, tgl) || 'BELUM' };
    });
    var k = S.sort.k, dir = S.sort.dir === 'desc' ? -1 : 1;
    var key = function (r) {
      if (k === 'no') return r.no;
      if (k === 'nip') return String(r.p.nip || '\uffff');
      if (k === 'nama') return (r.p.nama || '').toLowerCase();
      if (k === 'gol') return String(r.p.golongan || '\uffff');
      if (k === 'kel') return (r.p.kelompok || '').toLowerCase();
      return REKAP_URUT.indexOf(r.kode);
    };
    list.sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -dir : x > y ? dir : a.no - b.no; });
    $$('#view-harian th.sortcol').forEach(function (th) {
      if (th.dataset.k === k) th.dataset.dir = S.sort.dir; else th.removeAttribute('data-dir');
    });

    var opts = Object.keys(KODE).map(function (c) {
      return '<option value="' + c + '">' + c + ' — ' + KODE[c].nama + '</option>';
    }).join('');

    $('#hBody').innerHTML = list.map(function (r) {
      var sel = editable
        ? '<select class="field" data-pid="' + r.p.id + '" aria-label="Status ' + esc(r.p.nama) + '">' +
          opts.replace('value="' + r.kode + '"', 'value="' + r.kode + '" selected') + '</select>'
        : '<span class="badge bg-' + tampilKode(r.kode, r.p.id) + '">' + tampilKode(r.kode, r.p.id) + '</span>';
      return '<tr><td>' + r.no + '</td><td class="mono">' + (r.p.nip || '—') + '</td>' +
        '<td class="nm">' + esc(r.p.nama) + '</td><td class="mono">' + (r.p.golongan || '—') + '</td>' +
        '<td class="mono">' + esc(r.p.kelompok) + '</td><td>' + sel + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">Tidak ada pegawai yang cocok dengan filter.</td></tr>';

    $$('#hBody select').forEach(function (el) {
      el.addEventListener('change', function () {
        var pid = Number(el.dataset.pid);
        var lama = S.map[pid + '|' + tgl + '|' + S.shift] || 'BELUM';
        var pg = S.pegawai.filter(function (x) { return x.id === pid; })[0];
        API.simpan(pid, tgl, S.shift, el.value).then(function () {
          S.map[pid + '|' + tgl + '|' + S.shift] = el.value;
          var ada = S.kehadiran.filter(function (x) {
            return x.pegawai_id === pid && x.tanggal === tgl && (x.shift || 'PAGI') === S.shift;
          })[0];
          if (ada) ada.kode = el.value;
          else S.kehadiran.push({ pegawai_id: pid, tanggal: tgl, shift: S.shift, kode: el.value });
          notifTambah({
            aktor: peran().label, pegawai: pg ? pg.nama : 'ID ' + pid,
            tglLabel: parse(tgl).getDate() + ' ' + BULAN[parse(tgl).getMonth()].slice(0, 3),
            shift: S.shift, dari: lama, ke: el.value
          });
          toast('Tersimpan: ' + (pg ? pg.nama : '') + ' → ' + el.value);
        }).catch(function (e) { toast('Gagal menyimpan: ' + e.message, true); });
      });
    });
  }

  /* ================= REKAP BULANAN ================= */
  function renderRekap() {
    var y = +S.bulan.slice(0, 4), m = +S.bulan.slice(5, 7) - 1, n = hariBulan(y, m);
    $('#rBulanLabel').textContent = labelBulan(S.bulan) + ' · ' + (CFG.shift[S.shift] || {}).label;
    var list = pegawaiAktif();

    var head = '<tr><th class="nmhead">Pegawai</th>';
    for (var d = 1; d <= n; d++) {
      var dt = new Date(y, m, d);
      head += '<th class="' + (dt.getDay() === 0 ? 'mgg' : '') + '">' + d +
        '<br><span style="font-weight:400">' + HARI_S[dt.getDay()] + '</span></th>';
    }
    REKAP_URUT.forEach(function (c) {
      head += '<th class="rek" title="' + KODE[c].nama + '">' + (c === 'BELUM' ? 'Belum' : c) + '</th>';
    });
    head += '<th class="pct">% Hadir</th></tr>';
    $('#rHead').innerHTML = head;

    var tot = {}; REKAP_URUT.forEach(function (c) { tot[c] = 0; });
    var totH = 0, totWajib = 0, totBelum = 0;

    $('#rBody').innerHTML = list.map(function (pg) {
      var row = '<tr><td class="nmcell" title="' + esc(pg.nama) + '">' + esc(pg.nama) + '</td>';
      for (var d = 1; d <= n; d++) {
        var s = S.bulan + '-' + String(d).padStart(2, '0');
        if (!isKerja(s)) { row += '<td><span class="cell c-MGG"></span></td>'; continue; }
        var k = kodeDi(pg.id, s);
        if (!k) {
          row += '<td><span class="cell c-NA" title="' + s + ' · belum ada pencatatan">·</span></td>';
          continue;
        }
        var show = tampilKode(k, pg.id);
        row += '<td><span class="cell c-' + show + '" title="' + s + ' · ' +
          (KODE[show] ? KODE[show].nama : show) + '">' + (k === 'BELUM' ? '–' : show) + '</span></td>';
      }
      var r = rekapPegawai(pg.id, S.bulan);
      REKAP_URUT.forEach(function (c) { tot[c] += r[c]; });
      totH += r.H; totWajib += r.wajib; totBelum += r.BELUM;
      REKAP_URUT.forEach(function (c) {
        row += '<td class="rekcell' + (r[c] === 0 ? ' z' : '') + '">' + r[c] + '</td>';
      });
      var pv = r.bawah === null ? '–' : (r.bawah === r.atas ? pct(r.bawah) : pct(r.bawah) + '–' + pct(r.atas));
      return row + '<td class="pctcell">' + pv + '</td></tr>';
    }).join('') || '<tr><td colspan="9" class="empty">Tidak ada pegawai.</td></tr>';

    // ringkasan di atas
    var cards = '';
    var lo = totWajib ? totH / totWajib : null, hi = totWajib ? (totH + totBelum) / totWajib : null;
    cards += '<div class="sumcard wide"><div><div class="lb">Kehadiran ' + labelBulan(S.bulan) + '</div>' +
      '<div class="vl">' + (lo === null ? '–' : (lo === hi ? pct(lo) : pct(lo) + ' – ' + pct(hi))) + '</div></div></div>';
    REKAP_URUT.forEach(function (c) {
      if (!tot[c]) return;
      if (!bolehLihatAlasan() && KODE[c].kategori === 'sah') return;
      var w = KODE[c].warna, extra = '';
      if (c === 'TK') w = 'repeating-linear-gradient(45deg,#6B6154,#6B6154 3px,#8C8375 3px,#8C8375 6px)';
      if (c === 'BELUM') { w = 'var(--surface)'; extra = 'border:1px dashed #C8C1B2;color:var(--slate)'; }
      if (c === 'IA' || c === 'F') extra = 'color:#2E2A24';
      cards += '<div class="sumcard"><span class="kk" style="background:' + w + ';' + extra + '">' +
        (c === 'BELUM' ? '–' : c) + '</span><div><div class="lb">' + KODE[c].nama +
        '</div><div class="vl">' + tot[c] + '</div></div></div>';
    });
    var nKosong = Object.keys(hariKosong(S.bulan, S.shift)).length;
    if (nKosong) cards += '<div class="sumcard"><span class="kk" style="background:var(--surface);' +
      'border:1px dashed #C8C1B2;color:var(--slate)">·</span><div><div class="lb">Hari belum tercatat</div>' +
      '<div class="vl">' + nKosong + '</div></div></div>';
    if (!bolehLihatAlasan()) {
      var sahTot = REKAP_URUT.reduce(function (a, c) { return a + (KODE[c].kategori === 'sah' ? tot[c] : 0); }, 0);
      if (sahTot) cards += '<div class="sumcard"><span class="kk" style="background:#6B6154">B</span>' +
        '<div><div class="lb">Berizin</div><div class="vl">' + sahTot + '</div></div></div>';
    }
    $('#rSum').innerHTML = cards;

    // legenda warna saja
    $('#rLegend').innerHTML = Object.keys(KODE).filter(function (c) {
      return bolehLihatAlasan() || KODE[c].kategori !== 'sah';
    }).map(function (c) {
      var w = KODE[c].warna, extra = '';
      if (c === 'TK') w = 'repeating-linear-gradient(45deg,#6B6154,#6B6154 3px,#8C8375 3px,#8C8375 6px)';
      if (c === 'BELUM') { w = 'var(--surface)'; extra = 'border:1px dashed #C8C1B2;color:var(--slate)'; }
      if (c === 'IA' || c === 'F') extra = 'color:#2E2A24';
      return '<em><span class="kk" style="background:' + w + ';' + extra + '">' +
        (c === 'BELUM' ? '–' : c) + '</span>' + KODE[c].nama + '</em>';
    }).join('') +
      (bolehLihatAlasan() ? '' : '<em><span class="kk" style="background:#6B6154">B</span>Berizin</em>') +
      '<em><span class="kk" style="background:var(--foam)"></span>Bukan hari kerja</em>' +
      '<em><span class="kk" style="background:var(--surface);border:1px dashed #C8C1B2;color:var(--slate)">·</span>' +
      'Belum ada pencatatan (tidak dihitung)</em>';
  }

  /* ================= UNDUH EXCEL ================= */
  function muatSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = res;
      s.onerror = function () { rej(new Error('Gagal memuat pustaka Excel. Periksa koneksi internet.')); };
      document.head.appendChild(s);
    });
  }
  function kolom(i) { // 1 -> A
    var s = '';
    while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function unduhExcel() {
    var btn = $('#btnUnduh');
    btn.disabled = true;
    var t0 = btn.querySelector('span'); if (t0) t0.textContent = 'Menyiapkan…';
    muatSheetJS().then(function () {
      var y = +S.bulan.slice(0, 4), m = +S.bulan.slice(5, 7) - 1, n = hariBulan(y, m);
      var judulBulan = labelBulan(S.bulan).toUpperCase();
      var legenda = Object.keys(KODE).map(function (c) {
        return (c === 'BELUM' ? 'BELUM' : c) + '=' + KODE[c].nama;
      }).join('  ') + '   MGG=Hari Minggu   -=Belum ada pencatatan (tidak dihitung)';
      var wb = window.XLSX.utils.book_new();
      var hariIni = iso(new Date());
      var kosong = hariKosong(S.bulan, S.shift);

      GRUP.forEach(function (g) {
        var anggota = S.pegawai.filter(function (p) { return p.kelompok === g.kel && p.aktif !== false; });
        var aoa = [];
        aoa.push([g.judul + ' - ' + (CFG.shift[S.shift] || {}).label.toUpperCase() + ' ' + judulBulan +
                  ' | ' + CFG.org.namaPanjang.toUpperCase()]);
        aoa.push([legenda]);
        aoa.push([]);
        var h1 = ['NO', 'NAMA', 'NIP', 'GOL'], h2 = ['', '', '', ''];
        for (var d = 1; d <= n; d++) { h1.push(d); h2.push(HARI_S[new Date(y, m, d).getDay()]); }
        REKAP_URUT.forEach(function (c) { h1.push(c === 'BELUM' ? 'BELUM' : c); h2.push(''); });
        h1.push('% HADIR'); h2.push('');
        h1.push('CATATAN'); h2.push('');
        aoa.push(h1); aoa.push(h2);

        var nilai = [];
        anggota.forEach(function (p, i) {
          var row = [i + 1, p.nama, p.nip || '', p.golongan || '-'];
          for (var d = 1; d <= n; d++) {
            var s = S.bulan + '-' + String(d).padStart(2, '0');
            if (!isKerja(s)) { row.push('MGG'); continue; }
            if (s > hariIni || kosong[s]) { row.push('-'); continue; }
            var k = S.map[p.id + '|' + s + '|' + S.shift];
            row.push(k === undefined ? 'BELUM' : k);
          }
          var r = rekapPegawai(p.id, S.bulan);
          REKAP_URUT.forEach(function (c) { row.push(r[c]); });
          row.push(r.bawah === null ? '' : r.bawah);
          row.push('');
          aoa.push(row); nilai.push(r);
        });

        var ws = window.XLSX.utils.aoa_to_sheet(aoa);
        var cD = 5, cRek = 5 + n, cPct = cRek + REKAP_URUT.length;
        var Lfirst = kolom(cD), Llast = kolom(cD + n - 1);
        // rekap sebagai formula (dengan nilai tersimpan, supaya langsung terlihat)
        anggota.forEach(function (p, i) {
          var xr = 6 + i;
          REKAP_URUT.forEach(function (c, j) {
            var ref = kolom(cRek + j) + xr;
            ws[ref] = { t: 'n', v: nilai[i][c], f: 'COUNTIF(' + Lfirst + xr + ':' + Llast + xr + ',"' + c + '")' };
          });
          var H = kolom(cRek) + xr, TK = kolom(cRek + REKAP_URUT.indexOf('TK')) + xr;
          var TAP = kolom(cRek + REKAP_URUT.indexOf('TAP')) + xr, BL = kolom(cRek + REKAP_URUT.indexOf('BELUM')) + xr;
          var pr = kolom(cPct) + xr;
          ws[pr] = { t: 'n', v: nilai[i].bawah === null ? 0 : nilai[i].bawah, z: '0.0%',
                     f: 'IFERROR(' + H + '/(' + H + '+' + TK + '+' + TAP + '+' + BL + '),"")' };
        });
        ws['!cols'] = [{ wch: 4 }, { wch: 30 }, { wch: 21 }, { wch: 7 }]
          .concat(Array.apply(null, Array(n)).map(function () { return { wch: 5 }; }))
          .concat(REKAP_URUT.map(function (c) { return { wch: c === 'BELUM' ? 7 : 5 }; }))
          .concat([{ wch: 10 }, { wch: 34 }]);
        ws['!freeze'] = { xSplit: 4, ySplit: 5 };
        window.XLSX.utils.book_append_sheet(wb, ws, g.sheet);
      });

      var judulShift = (CFG.shift[S.shift] || {}).label.replace(/\S+/g, function (t) {
        return t.charAt(0).toUpperCase() + t.slice(1);
      });
      var nm = 'Absen_' + judulShift.replace(/\s+/g, '_') + '_' +
        CFG.org.nama.replace(/\s+/g, '_') + '_-_' + labelBulan(S.bulan).replace(/\s+/g, '_') + '.xlsx';
      window.XLSX.writeFile(wb, nm);
      toast('Terunduh: ' + nm);
      notifTambah({ aktor: peran().label, pegawai: 'rekap ' + labelBulan(S.bulan),
        tglLabel: labelBulan(S.bulan), shift: S.shift, dari: '—', ke: 'diunduh' });
    }).catch(function (e) { toast(e.message, true); })
      .then(function () { btn.disabled = false; var t = btn.querySelector('span'); if (t) t.textContent = 'Unduh'; });
  }

  /* ================= NAVIGASI ================= */
  function pindah(v) {
    $$('.view').forEach(function (x) { x.classList.toggle('on', x.id === 'view-' + v); });
    $$('.nav button').forEach(function (b) {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var btn = $('.nav button[data-view="' + v + '"]');
    if (btn) $('#judul').textContent = btn.dataset.title;
    if (v === 'dashboard') renderDashboard();
    if (v === 'harian') renderHarian();
    if (v === 'rekap') renderRekap();
    if (location.hash !== '#' + v) location.hash = v;
  }
  function renderAll() {
    var awal = window.Sesi.mulaiDi(S.sesi && S.sesi.role);
    var v = (location.hash || '#' + awal).slice(1);
    pindah($('.nav button[data-view="' + v + '"]') ? v : awal);
  }

  /* ================= SESI ================= */
  function keluar() {
    window.Sesi.hapus();
    window.Sesi.keLogin();
  }

  /* ================= BOOT ================= */
  function boot() {
    var sesi = window.Sesi.baca();
    if (!sesi) { window.Sesi.keLogin(); return; }   // penjaga: belum pilih peran
    mulaiApp(sesi);
  }

  function mulaiApp(sesi) {
    $('#loader').hidden = false;
    S.sesi = sesi;
    notifMuat();

    $('#brandNama').textContent = CFG.org.aplikasi;
    $('#brandOrg').textContent = CFG.org.namaPanjang;
    $('#brandLogo').src = CFG.org.logo;
    document.title = CFG.org.aplikasi + ' — ' + CFG.org.nama;

    var pr = peran();
    $('#whoNama').textContent = pr.label;
    $('#whoAv').textContent = pr.label.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    $('#whoDesc').textContent = pr.deskripsi;

    // Shift default selalu PAGI: semua peran boleh MELIHAT semua shift.
    // pr.shiftBoleh hanya membatasi hak MENULIS, bukan hak membaca.
    S.shift = 'PAGI';
    $('#inShift').innerHTML = Object.keys(CFG.shift).map(function (k) {
      return '<option value="' + k + '"' + (k === S.shift ? ' selected' : '') + '>' + CFG.shift[k].label + '</option>';
    }).join('');

    // event global
    $$('.nav button').forEach(function (b) { b.addEventListener('click', function () { pindah(b.dataset.view); }); });
    function lipat() {
      var d = document.documentElement;
      d.dataset.side = d.dataset.side === 'min' ? 'full' : 'min';
      try { localStorage.setItem('dk-side', d.dataset.side); } catch (e) {}
      var kecil = d.dataset.side === 'min';
      var lbl = kecil ? 'Perbesar menu samping' : 'Perkecil menu samping';
      ['#btnMin', '#btnLipat'].forEach(function (id) {
        var b = $(id); if (!b) return;
        b.setAttribute('aria-label', lbl); b.setAttribute('title', lbl);
      });
      var t = $('#btnLipat span'); if (t) t.textContent = kecil ? 'Perbesar' : 'Perkecil menu';
    }
    $('#btnMin').addEventListener('click', lipat);
    if ($('#btnLipat')) $('#btnLipat').addEventListener('click', lipat);
    // selaraskan label dengan keadaan yang tersimpan
    if (document.documentElement.dataset.side === 'min') { lipat(); lipat(); }
    $('#btnTheme').addEventListener('click', function () {
      var d = document.documentElement;
      d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('dk-theme', d.dataset.theme); } catch (e) {}
      renderAll();
    });
    ['#inTgl', '#hInTgl'].forEach(function (sel) {
      $(sel).addEventListener('change', function (e) {
        if (!e.target.value) return;
        S.tanggal = e.target.value;
        var bulanBaru = S.tanggal.slice(0, 7);
        $('#inTgl').value = S.tanggal; $('#hInTgl').value = S.tanggal;
        if (bulanBaru !== S.bulan) { S.bulan = bulanBaru; $('#inBulan').value = S.bulan; muat(); }
        else renderAll();
      });
    });
    $('#inBulan').addEventListener('change', function (e) {
      if (!e.target.value) return;
      S.bulan = e.target.value;
      var n = hariBulan(+S.bulan.slice(0, 4), +S.bulan.slice(5, 7) - 1);
      S.tanggal = S.bulan + '-' + String(Math.min(+S.tanggal.slice(8), n)).padStart(2, '0');
      $('#inTgl').value = S.tanggal; $('#hInTgl').value = S.tanggal;
      muat();
    });
    $('#inShift').addEventListener('change', function (e) { S.shift = e.target.value; renderAll(); });
    $('#inCari').addEventListener('input', function (e) { S.cari = e.target.value; renderAll(); });
    $('#inKelompok').addEventListener('change', function (e) { S.kelompok = e.target.value; renderAll(); });
    $('#btnUnduh').addEventListener('click', unduhExcel);
    $('#btnKeluar').addEventListener('click', keluar);
    $$('#view-harian th.sortcol').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.k;
        S.sort = { k: k, dir: (S.sort.k === k && S.sort.dir === 'asc') ? 'desc' : 'asc' };
        renderHarian();
      });
    });
    // dropdown notif & pengguna
    function toggle(btn, panel) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var buka = panel.hidden;
        $('#notifPanel').hidden = true; $('#whoPanel').hidden = true;
        $('#btnNotif').setAttribute('aria-expanded', 'false'); $('#btnWho').setAttribute('aria-expanded', 'false');
        panel.hidden = !buka;
        btn.setAttribute('aria-expanded', String(buka));
      });
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    toggle($('#btnNotif'), $('#notifPanel'));
    toggle($('#btnWho'), $('#whoPanel'));
    document.addEventListener('click', function () {
      $('#notifPanel').hidden = true; $('#whoPanel').hidden = true;
      $('#btnNotif').setAttribute('aria-expanded', 'false'); $('#btnWho').setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { $('#notifPanel').hidden = true; $('#whoPanel').hidden = true; }
    });
    $('#btnNotifClear').addEventListener('click', function () {
      S.notif.forEach(function (x) { x.baca = true; }); notifSimpan(); notifRender();
    });
    window.addEventListener('hashchange', renderAll);

    API.pegawai().then(function (rows) {
      S.pegawai = rows;
      var kel = {}; S.pegawai.forEach(function (p) { kel[p.kelompok] = 1; });
      $('#inKelompok').innerHTML = '<option value="">Semua kelompok</option>' +
        Object.keys(kel).map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('');
      var awal = (API.mode === 'sample' && window.SAMPLE_DATA && window.SAMPLE_DATA.meta)
        ? window.SAMPLE_DATA.meta.bulan : iso(new Date()).slice(0, 7);
      S.bulan = awal; S.tanggal = awal + '-01';
      $('#inBulan').value = S.bulan;
      return muat(true);
    }).catch(gagal);
  }

  function muat(pilihTerakhir) {
    var y = +S.bulan.slice(0, 4);
    // Ambil satu tahun kalender penuh: grafik "TAP per bulan" menampilkan
    // Jan-Des, jadi bulan setelah bulan aktif pun harus ikut terbaca.
    return API.kehadiran(y + '-01-01', y + '-12-31').then(function (rows) {
      S.kehadiran = rows; bangunMap();
      if (pilihTerakhir) {
        var ada = rows.filter(function (k) { return k.tanggal.indexOf(S.bulan) === 0 && k.kode && k.kode !== 'BELUM'; })
                      .map(function (k) { return k.tanggal; }).sort();
        if (ada.length) S.tanggal = ada[ada.length - 1];
        $('#inTgl').value = S.tanggal; $('#hInTgl').value = S.tanggal;
      }
      $('#loader').hidden = true;
      $('#shell').hidden = false;
      notifDariAudit();
      notifRender();
      renderAll();
    }).catch(gagal);
  }

  function gagal(e) {
    console.error(e);
    $('#loader').hidden = false;
    $('#loader').innerHTML = '<div style="max-width:520px;text-align:left">' +
      '<h2 style="margin:0 0 8px;font-size:16px;color:#C0473E">Gagal memuat data</h2>' +
      '<p style="margin:0 0 10px;font-size:13px">' + esc(e.message || String(e)) + '</p>' +
      '<p style="margin:0;font-size:12px;color:#7B7468">Mode aktif: <b>' + API.mode + '</b>. ' +
      'Periksa <code>assets/config.js</code>. Untuk uji tampilan, set <code>mode: \'sample\'</code>.</p></div>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

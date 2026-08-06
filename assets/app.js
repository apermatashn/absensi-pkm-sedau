/* =====================================================================
   app.js — logika Dashboard Kehadiran
   Tanpa dependensi eksternal. Grafik digambar sendiri dengan SVG agar
   halaman tetap ringan di koneksi lambat.
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

  var S = { pegawai: [], kehadiran: [], map: {}, sesi: null, tanggal: null, bulan: null, cari: '', kelompok: '' };

  /* ---------- util tanggal ---------- */
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isKerja(s) {
    var d = parse(s);
    if (CFG.org.hariLibur.indexOf(s) > -1) return false;
    return CFG.org.hariKerja.indexOf(d.getDay()) > -1;
  }
  function labelTanggal(s) { var d = parse(s); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); }
  function hariBulan(y, m) { return new Date(y, m + 1, 0).getDate(); }

  /* ---------- akses & penyamaran ---------- */
  function bolehLihatAlasan() {
    if (!CFG.samarkanAlasan) return true;
    var r = S.sesi && S.sesi.role;
    return r === 'administrator' || r === 'pic_kehadiran' || r === 'kepala';
  }
  function tampilKode(kode, pegawai_id) {
    if (bolehLihatAlasan()) return kode;
    if (S.sesi && S.sesi.pegawai_id === pegawai_id) return kode;
    var k = KODE[kode];
    return (k && k.kategori === 'sah') ? 'BERIZIN' : kode;
  }
  function bolehInput() {
    var r = S.sesi && S.sesi.role;
    return r === 'administrator' || r === 'pic_kehadiran';
  }

  /* ---------- indeks kehadiran ---------- */
  function bangunMap() {
    S.map = {};
    S.kehadiran.forEach(function (k) { S.map[k.pegawai_id + '|' + k.tanggal + '|' + (k.shift || 'PAGI')] = k.kode; });
  }
  function kodeDi(pid, tgl, shift) {
    return S.map[pid + '|' + tgl + '|' + (shift || 'PAGI')] || (isKerja(tgl) ? 'BELUM' : null);
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

  /* ---------- hitung ringkasan satu hari ---------- */
  function ringkas(tgl, list) {
    var c = {}; Object.keys(KODE).forEach(function (k) { c[k] = 0; });
    list.forEach(function (p) { var k = kodeDi(p.id, tgl); if (k && c[k] !== undefined) c[k]++; });
    var sah = 0, tidakSah = 0;
    Object.keys(KODE).forEach(function (k) {
      if (KODE[k].kategori === 'sah') sah += c[k];
      if (KODE[k].kategori === 'tidak_sah') tidakSah += c[k];
    });
    var total = list.length;
    var wajib = total - sah;                 // pegawai yang seharusnya apel
    return {
      c: c, total: total, sah: sah, tidakSah: tidakSah, belum: c.BELUM, wajib: wajib,
      hadir: c.H,
      bawah: wajib > 0 ? c.H / wajib : null,             // semua BELUM dianggap tidak hadir
      atas: wajib > 0 ? (c.H + c.BELUM) / wajib : null   // semua BELUM dianggap hadir
    };
  }
  var pct = function (v) { return v === null ? '–' : (v * 100).toFixed(1) + '%'; };

  /* ================= RENDER: DASHBOARD ================= */
  function renderDashboard() {
    var tgl = S.tanggal, list = pegawaiAktif(), r = ringkas(tgl, list);
    $('#tglLabel').textContent = labelTanggal(tgl);

    var kerja = isKerja(tgl);
    var bn = $('#banner');
    if (!kerja) {
      bn.style.display = 'flex';
      $('#bannerTxt').innerHTML = '<b>' + labelTanggal(tgl) + '</b> bukan hari kerja menurut kalender di config.js. Tidak ada apel pagi.';
    } else if (r.belum > 0) {
      bn.style.display = 'flex';
      $('#bannerTxt').innerHTML = '<b>' + r.belum + ' dari ' + r.wajib + ' pegawai belum diinput.</b> ' +
        'Selama itu belum ditutup, kehadiran hari ini hanya bisa dinyatakan sebagai rentang <b>' +
        pct(r.bawah) + ' – ' + pct(r.atas) + '</b>, bukan satu angka. “Belum diinput” bukan berarti tidak hadir.';
    } else bn.style.display = 'none';

    var K = [
      ['', 'Total pegawai', r.total, 'orang'],
      ['k-h', 'Hadir', r.c.H, pct(r.bawah) + ' – ' + pct(r.atas)],
      ['k-b', 'Belum diinput', r.belum, r.total ? (r.belum / r.total * 100).toFixed(1) + '%' : '0%'],
      ['k-t', 'TAP', r.c.TAP, r.total ? (r.c.TAP / r.total * 100).toFixed(1) + '%' : '0%'],
      ['k-s', 'Sakit', r.c.S, r.total ? (r.c.S / r.total * 100).toFixed(1) + '%' : '0%'],
      ['k-i', 'Izin', r.c.I, r.total ? (r.c.I / r.total * 100).toFixed(1) + '%' : '0%'],
      ['k-d', 'Tugas dinas', r.c.TD, r.total ? (r.c.TD / r.total * 100).toFixed(1) + '%' : '0%'],
      ['k-c', 'Cuti', r.c.C, r.total ? (r.c.C / r.total * 100).toFixed(1) + '%' : '0%']
    ];
    $('#kpis').innerHTML = K.map(function (k) {
      return '<div class="kpi ' + k[0] + '"><span>' + k[1] + '</span><b>' + k[2] + '</b><i>' + k[3] + '</i></div>';
    }).join('');

    renderTren();
    renderDonut(r);
    renderTapBulan();
    renderBelumList(tgl, list);
    renderTapTop();
    renderAudit();
  }

  /* ---------- grafik tren 30 hari ---------- */
  function renderTren() {
    var akhir = parse(S.tanggal), pts = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date(akhir); d.setDate(d.getDate() - i);
      var s = iso(d);
      if (!isKerja(s)) continue;
      var r = ringkas(s, pegawaiAktif());
      if (r.wajib > 0 && (r.hadir + r.belum + r.tidakSah) > 0) pts.push({ t: s, lo: r.bawah, hi: r.atas });
    }
    var host = $('#chTren');
    if (pts.length < 2) { host.innerHTML = '<p class="empty">Belum cukup data untuk menggambar tren.</p>'; return; }
    var W = 320, H = 132, L = 30, R = 6, T = 8, B = 24;
    var x = function (i) { return L + i * (W - L - R) / (pts.length - 1); };
    var y = function (v) { return T + (1 - v) * (H - T - B); };
    var line = function (key) { return pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p[key]).toFixed(1); }).join(' '); };
    var area = 'M' + pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p.hi).toFixed(1); }).join(' L') +
               ' L' + pts.slice().reverse().map(function (p, i) {
                 var j = pts.length - 1 - i; return x(j).toFixed(1) + ',' + y(p.lo).toFixed(1);
               }).join(' L') + ' Z';
    var grid = [1, .75, .5, .25].map(function (v) {
      return '<line x1="' + L + '" y1="' + y(v) + '" x2="' + (W - R) + '" y2="' + y(v) + '" stroke="var(--line)"/>' +
             '<text x="0" y="' + (y(v) + 3) + '" font-size="8" fill="var(--muted)">' + (v * 100) + '%</text>';
    }).join('');
    var ticks = [0, Math.floor(pts.length / 3), Math.floor(2 * pts.length / 3), pts.length - 1].map(function (i) {
      var d = parse(pts[i].t);
      return '<text x="' + x(i) + '" y="' + (H - 6) + '" font-size="8" fill="var(--muted)" text-anchor="middle">' +
             d.getDate() + ' ' + BULAN[d.getMonth()].slice(0, 3) + '</text>';
    }).join('');
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" ' +
      'aria-label="Grafik rentang kehadiran harian 30 hari terakhir">' + grid +
      '<path d="' + area + '" fill="#16A085" opacity=".13"/>' +
      '<polyline fill="none" stroke="#16A085" stroke-width="2" stroke-linejoin="round" points="' + line('hi') + '"/>' +
      '<polyline fill="none" stroke="#FF8A00" stroke-width="2" stroke-dasharray="5 3" stroke-linejoin="round" points="' + line('lo') + '"/>' +
      ticks + '</svg>' +
      '<div class="callegend"><em><span class="kk" style="background:#16A085"></span>Batas atas</em>' +
      '<em><span class="kk" style="background:#FF8A00"></span>Batas bawah</em>' +
      '<em style="color:var(--muted)">Lebar pita = jumlah sel belum diinput</em></div>';
  }

  /* ---------- donat distribusi ---------- */
  function renderDonut(r) {
    var urut = Object.keys(KODE).filter(function (k) { return r.c[k] > 0; });
    if (!urut.length) { $('#chDonut').innerHTML = '<p class="empty">Tidak ada data pada tanggal ini.</p>'; return; }
    var tot = urut.reduce(function (a, k) { return a + r.c[k]; }, 0);
    var off = 25, arcs = '', leg = '';
    urut.forEach(function (k) {
      var p = r.c[k] / tot * 100;
      var w = KODE[k].warna === 'transparent' ? '#6B6154' : KODE[k].warna;
      arcs += '<circle cx="21" cy="21" r="15.9" fill="none" stroke="' + w + '" stroke-width="5" ' +
              'stroke-dasharray="' + p.toFixed(2) + ' ' + (100 - p).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/>';
      off -= p;
      var nm = (!bolehLihatAlasan() && KODE[k].kategori === 'sah') ? 'Berizin' : KODE[k].nama;
      leg += '<div><em><span class="dot" style="background:' + w + '"></span>' + nm + '</em><span>' +
             r.c[k] + ' · ' + p.toFixed(1) + '%</span></div>';
    });
    $('#chDonut').innerHTML = '<div class="donut-row"><svg viewBox="0 0 42 42" width="104" height="104" role="img" ' +
      'aria-label="Diagram donat distribusi status kehadiran"><circle cx="21" cy="21" r="15.9" fill="none" ' +
      'stroke="var(--line)" stroke-width="5"/>' + arcs + '</svg><div class="legend">' + leg + '</div></div>';
  }

  /* ---------- TAP per bulan ---------- */
  function renderTapBulan() {
    var y = parse(S.tanggal).getFullYear(), data = [];
    for (var m = 0; m < 12; m++) {
      var n = 0, pref = y + '-' + String(m + 1).padStart(2, '0');
      S.kehadiran.forEach(function (k) { if (k.kode === 'TAP' && k.tanggal.indexOf(pref) === 0) n++; });
      data.push({ m: m, n: n });
    }
    data = data.filter(function (d) { return d.n > 0; });
    if (!data.length) { $('#chTap').innerHTML = '<p class="empty">Belum ada catatan TAP tahun ini.</p>'; return; }
    var max = Math.max.apply(null, data.map(function (d) { return d.n; })) * 1.25;
    var W = 240, H = 132, bw = Math.min(26, (W - 26) / data.length - 8);
    var bars = data.map(function (d, i) {
      var x = 24 + i * ((W - 26) / data.length), h = (d.n / max) * 96;
      return '<rect x="' + x.toFixed(1) + '" y="' + (108 - h).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="2" fill="#0F4C4B"/>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (103 - h).toFixed(1) + '" font-size="8.5" font-weight="600" ' +
        'fill="var(--ink)" text-anchor="middle">' + d.n + '</text>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="122" font-size="8" fill="var(--muted)" text-anchor="middle">' +
        BULAN[d.m].slice(0, 3) + '</text>';
    }).join('');
    $('#chTap').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" ' +
      'aria-label="Diagram batang jumlah TAP per bulan">' +
      '<line x1="22" y1="108" x2="' + (W - 4) + '" y2="108" stroke="var(--line)"/>' +
      '<text x="6" y="111" font-size="8" fill="var(--muted)">0</text>' + bars + '</svg>';
  }

  /* ---------- daftar belum diinput ---------- */
  function renderBelumList(tgl, list) {
    var b = list.filter(function (p) { return kodeDi(p.id, tgl) === 'BELUM'; });
    $('#belumCount').textContent = b.length ? '(' + b.length + ')' : '';
    if (!b.length) { $('#belumList').innerHTML = '<p class="empty">Semua pegawai sudah diinput. Bagus.</p>'; return; }
    $('#belumList').innerHTML = '<ul class="lst">' + b.slice(0, 40).map(function (p) {
      return '<li><span class="nm">' + esc(p.nama) + '</span>' +
        '<span class="nip">' + (p.nip || '—') + '</span>' +
        '<span class="pill">' + esc(p.kelompok) + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- TAP terbanyak bulan ini ---------- */
  function renderTapTop() {
    var pref = S.bulan, hit = {};
    S.kehadiran.forEach(function (k) {
      if (k.kode === 'TAP' && k.tanggal.indexOf(pref) === 0) hit[k.pegawai_id] = (hit[k.pegawai_id] || 0) + 1;
    });
    var arr = Object.keys(hit).map(function (id) {
      var p = S.pegawai.filter(function (x) { return String(x.id) === String(id); })[0];
      return { nama: p ? p.nama : 'ID ' + id, n: hit[id] };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    if (!arr.length) { $('#tapTop').innerHTML = '<p class="empty">Tidak ada TAP bulan ini.</p>'; return; }
    $('#tapTop').innerHTML = '<ul class="lst">' + arr.map(function (a, i) {
      return '<li><span class="rank">' + (i + 1) + '</span><span class="nm">' + esc(a.nama) +
        '</span><span>' + a.n + ' kali</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- audit ---------- */
  function renderAudit() {
    API.audit(8).then(function (rows) {
      if (!rows) {
        $('#auditList').innerHTML = '<p class="empty">Audit trail baru aktif di mode <b>supabase</b>. ' +
          'Di mode ' + API.mode + ' tidak ada pencatatan perubahan.</p>';
        return;
      }
      if (!rows.length) { $('#auditList').innerHTML = '<p class="empty">Belum ada perubahan tercatat.</p>'; return; }
      $('#auditList').innerHTML = '<ul class="lst">' + rows.map(function (a) {
        var t = new Date(a.pada);
        return '<li><span class="nm">' + esc(a.role || 'sistem') + ' · ' + esc(a.aksi) + ' ' + esc(a.tabel) +
          '</span><span class="nip">' + String(t.getHours()).padStart(2, '0') + ':' +
          String(t.getMinutes()).padStart(2, '0') + '</span></li>';
      }).join('') + '</ul>';
    }).catch(function (e) { $('#auditList').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  /* ================= RENDER: INPUT HARIAN ================= */
  function renderHarian() {
    var tgl = S.tanggal, list = pegawaiAktif();
    $('#hTglLabel').textContent = labelTanggal(tgl);
    var editable = bolehInput() && isKerja(tgl);
    $('#hNote').innerHTML = editable
      ? (API.mode === 'supabase'
          ? 'Perubahan tersimpan ke database dan tercatat di audit trail.'
          : '<b>Mode ' + API.mode + '</b> — perubahan hanya tersimpan di memori browser dan hilang saat halaman dimuat ulang. Aktifkan mode <b>supabase</b> agar tersimpan permanen.')
      : (isKerja(tgl) ? 'Role Anda tidak punya hak input. Tampilan hanya-baca.' : 'Bukan hari kerja — tidak ada apel pagi.');

    var opts = Object.keys(KODE).map(function (k) {
      return '<option value="' + k + '">' + k + ' — ' + KODE[k].nama + '</option>';
    }).join('');

    $('#hBody').innerHTML = list.map(function (p, i) {
      var k = kodeDi(p.id, tgl) || 'BELUM';
      var sel = editable
        ? '<select class="field" data-pid="' + p.id + '" aria-label="Status ' + esc(p.nama) + '">' +
          opts.replace('value="' + k + '"', 'value="' + k + '" selected') + '</select>'
        : '<span class="badge bg-' + tampilKode(k, p.id) + '">' + tampilKode(k, p.id) + '</span>';
      return '<tr><td>' + (i + 1) + '</td><td class="mono">' + (p.nip || '—') + '</td>' +
        '<td class="nm">' + esc(p.nama) + '</td><td class="ro">' + esc(p.kelompok) + '</td>' +
        '<td>' + sel + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">Tidak ada pegawai yang cocok dengan filter.</td></tr>';

    $$('#hBody select').forEach(function (el) {
      el.addEventListener('change', function () {
        var pid = Number(el.dataset.pid);
        API.simpan(pid, tgl, 'PAGI', el.value).then(function () {
          S.map[pid + '|' + tgl + '|PAGI'] = el.value;
          var ada = S.kehadiran.filter(function (x) { return x.pegawai_id === pid && x.tanggal === tgl; })[0];
          if (ada) ada.kode = el.value; else S.kehadiran.push({ pegawai_id: pid, tanggal: tgl, shift: 'PAGI', kode: el.value });
          toast('Tersimpan: ' + el.value);
        }).catch(function (e) { toast('Gagal: ' + e.message, true); });
      });
    });
  }

  /* ================= RENDER: REKAP BULANAN ================= */
  function renderRekap() {
    var p = S.bulan.split('-'), y = +p[0], m = +p[1] - 1, n = hariBulan(y, m);
    $('#rBulanLabel').textContent = BULAN[m] + ' ' + y;
    var list = pegawaiAktif();

    var head = '<tr><th class="nmhead">Pegawai</th>';
    for (var d = 1; d <= n; d++) {
      var dt = new Date(y, m, d);
      head += '<th class="' + (dt.getDay() === 0 ? 'mgg' : '') + '">' + d + '<br><span style="font-weight:400">' +
        HARI_S[dt.getDay()] + '</span></th>';
    }
    head += '<th>H</th><th>Sah</th><th>TAP<br>TK</th><th>Belum</th></tr>';
    $('#rHead').innerHTML = head;

    var totKode = {}; Object.keys(KODE).forEach(function (k) { totKode[k] = 0; });
    var body = list.map(function (pg) {
      var row = '<tr><td class="nmcell" title="' + esc(pg.nama) + '">' + esc(pg.nama) + '</td>';
      var cH = 0, cSah = 0, cBad = 0, cBelum = 0;
      for (var d = 1; d <= n; d++) {
        var s = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        if (!isKerja(s)) { row += '<td><span class="cell c-MGG"></span></td>'; continue; }
        var k = kodeDi(pg.id, s);
        if (!k) { row += '<td><span class="cell c-NA">·</span></td>'; continue; }
        totKode[k]++;
        if (KODE[k].kategori === 'hadir') cH++;
        else if (KODE[k].kategori === 'sah') cSah++;
        else if (KODE[k].kategori === 'tidak_sah') cBad++;
        else cBelum++;
        var show = tampilKode(k, pg.id);
        var cls = KODE[show] ? show : 'S';
        row += '<td><span class="cell c-' + cls + '" title="' + s + ' · ' + (KODE[show] ? KODE[show].nama : show) +
          '">' + (k === 'BELUM' ? '–' : show) + '</span></td>';
      }
      return row + '<td class="tot">' + cH + '</td><td>' + cSah + '</td><td>' + cBad + '</td><td>' + cBelum + '</td></tr>';
    }).join('');
    $('#rBody').innerHTML = body || '<tr><td colspan="9" class="empty">Tidak ada pegawai.</td></tr>';

    var sum = Object.keys(totKode).filter(function (k) { return totKode[k] > 0; }).map(function (k) {
      var nm = (!bolehLihatAlasan() && KODE[k].kategori === 'sah') ? 'Berizin' : KODE[k].nama;
      return nm + ' <b>' + totKode[k] + '</b>';
    }).join(' · ');
    $('#rSum').innerHTML = sum || '';

    $('#rLegend').innerHTML = Object.keys(KODE).map(function (k) {
      var w = KODE[k].warna, extra = '';
      if (k === 'TK') w = 'repeating-linear-gradient(45deg,#6B6154,#6B6154 3px,#8C8375 3px,#8C8375 6px)';
      if (k === 'BELUM') { w = 'var(--surface)'; extra = 'border:1px dashed #C8C1B2;color:var(--slate)'; }
      if (k === 'IA' || k === 'F') extra = 'color:#2E2A24';
      return '<em><span class="kk" style="background:' + w + ';' + extra + '">' + (k === 'BELUM' ? '–' : k) +
        '</span>' + KODE[k].nama + '</em>';
    }).join('') + '<em><span class="kk" style="background:var(--foam)"></span>Bukan hari kerja</em>';
  }

  /* ================= RENDER: PEGAWAI ================= */
  function renderPegawai() {
    var list = pegawaiAktif(), pref = S.bulan;
    $('#pBody').innerHTML = list.map(function (p, i) {
      var c = { H: 0, sah: 0, bad: 0, belum: 0 };
      S.kehadiran.forEach(function (k) {
        if (k.pegawai_id !== p.id || k.tanggal.indexOf(pref) !== 0) return;
        var kat = KODE[k.kode] && KODE[k.kode].kategori;
        if (kat === 'hadir') c.H++; else if (kat === 'sah') c.sah++;
        else if (kat === 'tidak_sah') c.bad++; else if (kat === 'belum') c.belum++;
      });
      var wajib = c.H + c.bad + c.belum;
      var lo = wajib ? (c.H / wajib * 100).toFixed(1) : '–';
      var hi = wajib ? ((c.H + c.belum) / wajib * 100).toFixed(1) : '–';
      return '<tr><td>' + (i + 1) + '</td><td class="mono">' + (p.nip || '—') + '</td>' +
        '<td class="nm">' + esc(p.nama) + '</td><td class="ro">' + (p.golongan || '—') + '</td>' +
        '<td class="ro">' + esc(p.kelompok) + '</td><td class="tot">' + c.H + '</td><td>' + c.sah + '</td>' +
        '<td>' + c.bad + '</td><td>' + c.belum + '</td>' +
        '<td class="tot">' + (lo === hi ? lo + '%' : lo + '–' + hi + '%') + '</td></tr>';
    }).join('') || '<tr><td colspan="10" class="empty">Tidak ada pegawai.</td></tr>';
  }

  /* ================= ekspor ================= */
  function eksporCSV() {
    var p = S.bulan.split('-'), y = +p[0], m = +p[1] - 1, n = hariBulan(y, m);
    var rows = [['nip', 'nama', 'kelompok', 'golongan', 'tanggal', 'hari', 'hari_kerja', 'shift', 'kode', 'arti']];
    pegawaiAktif().forEach(function (pg) {
      for (var d = 1; d <= n; d++) {
        var s = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        var hk = isKerja(s);
        var k = hk ? (kodeDi(pg.id, s) || 'BELUM') : '';
        rows.push([pg.nip || '', pg.nama, pg.kelompok, pg.golongan || '', s, HARI[parse(s).getDay()],
                   hk ? 1 : 0, 'PAGI', k, k && KODE[k] ? KODE[k].nama : '']);
      }
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        c = String(c === null || c === undefined ? '' : c);
        return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(';');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kehadiran_' + S.bulan + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    toast('CSV terunduh · pemisah titik-koma');
  }

  /* ================= util UI ================= */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var tt;
  function toast(msg, bad) {
    clearTimeout(tt);
    var el = $('#toast');
    el.textContent = msg;
    el.style.background = bad ? '#C0473E' : '#0F4C4B';
    el.style.opacity = '1'; el.style.transform = 'translateY(0)';
    tt = setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 2600);
  }
  function pindah(v) {
    $$('.view').forEach(function (x) { x.classList.toggle('on', x.id === 'view-' + v); });
    $$('.nav button').forEach(function (b) {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#judul').textContent = $('.nav button[data-view="' + v + '"]').dataset.title;
    if (v === 'dashboard') renderDashboard();
    if (v === 'harian') renderHarian();
    if (v === 'rekap') renderRekap();
    if (v === 'pegawai') renderPegawai();
    location.hash = v;
  }
  function renderAll() {
    var v = (location.hash || '#dashboard').slice(1);
    pindah($('.nav button[data-view="' + v + '"]') ? v : 'dashboard');
  }

  /* ================= boot ================= */
  function boot() {
    // tema
    var th = localStorage.getItem('dk-theme') || 'light';
    document.documentElement.dataset.theme = th;
    $('#btnTheme').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('dk-theme', next);
      renderAll();
    });

    $('#brandNama').textContent = CFG.org.aplikasi;
    $('#brandOrg').textContent = CFG.org.nama;
    document.title = CFG.org.aplikasi + ' — ' + CFG.org.nama;
    $('#modeTag').innerHTML = 'Sumber data <b>' + API.mode + '</b>';

    $$('.nav button').forEach(function (b) {
      b.addEventListener('click', function () { pindah(b.dataset.view); });
    });
    ['#inTgl', '#hInTgl'].forEach(function (sel) {
      $(sel).addEventListener('change', function (e) {
        S.tanggal = e.target.value; S.bulan = S.tanggal.slice(0, 7);
        $('#inTgl').value = S.tanggal; $('#hInTgl').value = S.tanggal; $('#inBulan').value = S.bulan;
        muat();
      });
    });
    $('#inBulan').addEventListener('change', function (e) {
      S.bulan = e.target.value;
      var n = hariBulan(+S.bulan.slice(0, 4), +S.bulan.slice(5, 7) - 1);
      var hari = Math.min(+S.tanggal.slice(8), n);
      S.tanggal = S.bulan + '-' + String(hari).padStart(2, '0');
      $('#inTgl').value = S.tanggal; $('#hInTgl').value = S.tanggal;
      muat();
    });
    $('#inCari').addEventListener('input', function (e) { S.cari = e.target.value; renderAll(); });
    $('#inKelompok').addEventListener('change', function (e) { S.kelompok = e.target.value; renderAll(); });
    $('#btnCsv').addEventListener('click', eksporCSV);
    $('#btnCetak').addEventListener('click', function () { window.print(); });
    window.addEventListener('hashchange', renderAll);

    // tanggal awal: hari terakhir yang ada datanya, kalau tidak ada pakai hari ini
    Promise.all([API.pegawai(), API.sesi()]).then(function (res) {
      S.pegawai = res[0]; S.sesi = res[1] || { nama: 'Tamu', role: 'staf', pegawai_id: null };
      $('#whoNama').textContent = S.sesi.nama || S.sesi.email || 'Pengguna';
      $('#whoRole').textContent = ({ administrator: 'Administrator', pic_kehadiran: 'PIC Kehadiran',
        kepala: 'Kepala Puskesmas', staf: 'Staf' })[S.sesi.role] || S.sesi.role;
      $('#whoAv').textContent = (S.sesi.nama || 'P').trim().slice(0, 2).toUpperCase();

      var kel = {}; S.pegawai.forEach(function (p) { kel[p.kelompok] = 1; });
      $('#inKelompok').innerHTML = '<option value="">Semua kelompok</option>' +
        Object.keys(kel).map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('');

      var awal = (window.SAMPLE_DATA && window.SAMPLE_DATA.meta && API.mode === 'sample')
        ? window.SAMPLE_DATA.meta.bulan : iso(new Date()).slice(0, 7);
      S.bulan = awal;
      S.tanggal = awal + '-01';
      $('#inBulan').value = S.bulan;
      return muat(true);
    }).catch(gagal);
  }

  function muat(pilihTerakhir) {
    var y = +S.bulan.slice(0, 4), m = +S.bulan.slice(5, 7) - 1;
    var dari = S.bulan + '-01';
    var sampai = S.bulan + '-' + hariBulan(y, m);
    // ambil juga 40 hari sebelumnya untuk grafik tren
    var d0 = parse(dari); d0.setDate(d0.getDate() - 40);
    return API.kehadiran(iso(d0), sampai).then(function (rows) {
      S.kehadiran = rows; bangunMap();
      if (pilihTerakhir) {
        var ada = rows.filter(function (k) { return k.tanggal.indexOf(S.bulan) === 0 && k.kode; })
                      .map(function (k) { return k.tanggal; }).sort();
        if (ada.length) S.tanggal = ada[ada.length - 1];
        $('#inTgl').value = S.tanggal; $('#hInTgl').value = S.tanggal;
      }
      $('#loader').style.display = 'none';
      $('#shell').style.visibility = 'visible';
      renderAll();
    }).catch(gagal);
  }

  function gagal(e) {
    console.error(e);
    $('#loader').innerHTML = '<div style="max-width:520px;text-align:left">' +
      '<h2 style="margin:0 0 8px;font-size:16px;color:#C0473E">Gagal memuat data</h2>' +
      '<p style="margin:0 0 10px;font-size:13px">' + esc(e.message || String(e)) + '</p>' +
      '<p style="margin:0;font-size:12px;color:#7B7468">Mode aktif: <b>' + API.mode + '</b>. ' +
      'Periksa <code>assets/config.js</code>. Untuk uji tampilan, set <code>mode: \'sample\'</code>.</p></div>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

-- =====================================================================
-- Dashboard Kehadiran — skema Supabase (Postgres)
-- Jalankan seluruh isi file ini di Supabase → SQL Editor → New query.
-- =====================================================================

-- ---------- 1. Tabel referensi ----------
create table if not exists kode_status (
  kode      text primary key,
  nama      text not null,
  kategori  text not null check (kategori in ('hadir','sah','tidak_sah','belum')),
  sensitif  boolean not null default false,   -- true = data kesehatan / perlu pembatasan
  urutan    int  not null default 99
);

insert into kode_status (kode,nama,kategori,sensitif,urutan) values
  ('H','Hadir','hadir',false,1),
  ('TAP','Tidak apel pagi','tidak_sah',false,2),
  ('S','Sakit','sah',true,3),
  ('I','Izin','sah',false,4),
  ('C','Cuti','sah',false,5),
  ('IA','Izin apel','sah',false,6),
  ('F','Fakultatif','sah',false,7),
  ('TD','Tugas dinas','sah',false,8),
  ('DS','Dispensasi sekolah','sah',false,9),
  ('TK','Tanpa keterangan','tidak_sah',false,10),
  ('BELUM','Belum diinput','belum',false,11)
on conflict (kode) do nothing;

create table if not exists shift (
  kode          text primary key,
  nama          text not null,
  jam_mulai     time,
  toleransi_min int not null default 10
);
insert into shift (kode,nama,jam_mulai,toleransi_min) values
  ('PAGI','Apel pagi','07:30',10),
  ('SIANG','Piket siang','14:00',10),
  ('MALAM','Piket malam','21:00',10)
on conflict (kode) do nothing;

-- ---------- 2. Pegawai ----------
create table if not exists pegawai (
  id         uuid primary key default gen_random_uuid(),
  nip        text unique,
  nama       text not null,
  golongan   text,
  jabatan    text,
  kelompok   text not null check (kelompok in ('ASN','PPPK Penuh Waktu','PPPK Paruh Waktu','Non-ASN')),
  unit       text,
  aktif      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_pegawai_kelompok on pegawai(kelompok) where aktif;

-- ---------- 3. Profil pengguna (role) ----------
create table if not exists profil (
  id         uuid primary key references auth.users(id) on delete cascade,
  pegawai_id uuid references pegawai(id) on delete set null,
  nama       text,
  role       text not null check (role in ('administrator','pic_kehadiran','kepala','staf')),
  aktif      boolean not null default true
);

-- Helper: role pengguna aktif. SECURITY DEFINER + search_path aman,
-- supaya kebijakan RLS tidak memicu rekursi ke tabel profil.
create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profil where id = auth.uid() and aktif
$$;

create or replace function auth_pegawai_id() returns uuid
language sql stable security definer set search_path = public as $$
  select pegawai_id from profil where id = auth.uid() and aktif
$$;

create or replace function boleh_input() returns boolean
language sql stable as $$ select auth_role() in ('administrator','pic_kehadiran') $$;

-- ---------- 4. Kehadiran ----------
create table if not exists kehadiran (
  id           bigserial primary key,
  pegawai_id   uuid not null references pegawai(id) on delete cascade,
  tanggal      date not null,
  shift        text not null default 'PAGI' references shift(kode),
  kode         text not null default 'BELUM' references kode_status(kode),
  catatan      text,
  diinput_oleh uuid references auth.users(id),
  diubah_pada  timestamptz not null default now(),
  unique (pegawai_id, tanggal, shift)
);
create index if not exists idx_kehadiran_tanggal on kehadiran(tanggal);

-- ---------- 5. Audit trail ----------
create table if not exists audit_log (
  id          bigserial primary key,
  tabel       text not null,
  aksi        text not null,
  record_id   text,
  nilai_lama  jsonb,
  nilai_baru  jsonb,
  oleh        uuid,
  oleh_nama   text,
  role        text,
  pada        timestamptz not null default now()
);
create index if not exists idx_audit_pada on audit_log(pada desc);

create or replace function fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nama text;
begin
  select nama into v_nama from profil where id = auth.uid();
  insert into audit_log (tabel,aksi,record_id,nilai_lama,nilai_baru,oleh,oleh_nama,role)
  values (tg_table_name, tg_op,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          auth.uid(), v_nama, auth_role());
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit_kehadiran on kehadiran;
create trigger trg_audit_kehadiran after insert or update or delete on kehadiran
  for each row execute function fn_audit();

drop trigger if exists trg_audit_pegawai on pegawai;
create trigger trg_audit_pegawai after insert or update or delete on pegawai
  for each row execute function fn_audit();

-- Stempel siapa & kapan pada setiap tulisan
create or replace function fn_stamp() returns trigger
language plpgsql as $$
begin
  new.diinput_oleh := auth.uid();
  new.diubah_pada  := now();
  return new;
end $$;
drop trigger if exists trg_stamp_kehadiran on kehadiran;
create trigger trg_stamp_kehadiran before insert or update on kehadiran
  for each row execute function fn_stamp();

-- ---------- 6. Row Level Security ----------
alter table pegawai      enable row level security;
alter table profil       enable row level security;
alter table kehadiran    enable row level security;
alter table audit_log    enable row level security;
alter table kode_status  enable row level security;
alter table shift        enable row level security;

-- Referensi: semua pengguna terautentikasi boleh baca
drop policy if exists r_kode on kode_status;
create policy r_kode on kode_status for select to authenticated using (true);
drop policy if exists r_shift on shift;
create policy r_shift on shift for select to authenticated using (true);

-- Pegawai: semua boleh baca (transparansi); hanya admin boleh ubah
drop policy if exists r_pegawai on pegawai;
create policy r_pegawai on pegawai for select to authenticated using (true);
drop policy if exists w_pegawai on pegawai;
create policy w_pegawai on pegawai for all to authenticated
  using (auth_role() = 'administrator') with check (auth_role() = 'administrator');

-- Profil: lihat milik sendiri; admin lihat & kelola semua
drop policy if exists r_profil on profil;
create policy r_profil on profil for select to authenticated
  using (id = auth.uid() or auth_role() = 'administrator');
drop policy if exists w_profil on profil;
create policy w_profil on profil for all to authenticated
  using (auth_role() = 'administrator') with check (auth_role() = 'administrator');

-- Kehadiran: SEMUA role boleh baca seluruh baris (keputusan transparansi).
-- Hanya administrator & pic_kehadiran boleh menulis.
drop policy if exists r_kehadiran on kehadiran;
create policy r_kehadiran on kehadiran for select to authenticated using (true);
drop policy if exists i_kehadiran on kehadiran;
create policy i_kehadiran on kehadiran for insert to authenticated with check (boleh_input());
drop policy if exists u_kehadiran on kehadiran;
create policy u_kehadiran on kehadiran for update to authenticated
  using (boleh_input()) with check (boleh_input());
-- Tidak ada policy DELETE: baris kehadiran tidak boleh dihapus, hanya diubah.
-- Riwayat perubahannya tersimpan di audit_log.

-- Audit: hanya administrator & kepala puskesmas
drop policy if exists r_audit on audit_log;
create policy r_audit on audit_log for select to authenticated
  using (auth_role() in ('administrator','kepala'));
-- Tidak ada policy INSERT/UPDATE/DELETE: hanya trigger SECURITY DEFINER yang menulis,
-- sehingga log tidak bisa dipalsukan dari front-end.

-- ---------- 7. View penyamaran alasan ketidakhadiran ----------
-- Dipakai kalau kebijakan: staf melihat SEMUA pegawai, tapi alasan rinci
-- (khususnya S = sakit, data kesehatan menurut UU 27/2022) disamarkan.
-- Front-end tinggal membaca view ini, bukan tabel kehadiran.
create or replace view kehadiran_tampil
with (security_invoker = true) as
select k.id, k.pegawai_id, k.tanggal, k.shift,
       case
         when auth_role() in ('administrator','pic_kehadiran','kepala') then k.kode
         when k.pegawai_id = auth_pegawai_id() then k.kode
         when ks.kategori = 'sah' then 'BERIZIN'
         else k.kode
       end as kode,
       k.diubah_pada
from kehadiran k join kode_status ks on ks.kode = k.kode;

-- ---------- 8. Pembuatan baris harian ----------
-- Isi baris 'BELUM' untuk semua pegawai aktif pada satu tanggal,
-- supaya "belum diinput" terlihat eksplisit dan bukan sekadar baris hilang.
create or replace function siapkan_hari(p_tanggal date, p_shift text default 'PAGI')
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth_role() not in ('administrator','pic_kehadiran') then
    raise exception 'Tidak berwenang menyiapkan hari.';
  end if;
  insert into kehadiran (pegawai_id, tanggal, shift, kode)
  select p.id, p_tanggal, p_shift, 'BELUM' from pegawai p where p.aktif
  on conflict (pegawai_id, tanggal, shift) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 9. Rekap harian (dipakai dashboard & ekspor) ----------
create or replace view rekap_harian
with (security_invoker = true) as
select k.tanggal, k.shift,
       count(*)                                                        as total,
       count(*) filter (where ks.kategori = 'hadir')                    as hadir,
       count(*) filter (where ks.kategori = 'sah')                      as sah,
       count(*) filter (where ks.kategori = 'tidak_sah')                as tidak_sah,
       count(*) filter (where ks.kategori = 'belum')                    as belum,
       count(*) - count(*) filter (where ks.kategori = 'sah')           as wajib_apel
from kehadiran k join kode_status ks on ks.kode = k.kode
group by k.tanggal, k.shift;

-- =====================================================================
-- CATATAN
-- 1. Anon key aman dipakai di front-end HANYA karena RLS di atas aktif.
--    Jangan pernah menaruh service_role key di kode yang dikirim ke browser.
-- 2. Baris kehadiran tidak bisa dihapus dari front-end (tidak ada policy DELETE).
--    Koreksi dilakukan lewat UPDATE, dan nilai lamanya tersimpan di audit_log.
-- 3. Untuk mengaktifkan penyamaran alasan: ubah data.js agar membaca
--    'kehadiran_tampil' alih-alih 'kehadiran'.
-- =====================================================================

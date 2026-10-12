-- English with Kawthar — Supabase şeması (veri modeli v2: kişi + ders kaydı)
-- Supabase panelinde SQL Editor'e yapıştırıp bir kez çalıştır. Tekrar çalıştırmak güvenlidir (veri silmez).
-- Model açıklaması: web/src/domain.js dosyasının başı. ID'ler metin ("s_ali", "e_ali", "p_xxx" gibi).
--
-- Bu şemanın ilk sürümünü (v1, öğrenci = ders kaydı) daha önce çalıştırdıysan ve henüz gerçek veri yoksa,
-- önce şu satırı çalıştırıp tabloları sil, sonra bu dosyanın tamamını çalıştır:
--   drop table if exists public.notes, public.extras, public.events, public.payments, public.enrollments, public.students, public.classes, public.settings cascade;

-- ---------- kimler girebilir: izinli e-postalar ----------
-- Sisteme SADECE bu listedeki e-postalar girebilir (şimdilik Kevser Hanım ve İmran).
--  • Listede olmayan bir e-postayla hesap açılmak istenirse veritabanı reddeder (panelden eklense bile).
--  • Listedeki biri için hesap açılınca yetkisi (profiles) kendiliğinden tanımlanır.
--  • Biri listeden çıkarılırsa hesabı dursa bile o andan itibaren hiçbir veriye erişemez.
-- Bu tabloyu sadece SQL Editor (ve gizli anahtar) görebilir/değiştirebilir; uygulamadan erişilemez.
create table if not exists public.allowed_emails (
  email        text primary key,
  display_name text not null default '',
  role         text not null default 'admin' check (role in ('admin', 'hoca')),
  teacher_name text
);
alter table public.allowed_emails enable row level security;   -- politika yok = uygulamadan kimse okuyamaz

-- ÇALIŞTIRMADAN ÖNCE: iki e-postayı gerçek adreslerle değiştir.
insert into public.allowed_emails (email, display_name, role) values
  ('KEVSER_HANIM_EPOSTA@ornek.com', 'Kevser Hanım', 'admin'),
  ('IMRAN_EPOSTA@ornek.com', 'İmran', 'admin')
on conflict (email) do update set display_name = excluded.display_name, role = excluded.role;

-- ---------- roller ----------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         text not null check (role in ('admin', 'hoca')),
  teacher_name text            -- role = 'hoca' ise enrollments.teacher alanındaki adla aynı olmalı
);

-- Rol, ancak e-posta hâlâ izinli listedeyse geçerlidir.
create or replace function public.my_role() returns text
  language sql stable security definer set search_path = public
  as $$ select p.role from public.profiles p
          join auth.users u on u.id = p.user_id
          join public.allowed_emails a on lower(a.email) = lower(u.email)
         where p.user_id = auth.uid() $$;

create or replace function public.my_teacher_name() returns text
  language sql stable security definer set search_path = public
  as $$ select teacher_name from public.profiles where user_id = auth.uid() $$;

-- Liste dışı e-postayla hesap açılmasını engelle.
create or replace function public.guard_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails a where lower(a.email) = lower(new.email)) then
    raise exception 'Bu e-posta ile hesap açılamaz (izinli listede değil).';
  end if;
  return new;
end $$;
drop trigger if exists guard_new_user on auth.users;
create trigger guard_new_user before insert on auth.users for each row execute function public.guard_new_user();

-- Listedeki biri için hesap açılınca yetkisini kendiliğinden tanımla.
create or replace function public.profile_for_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, role, teacher_name)
  select new.id, a.display_name, a.role, a.teacher_name from public.allowed_emails a where lower(a.email) = lower(new.email)
  on conflict (user_id) do update set display_name = excluded.display_name, role = excluded.role, teacher_name = excluded.teacher_name;
  return new;
end $$;
drop trigger if exists profile_for_new_user on auth.users;
create trigger profile_for_new_user after insert on auth.users for each row execute function public.profile_for_new_user();

-- Bu dosya çalıştırılmadan önce açılmış hesaplar varsa onların yetkisini de listeye göre tanımla.
insert into public.profiles (user_id, display_name, role, teacher_name)
select u.id, a.display_name, a.role, a.teacher_name from auth.users u join public.allowed_emails a on lower(a.email) = lower(u.email)
on conflict (user_id) do update set display_name = excluded.display_name, role = excluded.role, teacher_name = excluded.teacher_name;

-- ---------- veri ----------
create table if not exists public.classes (
  id         text primary key,
  name       text not null,
  kind       text not null default 'grup',      -- ayarlardaki ders türü anahtarı
  color      text not null default 'gri',
  capacity   integer not null default 0,
  slots      jsonb not null default '[]',        -- [{ day: 1-7, start: "HH:MM", end: "HH:MM" }]
  updated_at timestamptz not null default now()
);

-- Kişi. Bir kişinin birden çok ders kaydı olabilir.
create table if not exists public.students (
  id          text primary key,
  name        text not null,
  parent_name text not null default '',
  phone       text not null default '',
  start_date  date,
  notes       text not null default '',
  active      boolean not null default true,      -- ayrılan öğrenci silinmez, false yapılır
  updated_at  timestamptz not null default now()
);

-- Kişinin bir derse kaydı: hoca, ücret ve ödeme düzeni buradadır.
create table if not exists public.enrollments (
  id                text primary key,
  student_id        text not null references public.students(id) on delete restrict,
  class_id          text references public.classes(id) on delete set null,
  teacher           text not null default '',
  teacher_share     numeric not null default 0,
  rate              numeric not null default 0,
  rate_unit         text not null default 'saat' check (rate_unit in ('saat', 'hafta')),
  pay_mode          text not null default 'aylik' check (pay_mode in ('aylik', 'haftalik', 'paket')),
  pay_amount        numeric,
  pay_due_day       integer,
  pay_package_hours numeric,
  start_date        date,
  active            boolean not null default true, -- dersi bıraktıysa false
  updated_at        timestamptz not null default now()
);

create table if not exists public.payments (
  id                text primary key,
  student_id        text not null references public.students(id) on delete restrict,
  enrollment_id     text not null references public.enrollments(id) on delete restrict,
  date              date not null,
  amount            numeric not null check (amount > 0),
  mode              text not null check (mode in ('aylik', 'haftalik', 'paket')),
  period            text,     -- aylik: YYYY-MM, haftalik: haftanın Pazartesi'si YYYY-MM-DD
  hours             numeric,  -- paket
  label             text not null default '',
  note              text not null default '',
  teacher           text not null default '',
  teacher_cut       numeric not null default 0,
  teacher_paid      boolean not null default false,
  teacher_paid_date date,
  partial           boolean not null default false,  -- kısmi ödeme: dönem kapanmaz, kalanı beklenir
  rest_due          date,                            -- kısmi ödemede kalanın son günü
  updated_at        timestamptz not null default now()
);

-- Haftalık programdaki bir dersin istisnası (iptal / gelmedi).
create table if not exists public.events (
  id         text primary key,  -- {classId}_{YYYY-MM-DD}_{HHMM}
  class_id   text not null references public.classes(id) on delete cascade,
  date       date not null,
  start      text not null,
  cancelled  boolean not null default false,
  absent     jsonb not null default '{}',   -- { studentId: "sayilir" | "sayilmaz" }
  updated_at timestamptz not null default now()
);

-- Programa bağlı olmayan tek seferlik ders (telafi / ekstra).
create table if not exists public.extras (
  id          text primary key,
  class_id    text not null references public.classes(id) on delete cascade,
  date        date not null,
  start_time  text not null,
  end_time    text not null,
  type        text not null default 'ekstra' check (type in ('telafi', 'ekstra')),
  student_ids jsonb not null default '[]',
  note        text not null default '',
  cancelled   boolean not null default false,
  absent      jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- Günlük notlar (Notlar sayfası).
create table if not exists public.notes (
  id         text primary key,
  date       date not null,
  text       text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ayarlar (tek satır: id = 'main'): ders türleri, hocalar, varsayılan ücretler.
create table if not exists public.settings (
  id         text primary key,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists enrollments_student_idx on public.enrollments(student_id);
create index if not exists enrollments_class_idx on public.enrollments(class_id);
create index if not exists enrollments_teacher_idx on public.enrollments(teacher);
create index if not exists payments_enrollment_idx on public.payments(enrollment_id);
create index if not exists payments_student_idx on public.payments(student_id);
create index if not exists payments_date_idx on public.payments(date);
create index if not exists events_class_date_idx on public.events(class_id, date);
create index if not exists extras_class_date_idx on public.extras(class_id, date);
create index if not exists notes_date_idx on public.notes(date);

create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['classes', 'students', 'enrollments', 'payments', 'events', 'extras', 'settings', 'notes'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- yetki (Row Level Security) ----------
-- admin: her şeyi okur ve yazar.
-- hoca (ileride): sadece kendi ders kayıtlarını, o öğrencileri, ödemelerini, derslerini ve istisnalarını OKUR. Yazamaz. Ayarları ve notları göremez.
-- Giriş yapmamış biri hiçbir şey göremez.
alter table public.profiles enable row level security;
do $$ declare t text; begin
  foreach t in array array['classes', 'students', 'enrollments', 'payments', 'events', 'extras', 'settings', 'notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.my_role() = ''admin'') with check (public.my_role() = ''admin'')', t);
    execute format('drop policy if exists hoca_read on public.%I', t);
  end loop;
end $$;

drop policy if exists profiles_self  on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_self  on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_admin on public.profiles for all    to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create policy hoca_read on public.enrollments for select to authenticated
  using (public.my_role() = 'hoca' and teacher = public.my_teacher_name());
create policy hoca_read on public.students for select to authenticated
  using (public.my_role() = 'hoca' and exists (
    select 1 from public.enrollments e where e.student_id = students.id and e.teacher = public.my_teacher_name()));
create policy hoca_read on public.payments for select to authenticated
  using (public.my_role() = 'hoca' and teacher = public.my_teacher_name());
create policy hoca_read on public.classes for select to authenticated
  using (public.my_role() = 'hoca' and exists (
    select 1 from public.enrollments e where e.class_id = classes.id and e.teacher = public.my_teacher_name()));
create policy hoca_read on public.events for select to authenticated
  using (public.my_role() = 'hoca' and exists (
    select 1 from public.enrollments e where e.class_id = events.class_id and e.teacher = public.my_teacher_name()));
create policy hoca_read on public.extras for select to authenticated
  using (public.my_role() = 'hoca' and exists (
    select 1 from public.enrollments e where e.class_id = extras.class_id and e.teacher = public.my_teacher_name()));

-- ---------- canlı güncelleme ----------
-- İki telefon aynı anda açıkken birinin yaptığı değişiklik diğerinde de görünsün.
do $$ declare t text; begin
  foreach t in array array['classes', 'students', 'enrollments', 'payments', 'events', 'extras', 'settings', 'notes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- hesapları açma ----------
-- 1) Bu dosyanın başındaki allowed_emails listesine iki gerçek e-postayı yaz ve dosyayı çalıştır.
-- 2) Authentication > Sign In / Providers: "Allow new users to sign up" KAPALI olsun (ek güvenlik; liste zaten engelliyor).
-- 3) Authentication > Users > "Add user" ile Kevser Hanım'ı ve İmran'ı ekle (e-posta + şifre, "Auto Confirm User" işaretli).
--    Yetkileri kendiliğinden tanımlanır; ayrıca SQL yazmaya gerek yok.
--
-- Kontrol: select u.email, p.role from auth.users u left join public.profiles p on p.user_id = u.id;
-- İleride biri eklenecekse önce allowed_emails'e ekle, sonra panelden hesabını aç.
-- Birinin erişimini kesmek için: delete from public.allowed_emails where email = '...';

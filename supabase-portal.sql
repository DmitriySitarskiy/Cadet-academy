-- Виконайте один раз у Supabase: SQL Editor -> New query -> Run.
-- Окремі таблиці для даних порталу (офіцери, кадрові аудити, звіти складу).
-- Рядки маленькі й додаються по одному, тому навантаження на базу мінімальне.

create table if not exists public.officers (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_audits (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists hr_audits_created_idx on public.hr_audits (created_at desc);

create table if not exists public.craft_reports (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists craft_reports_created_idx on public.craft_reports (created_at desc);

-- Доступ лише з нашого сервера. Так само, як і таблиця app_state.
-- Порада: на Render краще використовувати service_role ключ (змінна SUPABASE_KEY) замість anon.
alter table public.officers disable row level security;
alter table public.hr_audits disable row level security;
alter table public.craft_reports disable row level security;

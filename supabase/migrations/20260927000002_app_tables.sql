-- 設定と権限の表（詳細仕様 01 章 §2.2）
create table public.app_settings (
  id                boolean primary key default true check (id),   -- 1 行だけ
  allowlist_enabled boolean not null default false,
  daily_post_limit  integer not null default 5 check (daily_post_limit between 0 and 100)
);
insert into public.app_settings default values;

create table public.app_admins (
  uid        uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.app_allowlist (
  uid        uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 日ごとの投稿数。削除しても枠が戻らないように別に数える（Q-10）
create table public.post_quota (
  uid   uuid    not null references auth.users (id) on delete cascade,
  day   date    not null,                -- UTC の日付
  count integer not null default 0 check (count >= 0),
  primary key (uid, day)
);

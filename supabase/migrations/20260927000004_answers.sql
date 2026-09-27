-- 回答と集計（詳細仕様 01 章 §2.4）
create table public.answers (
  post_id    uuid not null references public.posts (id) on delete cascade,
  uid        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  paint      bytea not null check (octet_length(paint) = 676),
  size       public.bb_amount,
  primary key (post_id, uid)             -- 1 ユーザー 1 スポット 1 件（仕様書 §7.3）
);

create table public.post_aggregates (
  post_id uuid primary key references public.posts (id) on delete cascade,
  n       integer not null default 0 check (n >= 0),
  cells   bytea   not null default decode(repeat('00', 1690), 'hex')
            check (octet_length(cells) = 1690)
);

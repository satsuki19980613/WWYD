-- 投稿（詳細仕様 01 章 §2.3）
create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  author_uid      uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  title           text not null
                    check (title = btrim(title) and char_length(title) between 1 and 40),
  fmt             text not null check (fmt in ('cash', 'mtt')),
  hero            public.pos not null,
  villain         public.pos not null,
  street          public.street not null,
  effective_stack public.bb_amount not null check (effective_stack > 0),
  keys            text[] not null
                    check (array_to_string(keys, ',') in ('fold,call,s1', 'fold,call', 'check,s1', 'check')),
  s1_label        text check (s1_label in ('raise', 'bet')),
  min_to          public.bb_amount,
  max_to          public.bb_amount,
  pot_base        public.bb_amount not null check (pot_base > 0),
  answer_count    integer not null default 0 check (answer_count >= 0),

  constraint posts_hero_ne_villain check (hero <> villain),
  constraint posts_s1_meta check (
    case when 's1' = any (keys)
      then s1_label is not null and min_to is not null and max_to is not null and min_to <= max_to
      else s1_label is null and min_to is null and max_to is null
    end
  )
);

create table public.post_hands (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  sb         public.bb_amount not null check (sb > 0),
  bb         public.bb_amount not null check (bb = 1),          -- Q-4: BB は 1bb 固定
  ante       public.bb_amount not null default 0,
  rake       numeric(5, 2) check (rake between 0 and 100),       -- MTT では null
  stacks     jsonb not null check (jsonb_typeof(stacks) = 'object'),   -- {"UTG": 100, ...}（bb）
  board      text[] not null default '{}' check (cardinality(board) in (0, 3, 4, 5)),
  actions    jsonb not null check (jsonb_typeof(actions) = 'array'),  -- [{street,pos,type,to?}]
  spot_index integer not null check (spot_index >= 0),        -- 出題する Hero のアクションの添字
  stop_index integer not null,                                -- 停止位置（Edge Function が算出）
  constraint post_hands_sb_le_bb check (sb <= bb),
  constraint post_hands_stop_after_spot check (stop_index > spot_index)
);

-- Hero のハンドと known_cards。閲覧制限（仕様書 §7.6）を RLS の行単位で強制するため別表
create table public.post_secrets (
  post_id     uuid primary key references public.posts (id) on delete cascade,
  hero_cards  text[] not null check (cardinality(hero_cards) = 2),
  known_cards jsonb  not null default '{}'::jsonb check (jsonb_typeof(known_cards) = 'object')
);

create table public.host_answers (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  paint      bytea not null check (octet_length(paint) = 676),
  size       public.bb_amount,
  updated_at timestamptz not null default now()
);

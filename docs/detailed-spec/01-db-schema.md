# 01 DB スキーマ

仕様書 §7 の論理形式を Supabase（Postgres 15 以降）の物理スキーマにしたもの。マイグレーションは
`supabase/migrations/` に置き、この章の DDL をそのまま最初のマイグレーション群にする。

> **2026-09-28**: `host_answers`（Hero の想定レンジ）は廃止した。投稿者も `answers` に回答する（02 章冒頭の注記、マイグレーション `20260928000000_author_answers.sql`）。

---

## 1. 論理形式との対応

| 仕様書（論理） | 物理 | 理由 |
|---|---|---|
| posts | `public.posts` | そのまま |
| post_hands（`hero_cards`・`known_cards`・`host_answer` 以外） | `public.post_hands` | そのまま |
| post_hands.`hero_cards`・`known_cards` | `public.post_secrets` | 閲覧制限（§7.6）を RLS の行単位で強制するため、別表に分ける（仕様書の「ビューまたは RPC で分離」の実装） |
| post_hands.`host_answer` | `public.host_answers` | 閲覧制限と更新権限が post_hands と違うため別表 |
| answers | `public.answers` | そのまま |
| post_aggregates | `public.post_aggregates` | そのまま |
| 管理者 UID の設定表（§7.6） | `public.app_admins` | |
| 許可リスト（§3「利用者限定に切り替える」） | `public.app_allowlist` ＋ `public.app_settings.allowlist_enabled` | 切り替えを SQL 1 行でできるように、最初から仕組みだけ入れておく（既定は無効）【Q-20】 |
| 投稿上限の数え方 | `public.post_quota` | 削除しても枠が戻らないように、日ごとの投稿数を別に数える【Q-10】 |

- **プレイヤー名・表示名・メールアドレスを置く列はどこにも作らない**（CLAUDE.md 不変条件 6）。
- ユーザーの識別は `auth.users.id`（UUID）のみ。プロフィール表は作らない。

## 2. DDL

### 2.1 型と共通定義（`0001_types.sql`）

```sql
create domain public.pos as text
  check (value in ('UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'));

create domain public.street as text
  check (value in ('pf', 'flop', 'turn', 'river'));

-- bb 単位の金額。小数第 3 位まで（04 章 §1）
create domain public.bb_amount as numeric(9, 3)
  check (value >= 0);
```

### 2.2 設定と権限の表（`0002_app_tables.sql`）

```sql
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

create table public.post_quota (
  uid   uuid    not null references auth.users (id) on delete cascade,
  day   date    not null,                -- UTC の日付
  count integer not null default 0 check (count >= 0),
  primary key (uid, day)
);
```

### 2.3 投稿（`0003_posts.sql`）

```sql
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
  bb         public.bb_amount not null check (bb = 1),          -- 【Q-4】BB は 1bb 固定
  ante       public.bb_amount not null default 0,
  rake       numeric(5, 2) check (rake between 0 and 100),       -- MTT では null
  stacks     jsonb not null check (jsonb_typeof(stacks) = 'object'),   -- {"UTG": 100, ...}（bb）
  board      text[] not null default '{}' check (cardinality(board) in (0, 3, 4, 5)),
  actions    jsonb not null check (jsonb_typeof(actions) = 'array'),  -- [{street,pos,type,to?}]
  spot_index integer not null check (spot_index >= 0),        -- 出題する Hero のアクションの添字
  stop_index integer not null,                                -- 停止位置（Villain の最初のアクションの添字。Edge Function が算出）
  constraint post_hands_sb_le_bb check (sb <= bb),
  constraint post_hands_stop_after_spot check (stop_index > spot_index)
);

create table public.post_secrets (
  post_id     uuid primary key references public.posts (id) on delete cascade,
  hero_cards  text[] not null check (cardinality(hero_cards) = 2),
  known_cards jsonb  not null default '{}'::jsonb check (jsonb_typeof(known_cards) = 'object')
                                         -- {"BB": ["Ks","Js"], "CO": "muck"}
);

create table public.host_answers (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  paint      bytea not null check (octet_length(paint) = 676),
  size       public.bb_amount,
  updated_at timestamptz not null default now()
);
```

- カード文字列・アクションの中身・スタックの中身の厳密な検査は Edge Function（03 章）で行う。
  DB は形（配列・オブジェクト・枚数）だけを制約する。posts への挿入経路は `insert_post` RPC（service_role 専用）だけなので、
  Edge Function を経ない行は入らない。

### 2.4 回答と集計（`0004_answers.sql`）

```sql
create table public.answers (
  post_id    uuid not null references public.posts (id) on delete cascade,
  uid        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  paint      bytea not null check (octet_length(paint) = 676),
  size       public.bb_amount,
  primary key (post_id, uid)             -- 1 ユーザー 1 スポット 1 件（§7.3）
);

create table public.post_aggregates (
  post_id uuid primary key references public.posts (id) on delete cascade,
  n       integer not null default 0 check (n >= 0),
  cells   bytea   not null default decode(repeat('00', 1690), 'hex')
            check (octet_length(cells) = 1690)
);
```

## 3. 外部キーとカスケード

```
auth.users ─┬─< posts (author_uid)  ON DELETE CASCADE
            ├─< answers (uid)       ON DELETE CASCADE
            ├─< app_admins / app_allowlist / post_quota  ON DELETE CASCADE
posts ──────┬─< post_hands          ON DELETE CASCADE
            ├─< post_secrets        ON DELETE CASCADE
            ├─< host_answers        ON DELETE CASCADE
            ├─< answers (post_id)   ON DELETE CASCADE
            └─< post_aggregates     ON DELETE CASCADE
```

- **投稿削除**（§5.5）: クライアントは `posts` の行を 1 つ消すだけ。残りはカスケードで消える。
- **アカウント削除**（§3, §7.6）: `delete_my_account` RPC（02 章）が、①本人の回答を消す（トリガで他人の投稿の集計と `answer_count` を減算）、
  ②本人の投稿を消す（カスケード）、③ `auth.users` の行を消す、の順に行う。③のカスケードは保険（①②で既に空）。
- 回答の削除トリガは「投稿がまだ存在するときだけ減算」する（投稿削除のカスケードでは減算しない。02 章 §3.3）。

## 4. インデックス

```sql
-- 一覧（§5.1）: 新着順 / 回答数順 × ストリートあり・なし。キーセットページングに合わせて id まで含める
create index posts_new_idx          on public.posts (created_at desc, id desc);
create index posts_many_idx         on public.posts (answer_count desc, created_at desc, id desc);
create index posts_street_new_idx   on public.posts (street, created_at desc, id desc);
create index posts_street_many_idx  on public.posts (street, answer_count desc, created_at desc, id desc);
-- 自分の投稿タブ、アカウント削除、投稿上限
create index posts_author_idx       on public.posts (author_uid, created_at desc, id desc);
-- 自分の回答（一覧の「回答済み」判定、アカウント削除）
create index answers_uid_idx        on public.answers (uid, post_id);
```

- `answers` の主キー `(post_id, uid)` が「その投稿に自分の回答があるか」の判定にも効く。
- 想定規模（100 人・月 1,000 投稿）では、回答数順のインデックスの更新コストは問題にならない。

## 5. 容量の見積もり（§7.5 の確認）

| 表 | 1 行 | 月あたり（100 人 × 10 投稿 × 30 回答） |
|---|---|---|
| posts + post_hands + post_secrets | 約 1.5〜3KB | 約 3MB |
| answers | 約 0.7KB（paint 676B + 行ヘッダ・索引） | 約 21MB |
| post_aggregates | 約 1.7KB | 約 2MB |
| host_answers | 約 0.7KB | 1MB 未満 |

仕様書の見積もり（月約 26MB、無料枠 500MB で約 1 年半）と一致する。使用量 70% での整理は `admin_delete_unanswered_posts`（02 章 §4.7）を管理者が実行する。

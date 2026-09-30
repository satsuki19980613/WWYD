# 02 RLS・トリガ・RPC

> **2026-09-29: 出題を Hero の手番に変え、Villain の概念をなくした**（[16 章](16-hero-spot.md)）。この章の Villain・停止位置・派生メタの記述より 16 章を優先する。

> **2026-09-30: Villain の情報（Reads）と MTT の情報を足した**（[18 章](18-villain-reads-mtt.md)）。`insert_post`・`get_post_detail`（回答の前でも返す）・`list_posts`（`has_reads`・`has_mtt`）の変更は 18 章 §4。

仕様書 §7.6 の全文を SQL にしたもの。前提は 01 章の DDL。すべての SECURITY DEFINER 関数は
`set search_path = ''` とし、名前はスキーマ付きで書く（検索パスの乗っ取り対策）。

エラーは `raise exception using errcode = 'P0001', message = '<code>'` で返す。PostgREST は
HTTP 400 と `message` にコードを載せて返すので、フロントエンドは 06 章のエラーコード表で日本語にする。
主キー違反（SQLSTATE `23505`）は `already_answered` として扱う。

> **2026-09-28 の変更（さつきの決定。マイグレーション `20260928000000_author_answers.sql`）**: Hero の想定レンジを廃止し、
> **投稿者も自分の投稿に `answers` で回答する**（集計に入る。1 回だけ・変更不可）。この章の DDL に残る `host_answers`・
> `save_host_answer`・`own_post`（投稿者の回答の拒否）は廃止。変更点:
> - `answers_before_insert` から `own_post` を外し、`answers_insert` のポリシーから投稿者の除外を外した。
> - 集計（`post_aggregates` と `get_post_detail` の `aggregate`）は**回答済みの人だけ**（投稿者も回答してから）。新しい関数 `can_view_aggregate`。
>   Hero のハンド・known_cards・全アクションは、これまでどおり投稿者本人か回答済み（`can_view_results`）。
> - `get_post_detail` に `answered`（自分が回答済みか）を足し、`host_answer` を外した。
> - `admin_delete_unanswered_posts` は「投稿者本人以外の回答が無い投稿」を消す。
> - 既存の `host_answers` の行は、投稿者の回答として `answers` に移した（集計にも加わる）。

---

## 1. 共通関数（`0005_helpers.sql`）

```sql
create or replace function public.fail(p_code text)
returns void language plpgsql immutable as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end $$;

-- 利用を許可されたユーザーか（許可リストが有効なら、リストか管理者に載っている必要がある）
create or replace function public.is_allowed_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and (
    not (select s.allowlist_enabled from public.app_settings s)
    or exists (select 1 from public.app_allowlist a where a.uid = p_uid)
    or exists (select 1 from public.app_admins m where m.uid = p_uid)
  );
$$;

create or replace function public.is_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_allowed_uid(auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins m where m.uid = auth.uid());
$$;

-- 集計・Hero のハンド・known_cards・Hero の想定レンジを見てよいか（投稿者本人か、回答済み）
create or replace function public.can_view_results(p_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_allowed() and (
    exists (select 1 from public.posts p where p.id = p_post_id and p.author_uid = auth.uid())
    or exists (select 1 from public.answers a where a.post_id = p_post_id and a.uid = auth.uid())
  );
$$;

create or replace function public.bytea_hex(p bytea)
returns text language sql immutable as $$
  select '\x' || encode(p, 'hex');
$$;
```

### 1.1 paint の検証（05 章 §2.3 と同じ規則）

> **実装での修正（2026-09-27、T-302）**: 下の SQL はマスごとに値域・合法キー・合計を混ぜて判定しているため、違反が複数あると
> 05 章 §2.3 の順（値域 → 合法キー → 合計 → 空、それぞれ全マスについて）や TS の `validatePaintBytes` と結果が変わる。
> マイグレーション（`20260927000006_helpers.sql`）では 05 章の順に全マスを判定する形にした。共有テストベクタ（DB-06）で一致を確認済み。

```sql
-- 戻り値: s1 を 1 マスでも使っているか
create or replace function public.validate_paint(p_paint bytea, p_keys text[])
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  legal    boolean[] := array['fold' = any (p_keys), 'check' = any (p_keys),
                              'call' = any (p_keys), 's1'    = any (p_keys)];
  i int; k int; b int; s int;
  uses_s1  boolean := false;
  nonempty boolean := false;
begin
  if p_paint is null or octet_length(p_paint) <> 676 then perform public.fail('paint_length'); end if;
  for i in 0..168 loop
    s := 0;
    for k in 0..3 loop
      b := get_byte(p_paint, i * 4 + k);
      if b > 20 then perform public.fail('paint_value'); end if;
      if b > 0 and not legal[k + 1] then perform public.fail('paint_illegal_key'); end if;
      if k = 3 and b > 0 then uses_s1 := true; end if;
      s := s + b;
    end loop;
    if s <> 0 and s <> 20 then perform public.fail('paint_sum'); end if;
    if s = 20 then nonempty := true; end if;
  end loop;
  if not nonempty then perform public.fail('paint_empty'); end if;
  return uses_s1;
end $$;

create or replace function public.check_size(p_uses_s1 boolean, p_size numeric, p_min numeric, p_max numeric)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_uses_s1 then
    if p_size is null or p_min is null or p_size < p_min or p_size > p_max then
      perform public.fail('size_out_of_range');
    end if;
  elsif p_size is not null then
    perform public.fail('size_not_allowed');
  end if;
end $$;
```

> `size` 列は `numeric(9,3)` なので、第 4 位以下は代入時に丸められる。小数桁の厳密な拒否はフロントエンド（`validatePaint`）で行う。

### 1.2 集計への加減算（05 章 §3）

```sql
create or replace function public.apply_answer_to_aggregate(p_post_id uuid, p_paint bytea, p_sign int)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  c bytea; i int; k int; b int; s int; o int; v int;
begin
  select g.cells into c from public.post_aggregates g where g.post_id = p_post_id for update;
  if not found then return; end if;
  for i in 0..168 loop
    s := get_byte(p_paint, i*4) + get_byte(p_paint, i*4+1) + get_byte(p_paint, i*4+2) + get_byte(p_paint, i*4+3);
    continue when s = 0;
    o := i * 10;
    v := get_byte(c, o) * 256 + get_byte(c, o + 1) + p_sign;
    if v < 0 or v > 65535 then perform public.fail('aggregate_overflow'); end if;
    c := set_byte(set_byte(c, o, v >> 8), o + 1, v & 255);
    for k in 0..3 loop
      b := get_byte(p_paint, i * 4 + k);
      continue when b = 0;
      v := get_byte(c, o + 2 + k * 2) * 256 + get_byte(c, o + 3 + k * 2) + p_sign * b;
      if v < 0 or v > 65535 then perform public.fail('aggregate_overflow'); end if;
      c := set_byte(set_byte(c, o + 2 + k * 2, v >> 8), o + 3 + k * 2, v & 255);
    end loop;
  end loop;
  update public.post_aggregates g set cells = c, n = g.n + p_sign where g.post_id = p_post_id;
end $$;
```

`for update` で集計行をロックするため、同じ投稿への同時回答は直列に処理される。

## 2. RLS と権限（`0006_rls.sql`）

```sql
alter table public.app_settings    enable row level security;
alter table public.app_admins      enable row level security;
alter table public.app_allowlist   enable row level security;
alter table public.post_quota      enable row level security;
alter table public.posts           enable row level security;
alter table public.post_hands      enable row level security;
alter table public.post_secrets    enable row level security;
alter table public.host_answers    enable row level security;
alter table public.answers         enable row level security;
alter table public.post_aggregates enable row level security;

-- Supabase の既定の付与を取り消し、必要な権限だけ与える
-- 【実装での修正（2026-09-27、T-302）】下の revoke は「作成済み」の関数にしか効かない。Postgres は新しい関数に PUBLIC の
-- 実行権限を付け、これはスキーマ単位の既定権限（alter default privileges … in schema）では取り消せない。
-- そのままでは §3・§4 で後から作る関数（insert_post を含む）が anon から実行できてしまう（DB-01 のテストで検出）。
-- マイグレーションでは、関数を作るたびにその場で `revoke all on function … from public, anon, authenticated` し、
-- 必要な付与だけを行う。表・シーケンスは `alter default privileges for role postgres in schema public revoke …` で防ぐ。
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select, delete on public.posts           to authenticated;
grant select         on public.post_secrets    to authenticated;
grant select         on public.host_answers    to authenticated;
grant select         on public.post_aggregates to authenticated;
grant select, insert on public.answers         to authenticated;
-- post_hands は【Q-9】推奨案では直接の select を与えない（get_post_detail 経由のみ）。
-- 仕様書どおり（全件読める）にする場合は: grant select on public.post_hands to authenticated;

-- posts: 認証済み（かつ許可済み）は全件読める。挿入・更新のポリシーは作らない（挿入は insert_post RPC のみ）
create policy posts_select on public.posts
  for select to authenticated using (public.is_allowed());
create policy posts_delete on public.posts
  for delete to authenticated
  using (public.is_allowed() and (author_uid = (select auth.uid()) or public.is_admin()));

-- post_hands:【Q-9】仕様書どおりにする場合だけ有効にする
-- create policy post_hands_select on public.post_hands
--   for select to authenticated using (public.is_allowed());

-- Hero のハンド・known_cards / Hero の想定レンジ / 集計: 投稿者本人か回答済みのみ
create policy post_secrets_select on public.post_secrets
  for select to authenticated using (public.can_view_results(post_id));
create policy host_answers_select on public.host_answers
  for select to authenticated using (public.can_view_results(post_id));
create policy post_aggregates_select on public.post_aggregates
  for select to authenticated using (public.can_view_results(post_id));

-- answers: 読むのは自分の行だけ。挿入は本人のみ・投稿者本人は不可。更新・削除のポリシーは作らない
create policy answers_select on public.answers
  for select to authenticated using (uid = (select auth.uid()));
create policy answers_insert on public.answers
  for insert to authenticated
  with check (
    uid = (select auth.uid())
    and public.is_allowed()
    and not exists (select 1 from public.posts p where p.id = post_id and p.author_uid = (select auth.uid()))
  );

-- app_settings / app_admins / app_allowlist / post_quota: authenticated にはポリシーなし（読めない・書けない）。
-- 管理者は Supabase ダッシュボードの SQL エディタ（postgres ロール）で操作する（10 章）。

-- ポリシーから呼ぶ関数と RPC の実行権限
grant execute on function public.is_allowed()              to authenticated;
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.can_view_results(uuid)    to authenticated;
```

| 表 | select | insert | update | delete |
|---|---|---|---|---|
| posts | 許可済み全員 | なし（`insert_post` RPC） | なし | 本人・管理者 |
| post_hands | なし（`get_post_detail`）【Q-9】 | なし | なし | カスケード |
| post_secrets | 本人・回答済み | なし | なし | カスケード |
| host_answers | 本人・回答済み | なし（`save_host_answer`） | なし | カスケード |
| answers | 自分の行 | 本人（投稿者以外） | なし | カスケード・`delete_my_account` |
| post_aggregates | 本人・回答済み | なし（`insert_post`） | なし（トリガ） | カスケード |
| app_* / post_quota | なし | なし | なし | なし |

## 3. トリガ（`0007_triggers.sql`）

### 3.1 回答の挿入前: 検証（§5.3.8）

```sql
create or replace function public.answers_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.posts;
  uses_s1 boolean;
begin
  new.uid := auth.uid();           -- クライアントの値を信用しない
  new.created_at := now();
  if new.uid is null then perform public.fail('not_authenticated'); end if;
  select * into p from public.posts where id = new.post_id;
  if not found then perform public.fail('post_not_found'); end if;
  if p.author_uid = new.uid then perform public.fail('own_post'); end if;
  uses_s1 := public.validate_paint(new.paint, p.keys);
  perform public.check_size(uses_s1, new.size, p.min_to, p.max_to);
  return new;
end $$;

create trigger answers_before_insert
  before insert on public.answers
  for each row execute function public.answers_before_insert();
```

既存の回答があれば主キー `(post_id, uid)` で挿入が失敗する（`23505` → `already_answered`）。

### 3.2 回答の挿入後: 集計と回答数の加算

```sql
create or replace function public.answers_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_answer_to_aggregate(new.post_id, new.paint, 1);
  update public.posts set answer_count = answer_count + 1 where id = new.post_id;
  return null;
end $$;

create trigger answers_after_insert
  after insert on public.answers
  for each row execute function public.answers_after_insert();
```

### 3.3 回答の削除後: 減算（アカウント削除のときだけ効く）

```sql
create or replace function public.answers_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 投稿削除のカスケードでは投稿がもう無いので何もしない（集計行も同時に消える）
  if exists (select 1 from public.posts where id = old.post_id) then
    perform public.apply_answer_to_aggregate(old.post_id, old.paint, -1);
    update public.posts set answer_count = answer_count - 1 where id = old.post_id;
  end if;
  return null;
end $$;

create trigger answers_after_delete
  after delete on public.answers
  for each row execute function public.answers_after_delete();
```

### 3.4 更新の禁止（保険）

`answers`・`posts` には update の権限もポリシーも無いが、service_role や SQL エディタからの誤操作を防ぐため、
`answers` の update と、`posts` の `answer_count` 以外の列の update をトリガで拒否する。

```sql
create or replace function public.forbid_update()
returns trigger language plpgsql as $$
begin
  perform public.fail('update_forbidden');
  return null;
end $$;

create trigger answers_no_update before update on public.answers
  for each row execute function public.forbid_update();

create or replace function public.posts_only_count_update()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'answer_count') is distinct from (to_jsonb(old) - 'answer_count') then
    perform public.fail('update_forbidden');
  end if;
  return new;
end $$;

create trigger posts_only_count_update before update on public.posts
  for each row execute function public.posts_only_count_update();
```

## 4. RPC（`0008_rpc.sql`）

### 4.1 `insert_post`（service_role 専用。Edge Function `create-post` だけが呼ぶ）

```sql
create or replace function public.insert_post(p_author uuid, p jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_day   date := (now() at time zone 'utc')::date;
  v_limit int;
  v_count int;
begin
  if not public.is_allowed_uid(p_author) then perform public.fail('not_allowed'); end if;

  -- 投稿上限（§5.2.8・§8）。同じユーザーの同時投稿は行ロックで直列化【Q-10】
  select s.daily_post_limit into v_limit from public.app_settings s;
  insert into public.post_quota (uid, day) values (p_author, v_day) on conflict (uid, day) do nothing;
  select q.count into v_count from public.post_quota q where q.uid = p_author and q.day = v_day for update;
  if v_count >= v_limit then perform public.fail('daily_limit'); end if;
  update public.post_quota set count = count + 1 where uid = p_author and day = v_day;

  insert into public.posts (author_uid, title, fmt, hero, villain, street, effective_stack,
                            keys, s1_label, min_to, max_to, pot_base)
  values (p_author, p->>'title', p->>'fmt', p->>'hero', p->>'villain', p->>'street',
          (p->>'effective_stack')::numeric,
          array(select jsonb_array_elements_text(p->'keys')),
          p->>'s1_label', (p->>'min_to')::numeric, (p->>'max_to')::numeric, (p->>'pot_base')::numeric)
  returning id into v_id;

  insert into public.post_hands (post_id, sb, bb, ante, rake, stacks, board, actions, spot_index, stop_index)
  values (v_id, (p->>'sb')::numeric, (p->>'bb')::numeric, (p->>'ante')::numeric, (p->>'rake')::numeric,
          p->'stacks', array(select jsonb_array_elements_text(p->'board')), p->'actions',
          (p->>'spot_index')::int, (p->>'stop_index')::int);

  insert into public.post_secrets (post_id, hero_cards, known_cards)
  values (v_id, array(select jsonb_array_elements_text(p->'hero_cards')), coalesce(p->'known_cards', '{}'::jsonb));

  insert into public.post_aggregates (post_id) values (v_id);
  return v_id;
end $$;

grant execute on function public.insert_post(uuid, jsonb) to service_role;
```

1 回の RPC は 1 トランザクションなので、途中で失敗すれば投稿枠の消費も含めてすべて巻き戻る。

### 4.2 `list_posts`（一覧。§5.1）

> **2026-09-29 追記（17 章）**: 戻り値に `players`（人数）と `board`（スポットの Street までの Board）を足した（マイグレーション `20260929000002_list_board.sql`）。`post_hands` を読むため security definer にした（返す行は呼んだ人で絞るので、見える範囲は変わらない）。下の定義より、このマイグレーションが正。

```sql
create or replace function public.list_posts(
  p_tab    text    default 'all',     -- 'all' | 'mine'
  p_street text    default null,      -- null | 'pf' | 'flop' | 'turn' | 'river'
  p_sort   text    default 'new',     -- 'new' | 'many'
  p_after  jsonb   default null,      -- 前ページ最後の行 {created_at, id, answer_count}
  p_limit  integer default 20)
returns table (
  id uuid, created_at timestamptz, title text, fmt text, hero text, villain text, street text,
  effective_stack numeric, answer_count integer,
  is_mine boolean, answered_by_me boolean, can_delete boolean)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.created_at, p.title, p.fmt, p.hero, p.villain, p.street,
         p.effective_stack, p.answer_count,
         p.author_uid = auth.uid(),
         exists (select 1 from public.answers a where a.post_id = p.id and a.uid = auth.uid()),
         p.author_uid = auth.uid() or public.is_admin()
  from public.posts p
  where (p_tab = 'all' or p.author_uid = auth.uid())
    and (p_street is null or p.street = p_street)
    and (p_after is null or (
          case when p_sort = 'many'
            then (p.answer_count, p.created_at, p.id)
                 < ((p_after->>'answer_count')::int, (p_after->>'created_at')::timestamptz, (p_after->>'id')::uuid)
            else (p.created_at, p.id)
                 < ((p_after->>'created_at')::timestamptz, (p_after->>'id')::uuid)
          end))
  order by case when p_sort = 'many' then p.answer_count end desc nulls last,
           p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.list_posts(text, text, text, jsonb, integer) to authenticated;
```

- SECURITY INVOKER なので posts の RLS（許可済みのみ）がそのまま効く。
- `author_uid` は返さない（UI で使わず、他人の投稿の結び付けを避けるため）。
- 回答数順のページングは、読んでいる間に回答数が変わると重複・抜けがありうる。フロントエンドは `id` で重複を除く（許容）。

### 4.3 `get_post_detail`（回答・集計画面。§4, 5.3, 5.4, 7.6）

```sql
create or replace function public.get_post_detail(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me       uuid := auth.uid();
  p        public.posts;
  h        public.post_hands;
  viewer   text;
  can_view boolean;
  v_actions jsonb;
  v_board   text[];
begin
  if not public.is_allowed() then perform public.fail('not_allowed'); end if;
  select * into p from public.posts where id = p_post_id;
  if not found then perform public.fail('post_not_found'); end if;
  select * into h from public.post_hands where post_id = p_post_id;

  viewer := case
    when p.author_uid = me then 'author'
    when exists (select 1 from public.answers a where a.post_id = p_post_id and a.uid = me) then 'answered'
    else 'unanswered' end;
  can_view := viewer <> 'unanswered';

  v_actions := h.actions;
  v_board   := h.board;
  if not can_view then
    -- 【Q-9】推奨案: 未回答者には停止位置より後のアクションと、スポットのストリートより後のボードを返さない
    v_actions := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
                  from jsonb_array_elements(h.actions) with ordinality as t(e, i)
                  where i <= h.stop_index);           -- ordinality は 1 始まり → 0..stop_index-1 を返す
    v_board := h.board[1 : case p.street when 'pf' then 0 when 'flop' then 3 when 'turn' then 4 else 5 end];
  end if;

  return jsonb_build_object(
    'viewer', viewer,
    'post', jsonb_build_object(
      'id', p.id, 'created_at', p.created_at, 'title', p.title, 'fmt', p.fmt,
      'hero', p.hero, 'villain', p.villain, 'street', p.street,
      'effective_stack', p.effective_stack, 'keys', to_jsonb(p.keys), 's1_label', p.s1_label,
      'min_to', p.min_to, 'max_to', p.max_to, 'pot_base', p.pot_base,
      'answer_count', p.answer_count,
      'is_mine', viewer = 'author', 'can_delete', viewer = 'author' or public.is_admin()),
    'hand', jsonb_build_object(
      'sb', h.sb, 'bb', h.bb, 'ante', h.ante, 'rake', h.rake, 'stacks', h.stacks,
      'board', to_jsonb(v_board), 'actions', v_actions,
      'spot_index', h.spot_index, 'stop_index', h.stop_index, 'truncated', not can_view),
    'secrets', case when can_view then (
      select jsonb_build_object('hero_cards', to_jsonb(s.hero_cards), 'known_cards', s.known_cards)
      from public.post_secrets s where s.post_id = p_post_id) end,
    'my_answer', (
      select jsonb_build_object('paint', public.bytea_hex(a.paint), 'size', a.size, 'created_at', a.created_at)
      from public.answers a where a.post_id = p_post_id and a.uid = me),
    'host_answer', case when can_view then (
      select jsonb_build_object('paint', public.bytea_hex(x.paint), 'size', x.size, 'updated_at', x.updated_at)
      from public.host_answers x where x.post_id = p_post_id) end,
    'aggregate', case when can_view then (
      select jsonb_build_object('n', g.n, 'cells', public.bytea_hex(g.cells))
      from public.post_aggregates g where g.post_id = p_post_id) end
  );
end $$;

grant execute on function public.get_post_detail(uuid) to authenticated;
```

### 4.4 `save_host_answer`（Hero の想定レンジ。§5.3.8「別の経路」）

```sql
create or replace function public.save_host_answer(p_post_id uuid, p_paint bytea, p_size numeric)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.posts;
  uses_s1 boolean;
begin
  if not public.is_allowed() then perform public.fail('not_allowed'); end if;
  select * into p from public.posts where id = p_post_id;
  if not found then perform public.fail('post_not_found'); end if;
  if p.author_uid <> auth.uid() then perform public.fail('not_author'); end if;
  uses_s1 := public.validate_paint(p_paint, p.keys);
  perform public.check_size(uses_s1, p_size, p.min_to, p.max_to);
  insert into public.host_answers (post_id, paint, size, updated_at)
  values (p_post_id, p_paint, p_size, now())
  on conflict (post_id) do update set paint = excluded.paint, size = excluded.size, updated_at = now();
end $$;

grant execute on function public.save_host_answer(uuid, bytea, numeric) to authenticated;
```

Hero の想定レンジは何度でも上書きできる。集計（`post_aggregates`）には含めない。

### 4.5 回答の送信

RPC ではなく `answers` への直接の insert（supabase-js の `from('answers').insert({ post_id, paint, size })`）。
検証・集計・回答数はトリガ（§3）が行う。`uid` はトリガが `auth.uid()` で上書きする。

### 4.6 `delete_my_account`（§3・§7.6）

```sql
create or replace function public.delete_my_account()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then perform public.fail('not_authenticated'); end if;
  delete from public.answers where uid = me;          -- 他人の投稿の集計と answer_count をトリガで減算
  delete from public.posts   where author_uid = me;   -- 本人の投稿（回答・集計・想定レンジはカスケード）
  delete from auth.users     where id = me;           -- 認証ユーザー（残りはカスケード）
end $$;

grant execute on function public.delete_my_account() to authenticated;
```

- **確認済み（2026-09-27、ローカルの Supabase CLI 2.118.0 / Postgres 17）**: `postgres` 所有の関数から `auth.users` を削除できた（DB-16）。予備の Edge Function `delete-account`（03 章 §6）は作らない。本番でも T-305 のスモークで確かめる。
- 当初の確認事項: Supabase の現行の権限で `postgres` 所有の関数から `auth.users` を削除できることを確認する。
  できない場合は、データ削除までを RPC で行い、認証ユーザーの削除は Edge Function `delete-account`
  （service_role で `auth.admin.deleteUser`）に分ける（03 章 §6）。
- 呼び出し後、フロントエンドはサインアウトしてログイン画面に戻る。

### 4.7 `admin_delete_unanswered_posts`（容量の整理。§8）

```sql
create or replace function public.admin_delete_unanswered_posts(p_before timestamptz)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then perform public.fail('not_admin'); end if;
  with d as (
    delete from public.posts where answer_count = 0 and created_at < p_before returning 1
  ) select count(*) into n from d;
  return n;
end $$;

grant execute on function public.admin_delete_unanswered_posts(timestamptz) to authenticated;
```

管理者が SQL エディタから `select public.admin_delete_unanswered_posts('2027-01-01');` のように実行する（UI は作らない）。

### 4.8 `whoami`（画面の出し分け用）

```sql
create or replace function public.whoami()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('allowed', public.is_allowed(), 'admin', public.is_admin());
$$;

grant execute on function public.whoami() to authenticated;
```

ログイン直後に呼び、`allowed = false` なら「利用できません」画面（06 章）を出す。`admin` は削除ボタンの表示にだけ使う
（削除の可否は RLS が決める）。

## 5. DB テスト（pgTAP。`supabase/tests/`）

| ID | 内容 |
|---|---|
| DB-01 | 未認証（anon）はすべての表を読めない・書けない。すべての RPC を実行できない |
| DB-02 | 許可リスト有効時、リスト外のユーザーは posts を読めず、`get_post_detail` は `not_allowed` |
| DB-03 | authenticated は posts に直接 insert / update できない |
| DB-04 | `insert_post` は authenticated から実行できない（service_role のみ） |
| DB-05 | 投稿上限: 同じ日に 5 件成功、6 件目は `daily_limit`。削除しても枠は戻らない【Q-10】。UTC の日付が変われば戻る |
| DB-06 | 回答の検証: 05 章の共有テストベクタをすべて通す（TS と同じ結果） |
| DB-07 | 投稿者も自分の投稿に回答でき、集計と回答数に入る。2 回目は 23505（2026-09-28 に変更） |
| DB-08 | 2 回目の回答は `23505` |
| DB-09 | 回答の挿入で `post_aggregates` と `answer_count` が 05 章 PAINT-12 のとおりに増える |
| DB-10 | 回答後に update しようとすると拒否 |
| DB-11 | 他人の回答は select で見えない |
| DB-12 | 未回答者は post_secrets / post_aggregates を読めない。回答後は読める。投稿者は post_secrets を常に読め、post_aggregates は回答してから |
| DB-13 | 未回答者の `get_post_detail`: secrets / aggregate が null、actions が `stop_index` 件、board がスポットのストリートまで【Q-9】 |
| DB-14 | 投稿削除（本人）で post_hands / post_secrets / answers / post_aggregates が消える |
| DB-15 | 他人の投稿は削除できない。管理者は削除できる |
| DB-16 | `delete_my_account`: 本人の回答が消え、回答していた他人の投稿の `answer_count` と集計が元に戻る。本人の投稿が消える。`auth.users` の行が消える |
| DB-17 | （廃止。2026-09-28 に Hero の想定レンジをやめた。投稿者の回答は DB-07） |
| DB-18 | `list_posts`: タブ・ストリート・並び順・ページングが正しい。`answered_by_me` / `can_delete` が正しい |
| DB-19 | 同じ投稿への同時回答 10 件で集計の合計が一致する（ロックの確認）。pgTAP は 1 トランザクションで同時実行できないため、`scripts/dbConcurrency.mjs`（10 接続で同時に挿入）で確かめる |

-- Villain の情報（Reads）と MTT の情報（詳細仕様 18 章 §4。2026-09-30 さつき）。
-- 中身の検証は create-post（packages/core の validateReads・validateMtt）で行い、DB は形と大きさだけを強制する（不変条件 4 の最後の砦）。
-- 既存の投稿は「情報なし」（villain_reads = {}、mtt = null）になる（後方互換）。

alter table public.post_hands
  add column villain_reads jsonb not null default '{}'::jsonb
    constraint post_hands_villain_reads_shape
      check (jsonb_typeof(villain_reads) = 'object' and octet_length(villain_reads::text) <= 4096),
  add column mtt jsonb
    constraint post_hands_mtt_shape
      check (mtt is null or (jsonb_typeof(mtt) = 'object' and octet_length(mtt::text) <= 1024));

-- ---- insert_post: 2 つの情報も保存する（引数は同じ） ----
create or replace function public.insert_post(p_author uuid, p jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_day   date := (now() at time zone 'utc')::date;
  v_limit int;
  v_count int;
begin
  if not public.is_allowed_uid(p_author) then perform public.fail('not_allowed'); end if;

  -- 投稿上限（仕様書 §5.2.8・§8）。同じユーザーの同時投稿は行ロックで直列化。削除しても枠は戻らない（Q-10）
  select s.daily_post_limit into v_limit from public.app_settings s;
  insert into public.post_quota (uid, day) values (p_author, v_day) on conflict (uid, day) do nothing;
  select q.count into v_count from public.post_quota q where q.uid = p_author and q.day = v_day for update;
  if v_count >= v_limit then perform public.fail('daily_limit'); end if;
  update public.post_quota set count = count + 1 where uid = p_author and day = v_day;

  insert into public.posts (author_uid, title, fmt, hero, street, effective_stack,
                            keys, s1_label, min_to, max_to, pot_base)
  values (p_author, p->>'title', p->>'fmt', p->>'hero', p->>'street',
          (p->>'effective_stack')::numeric,
          array(select jsonb_array_elements_text(p->'keys')),
          p->>'s1_label', (p->>'min_to')::numeric, (p->>'max_to')::numeric, (p->>'pot_base')::numeric)
  returning id into v_id;

  -- 情報なしは {} と null（前の版の create-post はキーを送らない）
  insert into public.post_hands (post_id, sb, bb, ante, rake, stacks, board, actions, spot_index, stop_index,
                                 villain_reads, mtt)
  values (v_id, (p->>'sb')::numeric, (p->>'bb')::numeric, (p->>'ante')::numeric, (p->>'rake')::numeric,
          p->'stacks', array(select jsonb_array_elements_text(p->'board')), p->'actions',
          (p->>'spot_index')::int, (p->>'stop_index')::int,
          coalesce(p->'villain_reads', '{}'::jsonb), nullif(p->'mtt', 'null'::jsonb));

  insert into public.post_secrets (post_id, hero_cards, known_cards)
  values (v_id, array(select jsonb_array_elements_text(p->'hero_cards')), coalesce(p->'known_cards', '{}'::jsonb));

  insert into public.post_aggregates (post_id) values (v_id);
  return v_id;
end $$;

revoke all on function public.insert_post(uuid, jsonb) from public, anonymous, authenticated;

-- ---- get_post_detail: hand に villain_reads と mtt を足す（回答の前でも返す。回答の手がかりなので） ----
create or replace function public.get_post_detail(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me        uuid := public.current_uid();
  p         public.posts;
  h         public.post_hands;
  viewer    text;
  answered  boolean;
  full_hand boolean;
  v_actions jsonb;
  v_board   text[];
begin
  if not public.is_allowed() then perform public.fail('not_allowed'); end if;
  select * into p from public.posts where id = p_post_id;
  if not found then perform public.fail('post_not_found'); end if;
  select * into h from public.post_hands where post_id = p_post_id;

  answered := exists (select 1 from public.answers a where a.post_id = p_post_id and a.uid = me);
  viewer := case
    when p.author_uid = me then 'author'
    when answered then 'answered'
    else 'unanswered' end;
  -- ハンドの全体（停止位置＝出題の Hero のアクションから後のアクション・ボード、Hero のハンド）は、投稿者本人か回答済みなら返す
  full_hand := viewer <> 'unanswered';

  v_actions := h.actions;
  v_board   := h.board;
  if not full_hand then
    v_actions := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
                  from jsonb_array_elements(h.actions) with ordinality as t(e, i)
                  where i <= h.stop_index);           -- ordinality は 1 始まり → 添字 0..stop_index-1
    v_board := coalesce(h.board[1 : case p.street when 'pf' then 0 when 'flop' then 3 when 'turn' then 4 else 5 end],
                        '{}'::text[]);
  end if;

  return jsonb_build_object(
    'viewer', viewer,
    'answered', answered,
    'post', jsonb_build_object(
      'id', p.id, 'created_at', p.created_at, 'title', p.title, 'fmt', p.fmt,
      'hero', p.hero, 'street', p.street,
      'effective_stack', p.effective_stack, 'keys', to_jsonb(p.keys), 's1_label', p.s1_label,
      'min_to', p.min_to, 'max_to', p.max_to, 'pot_base', p.pot_base,
      'answer_count', p.answer_count,
      'is_mine', viewer = 'author', 'can_delete', viewer = 'author' or public.is_admin()),
    'hand', jsonb_build_object(
      'sb', h.sb, 'bb', h.bb, 'ante', h.ante, 'rake', h.rake, 'stacks', h.stacks,
      'board', to_jsonb(v_board), 'actions', v_actions,
      'spot_index', h.spot_index, 'stop_index', h.stop_index, 'truncated', not full_hand,
      'villain_reads', h.villain_reads, 'mtt', h.mtt),
    'secrets', case when full_hand then (
      select jsonb_build_object('hero_cards', to_jsonb(s.hero_cards), 'known_cards', s.known_cards)
      from public.post_secrets s where s.post_id = p_post_id) end,
    'my_answer', (
      select jsonb_build_object('paint', public.bytea_hex(a.paint), 'size', a.size, 'created_at', a.created_at)
      from public.answers a where a.post_id = p_post_id and a.uid = me),
    'aggregate', case when answered then (
      select jsonb_build_object('n', g.n, 'cells', public.bytea_hex(g.cells))
      from public.post_aggregates g where g.post_id = p_post_id) end
  );
end $$;

revoke all on function public.get_post_detail(uuid) from public, anonymous, authenticated;
grant execute on function public.get_post_detail(uuid) to authenticated;

-- ---- list_posts: 一覧の印（Reads・MTT）に使う has_reads と has_mtt を足す（戻り値の型が変わるので作り直す） ----
drop function public.list_posts(text, text, text, jsonb, integer);

create function public.list_posts(
  p_tab    text    default 'all',     -- 'all' | 'mine'
  p_street text    default null,      -- null | 'pf' | 'flop' | 'turn' | 'river'
  p_sort   text    default 'new',     -- 'new' | 'many'
  p_after  jsonb   default null,      -- 前ページ最後の行 {created_at, id, answer_count}
  p_limit  integer default 20)
returns table (
  id uuid, created_at timestamptz, title text, fmt text, hero text, street text,
  effective_stack numeric, answer_count integer,
  is_mine boolean, answered_by_me boolean, can_delete boolean,
  players integer, board text[], has_reads boolean, has_mtt boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.created_at, p.title, p.fmt, p.hero::text, p.street::text,
         p.effective_stack::numeric, p.answer_count,
         p.author_uid = public.current_uid(),
         exists (select 1 from public.answers a where a.post_id = p.id and a.uid = public.current_uid()),
         p.author_uid = public.current_uid() or public.is_admin(),
         (select count(*)::int from jsonb_object_keys(h.stacks)),
         coalesce(h.board[1 : case p.street when 'pf' then 0 when 'flop' then 3 when 'turn' then 4 else 5 end], '{}'::text[]),
         h.villain_reads <> '{}'::jsonb,
         h.mtt is not null
  from public.posts p
  join public.post_hands h on h.post_id = p.id
  where public.is_allowed()
    and (p_tab = 'all' or p.author_uid = public.current_uid())
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

revoke all on function public.list_posts(text, text, text, jsonb, integer) from public, anonymous, authenticated;
grant execute on function public.list_posts(text, text, text, jsonb, integer) to authenticated;

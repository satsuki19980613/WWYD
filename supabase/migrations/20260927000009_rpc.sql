-- RPC（詳細仕様 02 章 §4）
-- 関数を作るたびに PUBLIC・anon・authenticated から実行権限を取り消し、必要な付与だけを行う（0007 の注記）

-- insert_post: service_role 専用。Edge Function `create-post` だけが、サーバーで検証・再計算した値で呼ぶ
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

revoke all on function public.insert_post(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_post(uuid, jsonb) to service_role;

-- list_posts: 一覧（仕様書 §5.1）。SECURITY INVOKER なので posts の RLS（許可済みのみ）がそのまま効く。
-- author_uid は返さない（他人の投稿の結び付けを避ける）
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
  select p.id, p.created_at, p.title, p.fmt, p.hero::text, p.villain::text, p.street::text,
         p.effective_stack::numeric, p.answer_count,
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

revoke all on function public.list_posts(text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.list_posts(text, text, text, jsonb, integer) to authenticated;

-- get_post_detail: 回答・集計画面（仕様書 §4, 5.3, 5.4, 7.6）。
-- 未回答者には停止位置より後のアクションと、スポットのストリートより後のボードを返さない（Q-9）
create or replace function public.get_post_detail(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me        uuid := auth.uid();
  p         public.posts;
  h         public.post_hands;
  viewer    text;
  can_view  boolean;
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
    v_actions := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
                  from jsonb_array_elements(h.actions) with ordinality as t(e, i)
                  where i <= h.stop_index);           -- ordinality は 1 始まり → 添字 0..stop_index-1
    v_board := coalesce(h.board[1 : case p.street when 'pf' then 0 when 'flop' then 3 when 'turn' then 4 else 5 end],
                        '{}'::text[]);
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

revoke all on function public.get_post_detail(uuid) from public, anon, authenticated;
grant execute on function public.get_post_detail(uuid) to authenticated;

-- save_host_answer: Hero の予想（仕様書 §5.3.8「別の経路」）。投稿者のみ・何度でも上書き・集計に入れない
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

revoke all on function public.save_host_answer(uuid, bytea, numeric) from public, anon, authenticated;
grant execute on function public.save_host_answer(uuid, bytea, numeric) to authenticated;

-- delete_my_account（仕様書 §3・§7.6）: ①本人の回答（トリガで他人の投稿の集計と answer_count を減算）
-- ②本人の投稿（カスケード）③認証ユーザー、の順に消す
create or replace function public.delete_my_account()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then perform public.fail('not_authenticated'); end if;
  delete from public.answers where uid = me;
  delete from public.posts   where author_uid = me;
  delete from auth.users     where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- admin_delete_unanswered_posts: 容量の整理（仕様書 §8）。管理者が SQL エディタから実行する
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

revoke all on function public.admin_delete_unanswered_posts(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_delete_unanswered_posts(timestamptz) to authenticated;

-- whoami: 画面の出し分け用（allowed = false なら「利用できません」画面）
create or replace function public.whoami()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('allowed', public.is_allowed(), 'admin', public.is_admin());
$$;

revoke all on function public.whoami() from public, anon, authenticated;
grant execute on function public.whoami() to authenticated;

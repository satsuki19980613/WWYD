-- 投稿者も自分の投稿に回答する（2026-09-28 さつきの決定。Hero の想定レンジを廃止）
--
-- - 投稿者の回答も他の回答者と同じ answers に入り、集計に含まれる。1 回だけ・送信後は変更できない
-- - 投稿者も、回答するまで自分の投稿の集計を見られない（Hero のハンド・全アクションは自分のデータなので見られる）
-- - 保存済みの Hero の想定レンジ（host_answers）は、投稿者の回答として answers に移す（集計にも加わる）。その後 host_answers と save_host_answer を消す

-- ---- 回答の挿入前の検証から、投稿者本人の拒否（own_post）を外す ----
create or replace function public.answers_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.posts;
  uses_s1 boolean;
begin
  new.uid := public.current_uid();
  new.created_at := now();
  if new.uid is null then perform public.fail('not_authenticated'); end if;
  select * into p from public.posts where id = new.post_id;
  if not found then perform public.fail('post_not_found'); end if;
  uses_s1 := public.validate_paint(new.paint, p.keys);
  perform public.check_size(uses_s1, new.size, p.min_to, p.max_to);
  return new;
end $$;

-- ---- answers の挿入のポリシーから、投稿者本人の除外を外す ----
drop policy answers_insert on public.answers;
create policy answers_insert on public.answers
  for insert to authenticated
  with check (uid = (select public.current_uid()) and public.is_allowed());

-- ---- 保存済みの Hero の想定レンジを、投稿者の回答として移す（トリガで集計と answer_count に加わる） ----
do $$
declare
  r record;
begin
  for r in select h.post_id, h.paint, h.size, p.author_uid
           from public.host_answers h join public.posts p on p.id = h.post_id loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.author_uid, 'role', 'authenticated')::text, true);
    insert into public.answers (post_id, paint, size) values (r.post_id, r.paint, r.size)
    on conflict do nothing;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

drop function public.save_host_answer(uuid, bytea, numeric);
drop table public.host_answers;

-- ---- 閲覧の条件 ----
-- Hero のハンド・known_cards: 投稿者本人か回答済み（変更なし。コメントだけ直す）
comment on function public.can_view_results(uuid) is 'Hero のハンド・known_cards を見てよいか（投稿者本人か、回答済み）';

-- 集計: 回答済みだけ（投稿者も回答するまで見られない）
create or replace function public.can_view_aggregate(p_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_allowed()
    and exists (select 1 from public.answers a where a.post_id = p_post_id and a.uid = public.current_uid());
$$;

revoke all on function public.can_view_aggregate(uuid) from public, anonymous, authenticated;
grant execute on function public.can_view_aggregate(uuid) to authenticated;

drop policy post_aggregates_select on public.post_aggregates;
create policy post_aggregates_select on public.post_aggregates
  for select to authenticated using (public.can_view_aggregate(post_id));

-- ---- get_post_detail: 投稿者は全アクションと Hero のハンドを見られるが、集計は回答してから ----
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
  -- ハンドの全体（停止位置より後のアクション・ボード、Hero のハンド）は、投稿者本人か回答済みなら返す
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
      'hero', p.hero, 'villain', p.villain, 'street', p.street,
      'effective_stack', p.effective_stack, 'keys', to_jsonb(p.keys), 's1_label', p.s1_label,
      'min_to', p.min_to, 'max_to', p.max_to, 'pot_base', p.pot_base,
      'answer_count', p.answer_count,
      'is_mine', viewer = 'author', 'can_delete', viewer = 'author' or public.is_admin()),
    'hand', jsonb_build_object(
      'sb', h.sb, 'bb', h.bb, 'ante', h.ante, 'rake', h.rake, 'stacks', h.stacks,
      'board', to_jsonb(v_board), 'actions', v_actions,
      'spot_index', h.spot_index, 'stop_index', h.stop_index, 'truncated', not full_hand),
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

-- ---- admin_delete_unanswered_posts: 投稿者本人の回答しかない投稿も「回答なし」として整理する ----
create or replace function public.admin_delete_unanswered_posts(p_before timestamptz)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then perform public.fail('not_admin'); end if;
  with d as (
    delete from public.posts p
    where p.created_at < p_before
      and not exists (select 1 from public.answers a where a.post_id = p.id and a.uid <> p.author_uid)
    returning 1
  ) select count(*) into n from d;
  return n;
end $$;

revoke all on function public.admin_delete_unanswered_posts(timestamptz) from public, anonymous, authenticated;
grant execute on function public.admin_delete_unanswered_posts(timestamptz) to authenticated;

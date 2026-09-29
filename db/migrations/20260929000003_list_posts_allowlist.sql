-- list_posts でも許可リストを見る（リリース前テストの指摘 F-001。レビュー R2）。
-- 20260929000002 で security definer にしたため、posts の RLS（posts_select: public.is_allowed()）が関数の中で効かず、
-- 許可リストを有効にしたとき、リストに無い利用者にも一覧が返っていた。posts の直接の select と同じく 0 行にする。
-- 引数と戻り値は前と同じなので create or replace で置き換える（権限はそのまま残るが、念のため付け直す）。
create or replace function public.list_posts(
  p_tab    text    default 'all',     -- 'all' | 'mine'
  p_street text    default null,      -- null | 'pf' | 'flop' | 'turn' | 'river'
  p_sort   text    default 'new',     -- 'new' | 'many'
  p_after  jsonb   default null,      -- 前ページ最後の行 {created_at, id, answer_count}
  p_limit  integer default 20)
returns table (
  id uuid, created_at timestamptz, title text, fmt text, hero text, street text,
  effective_stack numeric, answer_count integer,
  is_mine boolean, answered_by_me boolean, can_delete boolean,
  players integer, board text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.created_at, p.title, p.fmt, p.hero::text, p.street::text,
         p.effective_stack::numeric, p.answer_count,
         p.author_uid = public.current_uid(),
         exists (select 1 from public.answers a where a.post_id = p.id and a.uid = public.current_uid()),
         p.author_uid = public.current_uid() or public.is_admin(),
         (select count(*)::int from jsonb_object_keys(h.stacks)),
         coalesce(h.board[1 : case p.street when 'pf' then 0 when 'flop' then 3 when 'turn' then 4 else 5 end], '{}'::text[])
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

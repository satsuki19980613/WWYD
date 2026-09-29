-- list_posts に人数と Board（スポットの Street まで）を足す（詳細仕様 17 章。2026-09-29 さつき:
-- 一覧でどんな状況か分かるように）。Board はスポットの Street より後を返さない（回答画面の Replay と同じ範囲）。
-- 戻り値の型が変わるので作り直す。
-- post_hands は authenticated が直接読めない（get_post_detail と同じく security definer で読む）。
-- 返す行・列は呼んだ人（current_uid）で絞るので、前の security invoker の版と同じ範囲に、人数と Board を足しただけになる
-- （posts はログイン中の全員が読める。answers は current_uid の行だけを見る）。
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
  where (p_tab = 'all' or p.author_uid = public.current_uid())
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

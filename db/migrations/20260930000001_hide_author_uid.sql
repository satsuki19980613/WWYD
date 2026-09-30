-- F-006（リリース前テスト。2026-09-30 さつき）: posts の author_uid（投稿者の UID）を Data API から読めないようにする。
-- 名前・メールではない（不変条件 6 の違反ではない）が、同じ人の投稿を結び付けられるため。画面は author_uid を使っていない
-- （一覧は list_posts の mine・can_delete、回答画面は get_post_detail の viewer で判定する。どちらも security definer）。
-- 表の select を取り消し、author_uid を除く列だけに select を与える。
-- 削除のポリシー（posts_delete の author_uid = current_uid()）は RLS の条件なので、列の権限が無くても評価される。
-- 注意: 以後 posts に列を足すときは、その列の select もこの形で与える（表の select は与えない）。
revoke select on public.posts from authenticated;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'posts' and c.column_name <> 'author_uid';
  execute format('grant select (%s) on public.posts to authenticated', cols);
end $$;

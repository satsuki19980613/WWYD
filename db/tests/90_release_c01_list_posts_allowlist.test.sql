-- 不具合の再現（リリース前テスト C-01）: list_posts は security definer だが is_allowed() を確かめない。
-- 20260929000002_list_board.sql で security invoker（posts の RLS = 許可済みのみ）から security definer に変えたときに、
-- 許可リストの確認が抜けた。許可リストが有効のとき、リスト外のユーザーにも、sub の無い authenticated にも、全投稿の
-- 題名・Hero の席・Street・スタック・回答数・Board が返る（get_post_detail・posts の直接の読み出しは断られる）。
-- 直すまでは失敗する（is_allowed() を where に足す新しいマイグレーションで直す）。
begin;
\ir helpers/setup.psql
select plan(8);

select pg_temp.create_user(n) from generate_series(1, 3) as n;
select pg_temp.make_post(1, pg_temp.hs1('X1')) as x1 \gset
select pg_temp.make_post(1, pg_temp.hs1('X2')) as x2 \gset
insert into public.app_allowlist (uid) values (pg_temp.uid(1));
update public.app_settings set allowlist_enabled = true;

select pg_temp.login(3);   -- 許可リストに載っていない
select is((select count(*)::int from public.posts), 0, '（対照）許可リスト外は posts を直接読めない');
select is((select count(*)::int from public.list_posts()), 0, 'C-01 許可リスト外は list_posts でも投稿を 1 件も得られない');
select pg_temp.logout();

-- sub の無い authenticated（誰か分からない）
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select is((select count(*)::int from public.posts), 0, '（対照）sub の無い authenticated は posts を直接読めない');
select is((select count(*)::int from public.list_posts()), 0, 'C-01 sub の無い authenticated は list_posts でも投稿を 1 件も得られない');
select pg_temp.logout();

-- ---- 修正案の確認（このトランザクションの中だけ。マイグレーションは変えない）----
-- list_posts の where の先頭に public.is_allowed() を足すと、上の 2 つが通り、許可されたユーザーは今までどおり読める
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.list_posts(text, text, text, jsonb, integer)'::regprocedure);
  d := replace(d, 'where (p_tab = ''all''', 'where public.is_allowed() and (p_tab = ''all''');
  execute d;
end $$;
select ok((select position('public.is_allowed()' in prosrc) > 0 from pg_proc where oid = 'public.list_posts(text, text, text, jsonb, integer)'::regprocedure),
  '（修正案）list_posts の本体に is_allowed() を足せた');
select pg_temp.login(3);
select is((select count(*)::int from public.list_posts()), 0, '（修正案）許可リスト外は list_posts が 0 件');
select pg_temp.logout();
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select is((select count(*)::int from public.list_posts()), 0, '（修正案）sub の無い authenticated は list_posts が 0 件');
select pg_temp.logout();
select pg_temp.login(1);
select is((select count(*)::int from public.list_posts()), 2, '（修正案）許可リストの人は今までどおり list_posts で 2 件読める');
select pg_temp.logout();

select * from finish(true);
rollback;

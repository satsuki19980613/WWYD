-- DB-14〜16: 投稿削除のカスケード、削除の権限、アカウント削除
begin;
\ir helpers/setup.psql
select plan(20);

select pg_temp.create_user(n) from generate_series(1, 4) as n;
insert into public.app_admins (uid) values (pg_temp.uid(4));
select pg_temp.make_post(1, pg_temp.hs1('P1')) as p1 \gset
select pg_temp.make_post(2, pg_temp.hs1('P2')) as p2 \gset

-- 3 が P1 に回答、1 が P1 に Hero の予想
select pg_temp.login(3);
insert into public.answers (post_id, paint) values (:'p1', pg_temp.paint('[[0,0,0,20,0]]'));
select pg_temp.logout();
select pg_temp.login(1);
select public.save_host_answer(:'p1', pg_temp.paint('[[0,20,0,0,0]]'), null);
select pg_temp.logout();

-- ---- DB-15 他人の投稿は削除できない。管理者は削除できる ----
select pg_temp.login(3);
delete from public.posts where id = :'p1';
select pg_temp.logout();
select is((select count(*)::int from public.posts where id = :'p1'), 1, 'DB-15 他人の投稿は削除できない（RLS で 0 行）');

-- ---- DB-14 本人の削除でカスケード ----
select pg_temp.login(1);
delete from public.posts where id = :'p1';
select pg_temp.logout();
select is((select count(*)::int from public.posts where id = :'p1'), 0, 'DB-14 投稿が消える');
select is((select count(*)::int from public.post_hands where post_id = :'p1'), 0, 'DB-14 post_hands が消える');
select is((select count(*)::int from public.post_secrets where post_id = :'p1'), 0, 'DB-14 post_secrets が消える');
select is((select count(*)::int from public.host_answers where post_id = :'p1'), 0, 'DB-14 host_answers が消える');
select is((select count(*)::int from public.answers where post_id = :'p1'), 0, 'DB-14 answers が消える');
select is((select count(*)::int from public.post_aggregates where post_id = :'p1'), 0, 'DB-14 post_aggregates が消える');

select pg_temp.login(4);
delete from public.posts where id = :'p2';
select is((select public.whoami()), '{"admin": true, "allowed": true}'::jsonb, 'whoami の admin = true');
select pg_temp.logout();
select is((select count(*)::int from public.posts where id = :'p2'), 0, 'DB-15 管理者は他人の投稿を削除できる');

-- ---- 容量の整理（管理者のみ） ----
select pg_temp.make_post(2, pg_temp.hs1('P3')) as p3 \gset
select pg_temp.login(2);
select throws_ok($$ select public.admin_delete_unanswered_posts(now() + interval '1 day') $$, 'P0001', 'not_admin', '整理は管理者のみ');
select pg_temp.logout();
select pg_temp.login(4);
select is(public.admin_delete_unanswered_posts(now() + interval '1 day'), 1, '回答のない投稿を消す');
select pg_temp.logout();

-- ---- DB-16 アカウント削除 ----
-- 1 の投稿 Q1 に 2 と 3 が回答。3 の投稿 Q3 に 1 が回答。3 がアカウントを削除する
select pg_temp.make_post(1, pg_temp.hs1('Q1')) as q1 \gset
select pg_temp.make_post(3, pg_temp.hs1('Q3')) as q3 \gset
select pg_temp.login(2);
insert into public.answers (post_id, paint) values (:'q1', pg_temp.paint('[[0,0,0,20,0]]'));
select pg_temp.logout();
select pg_temp.login(3);
insert into public.answers (post_id, paint) values (:'q1', pg_temp.paint('[[0,0,0,20,0],[14,20,0,0,0]]'));
select pg_temp.logout();
select pg_temp.login(1);
insert into public.answers (post_id, paint) values (:'q3', pg_temp.paint('[[0,0,0,20,0]]'));
select pg_temp.logout();
select is((select answer_count from public.posts where id = :'q1'), 2, 'DB-16 削除前: Q1 の回答数 2');

select pg_temp.login(3);
select lives_ok($$ select public.delete_my_account() $$, 'DB-16 delete_my_account を実行できる');
select pg_temp.logout();

select is((select count(*)::int from public.answers where uid = pg_temp.uid(3)), 0, 'DB-16 本人の回答が消える');
select is((select answer_count from public.posts where id = :'q1'), 1, 'DB-16 回答していた他人の投稿の回答数が戻る');
select is((select n from public.post_aggregates where post_id = :'q1'), 1, 'DB-16 集計の N が戻る');
select is(pg_temp.agg(:'q1', 0, 3), 20, 'DB-16 AA の sum_call が戻る');
select is(pg_temp.agg(:'q1', 14, 0), 0, 'DB-16 KK の n_cell が戻る');
select is((select count(*)::int from public.posts where id = :'q3'), 0, 'DB-16 本人の投稿が消える');
select is((select count(*)::int from auth.users where id = pg_temp.uid(3)), 0, 'DB-16 auth.users の行が消える');

select * from finish();
rollback;

-- DB-05: 投稿上限（1 日 5 件。削除しても枠は戻らない。UTC の日付が変われば戻る）
begin;
\ir helpers/setup.psql
select plan(7);

select pg_temp.create_user(1);
select pg_temp.create_user(2);

select lives_ok($$ select pg_temp.make_post(1) from generate_series(1, 5) $$, 'DB-05 同じ日に 5 件は成功');
select throws_ok($$ select pg_temp.make_post(1) $$, 'P0001', 'daily_limit', 'DB-05 6 件目は daily_limit');
select is((select count(*)::int from public.posts where author_uid = pg_temp.uid(1)), 5, 'DB-05 失敗した 6 件目は残らない');

-- 削除しても枠は戻らない（Q-10）
delete from public.posts where id = (select id from public.posts where author_uid = pg_temp.uid(1) limit 1);
select throws_ok($$ select pg_temp.make_post(1) $$, 'P0001', 'daily_limit', 'DB-05 削除しても枠は戻らない');

-- 枠は日付ごと（前日に 5 件使っていても、今日の枠は別）
select lives_ok($$ select pg_temp.make_post(2) $$, 'DB-05 他のユーザーの枠は別');
update public.post_quota set day = day - 1 where uid = pg_temp.uid(1);
select lives_ok($$ select pg_temp.make_post(1) $$, 'DB-05 UTC の日付が変われば戻る');

-- 上限の設定は app_settings で変えられる
update public.app_settings set daily_post_limit = 1;
select throws_ok($$ select pg_temp.make_post(2) $$, 'P0001', 'daily_limit', 'DB-05 上限は app_settings の値');

select * from finish(true);
rollback;

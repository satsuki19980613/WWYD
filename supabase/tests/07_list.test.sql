-- DB-18: list_posts（タブ・ストリート・並び順・ページング・answered_by_me / can_delete）
begin;
\ir helpers/setup.psql
select plan(14);

select pg_temp.create_user(n) from generate_series(1, 5) as n;
insert into public.app_admins (uid) values (pg_temp.uid(5));

-- 投稿 5 件（作成日時を 1 分ずつずらす）。E はフロップのスポット
select pg_temp.make_post(1, pg_temp.hs1('A')) as a \gset
select pg_temp.make_post(1, pg_temp.hs1('B')) as b \gset
select pg_temp.make_post(2, pg_temp.hs1('C')) as c \gset
select pg_temp.make_post(2, pg_temp.hs1('D')) as d \gset
select pg_temp.make_post(2, pg_temp.hs1('E') || '{"street":"flop","stop_index":8,"spot_index":7,"pot_base":9.1,"min_to":3.6,"max_to":97.5}') as e \gset
-- 作成日時の書き換えはトリガで拒否されるので、一時的にトリガを外す
alter table public.posts disable trigger posts_only_count_update;
update public.posts set created_at = now() - (interval '1 minute' * (ascii('F') - ascii(title))) where title in ('A','B','C','D','E');
alter table public.posts enable trigger posts_only_count_update;

-- 回答: C に 3 と 4、D に 3（回答数順は C, D, …）
select pg_temp.login(3);
insert into public.answers (post_id, paint) values (:'c', pg_temp.paint('[[0,0,0,20,0]]')), (:'d', pg_temp.paint('[[0,0,0,20,0]]'));
select pg_temp.logout();
select pg_temp.login(4);
insert into public.answers (post_id, paint) values (:'c', pg_temp.paint('[[0,0,0,20,0]]'));
select pg_temp.logout();

select pg_temp.login(3);
select is(array(select title from public.list_posts()), array['E','D','C','B','A'], 'DB-18 新着順');
select is(array(select title from public.list_posts(p_sort => 'many')), array['C','D','E','B','A'], 'DB-18 回答数順（同数は新着順）');
select is(array(select title from public.list_posts(p_street => 'flop')), array['E'], 'DB-18 ストリートで絞り込み');
select is(array(select title from public.list_posts(p_street => 'turn', p_sort => 'many')), array['C','D','B','A'], 'DB-18 絞り込み＋回答数順');
select is(array(select title from public.list_posts(p_tab => 'mine')), array[]::text[], 'DB-18 自分の投稿（なし）');
select is(array(select title from public.list_posts() where answered_by_me), array['D','C'], 'DB-18 answered_by_me');
select is(array(select title from public.list_posts() where can_delete), array[]::text[], 'DB-18 他人の投稿は can_delete = false');

-- ページング（新着順 2 件ずつ）
select to_jsonb(x) as last from (select created_at, id, answer_count from public.list_posts(p_limit => 2) offset 1 limit 1) x \gset
select is(array(select title from public.list_posts(p_after => :'last', p_limit => 2)), array['C','B'], 'DB-18 新着順の 2 ページ目');
-- ページング（回答数順）
select to_jsonb(x) as lastm from (select created_at, id, answer_count from public.list_posts(p_sort => 'many', p_limit => 2) offset 1 limit 1) x \gset
select is(array(select title from public.list_posts(p_sort => 'many', p_after => :'lastm', p_limit => 2)), array['E','B'], 'DB-18 回答数順の 2 ページ目');
select is((select count(*)::int from public.list_posts(p_limit => 1000)), 5, 'DB-18 limit は 50 まで（5 件なら全件）');
select pg_temp.logout();

select pg_temp.login(2);
select is(array(select title from public.list_posts(p_tab => 'mine')), array['E','D','C'], 'DB-18 自分の投稿タブ');
select is(array(select title from public.list_posts() where is_mine and can_delete), array['E','D','C'], 'DB-18 自分の投稿は is_mine・can_delete');
select pg_temp.logout();

select pg_temp.login(5);
select is((select count(*)::int from public.list_posts() where can_delete), 5, 'DB-18 管理者は全件 can_delete');
select pg_temp.logout();

-- author_uid は返さない
select is((select count(*)::int from information_schema.routines r
           join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_name = 'list_posts' and p.parameter_name = 'author_uid'), 0, 'list_posts は author_uid を返さない');

select * from finish();
rollback;

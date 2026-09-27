-- DB-13: get_post_detail の出し分け（未回答者には停止位置まで。Q-9）
begin;
\ir helpers/setup.psql
select plan(18);

select pg_temp.create_user(n) from generate_series(1, 3) as n;
select pg_temp.make_post(1) as post \gset

-- ---- 未回答者 ----
select pg_temp.login(3);
select public.get_post_detail(:'post') as d \gset
select pg_temp.logout();
select is((:'d'::jsonb)->>'viewer', 'unanswered', 'DB-13 viewer = unanswered');
select is((:'d'::jsonb)->'secrets', 'null'::jsonb, 'DB-13 secrets は null');
select is((:'d'::jsonb)->'host_answer', 'null'::jsonb, 'DB-13 host_answer は null');
select is((:'d'::jsonb)->'aggregate', 'null'::jsonb, 'DB-13 aggregate は null');
select is(jsonb_array_length((:'d'::jsonb)->'hand'->'actions'), 11, 'DB-13 actions は stop_index（11）件');
select is((:'d'::jsonb)->'hand'->'actions'->10->>'type', 'bet', 'DB-13 最後はスポットの Hero のアクション（10 BTN b6.5）');
select is((:'d'::jsonb)->'hand'->'board', '["Kh","8d","3c","2s"]'::jsonb, 'DB-13 board はスポットのストリート（ターン）まで');
select is(((:'d'::jsonb)->'hand'->>'truncated')::boolean, true, 'DB-13 truncated = true');
select is((:'d'::jsonb)->'my_answer', 'null'::jsonb, 'DB-13 my_answer は null');
select is(((:'d'::jsonb)->'post'->>'can_delete')::boolean, false, 'DB-13 他人の投稿は削除できない');

-- ---- 回答後 ----
select pg_temp.login(2);
insert into public.answers (post_id, paint) values (:'post', pg_temp.paint('[[0,0,0,20,0]]'));
select public.get_post_detail(:'post') as d2 \gset
select pg_temp.logout();
select is((:'d2'::jsonb)->>'viewer', 'answered', '回答後は viewer = answered');
select is(jsonb_array_length((:'d2'::jsonb)->'hand'->'actions'), 15, '回答後は全アクション');
select is((:'d2'::jsonb)->'secrets'->'hero_cards', '["Ad","Kd"]'::jsonb, '回答後は Hero のハンドが見える');
select is(((:'d2'::jsonb)->'aggregate'->>'n')::int, 1, '回答後は集計が見える');
select is(left((:'d2'::jsonb)->'my_answer'->>'paint', 10), '\x00001400', 'my_answer の paint は \x の 16 進');

-- ---- 投稿者 ----
select pg_temp.login(1);
select public.get_post_detail(:'post') as d3 \gset
select pg_temp.logout();
select is((:'d3'::jsonb)->>'viewer', 'author', '投稿者は viewer = author');
select is(((:'d3'::jsonb)->'post'->>'can_delete')::boolean, true, '投稿者は削除できる');

select pg_temp.login(1);
select throws_ok($$ select public.get_post_detail(gen_random_uuid()) $$, 'P0001', 'post_not_found', '存在しない投稿は post_not_found');
select pg_temp.logout();

select * from finish(true);
rollback;

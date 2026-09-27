-- DB-07〜10・17・19: 回答・集計・Hero の予想
begin;
\ir helpers/setup.psql
select plan(28);

select pg_temp.create_user(n) from generate_series(1, 13) as n;
select pg_temp.make_post(1) as post \gset

-- 05 章 PAINT-12 の回答 A（AA を call 20）と B（AA を call 10 / s1 10、KK を fold 20。s1 を使うので size が要る）
select pg_temp.paint('[[0,0,0,20,0]]') as pa \gset
select pg_temp.paint('[[0,0,0,10,10],[14,20,0,0,0]]') as pb \gset

-- ---- DB-07 投稿者本人の回答は拒否 ----
select pg_temp.login(1);
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'post', :'pa'),
  'P0001', 'own_post', 'DB-07 投稿者本人の回答は own_post');
select pg_temp.logout();

-- ---- 回答の検証（トリガ） ----
select pg_temp.login(2);
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'post', pg_temp.paint('[[0,0,0,15,0]]')),
  'P0001', 'paint_sum', '検証: マスの合計が 20 でない');
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 12) $$, :'post', :'pb'),
  'P0001', 'size_out_of_range', '検証: size が min 未満');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, gen_random_uuid(), :'pa'),
  'P0001', 'post_not_found', '検証: 存在しない投稿');

-- uid はクライアントの値を信用しない（他人の uid を入れても自分の回答になる）
insert into public.answers (post_id, uid, paint) values (:'post', pg_temp.uid(9), :'pa');
select is((select uid from public.answers where post_id = :'post'), pg_temp.uid(2), 'uid は public.current_uid() で上書きされる');

-- ---- DB-08 2 回目の回答は 23505 ----
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'post', :'pa'),
  '23505', null, 'DB-08 2 回目の回答は 23505');

-- ---- DB-10 回答後の update は拒否 ----
select throws_ok(format($$ update public.answers set size = 20 where post_id = %L $$, :'post'),
  '42501', null, 'DB-10 authenticated は update できない（権限なし）');
select pg_temp.logout();
select throws_ok(format($$ update public.answers set size = 20 where post_id = %L $$, :'post'),
  'P0001', 'update_forbidden', 'DB-10 postgres でもトリガで拒否');
select throws_ok(format($$ update public.posts set title = 'x' where id = %L $$, :'post'),
  'P0001', 'update_forbidden', 'posts の answer_count 以外の update はトリガで拒否');

-- ---- DB-09 集計（05 章 PAINT-12） ----
select pg_temp.login(3);
insert into public.answers (post_id, paint, size) values (:'post', :'pb', 17.55);
select pg_temp.logout();

select is((select n from public.post_aggregates where post_id = :'post'), 2, 'DB-09 N = 2');
select is((select answer_count from public.posts where id = :'post'), 2, 'DB-09 answer_count = 2');
select is(pg_temp.agg(:'post', 0, 0), 2, 'DB-09 AA の n_cell = 2');
select is(pg_temp.agg(:'post', 0, 3), 30, 'DB-09 AA の sum_call = 30');
select is(pg_temp.agg(:'post', 0, 4), 10, 'DB-09 AA の sum_s1 = 10');
select is(pg_temp.agg(:'post', 0, 1), 0, 'DB-09 AA の sum_fold = 0');
select is(pg_temp.agg(:'post', 14, 0), 1, 'DB-09 KK の n_cell = 1');
select is(pg_temp.agg(:'post', 14, 1), 20, 'DB-09 KK の sum_fold = 20');
select is(pg_temp.agg(:'post', 13, 0), 0, 'DB-09 塗っていないマスは 0');

-- ---- DB-17 Hero の予想: 投稿者のみ・上書き可・集計に入らない ----
select pg_temp.login(2);
select throws_ok(format($$ select public.save_host_answer(%L, %L, null) $$, :'post', :'pa'),
  'P0001', 'not_author', 'DB-17 投稿者以外は not_author');
select pg_temp.logout();
select pg_temp.login(1);
select lives_ok(format($$ select public.save_host_answer(%L, %L, null) $$, :'post', :'pa'), 'DB-17 投稿者は保存できる');
select lives_ok(format($$ select public.save_host_answer(%L, %L, 20) $$, :'post', :'pb'), 'DB-17 何度でも上書きできる');
select throws_ok(format($$ select public.save_host_answer(%L, %L, null) $$, :'post', :'pb'),
  'P0001', 'size_out_of_range', 'DB-17 回答と同じ検証（Q-21）');
select is((select size::numeric from public.host_answers where post_id = :'post'), 20.000::numeric, 'DB-17 上書き後の値');
select pg_temp.logout();
select is((select n from public.post_aggregates where post_id = :'post'), 2, 'DB-17 集計に入らない');
select is((select answer_count from public.posts where id = :'post'), 2, 'DB-17 回答数に入らない');

-- ---- DB-19 同じ投稿への 10 件の回答で集計の合計が一致する ----
-- （本当の同時実行は scripts/db-concurrency.mjs で確かめる。ここでは 10 件の逐次加算の合計）
select pg_temp.make_post(1, pg_temp.hs1('DB-19')) as post19 \gset
do $$
declare n int;
begin
  for n in 4..13 loop
    perform pg_temp.login(n);
    insert into public.answers (post_id, paint) values (
      (select id from public.posts where title = 'DB-19'),
      pg_temp.paint('[[0,0,0,20,0],[168,20,0,0,0]]'));
    perform pg_temp.logout();
  end loop;
end $$;
select is((select n from public.post_aggregates where post_id = :'post19'), 10, 'DB-19 N = 10');
select is(pg_temp.agg(:'post19', 0, 3), 200, 'DB-19 AA の sum_call = 200');
select is(pg_temp.agg(:'post19', 168, 1), 200, 'DB-19 22 の sum_fold = 200');

select * from finish(true);
rollback;

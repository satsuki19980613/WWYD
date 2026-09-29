-- C-01（リリース前テスト）: 回答の検証の境界（不変条件 4）。03_paint_vectors（共有ベクタ）と 04_answers に無い場合:
-- size の NaN・境界ちょうど・負・s1 を使うのに size が無い / 使わないのに size がある、paint が null・空、
-- キーが使えない投稿（check のみ・check,s1）への回答、created_at・uid をクライアントが渡しても上書きされること。
begin;
\ir helpers/setup.psql
select plan(26);

select pg_temp.create_user(n) from generate_series(1, 8) as n;
select pg_temp.make_post(1, pg_temp.hs1('FCS')) as pfcs \gset
select pg_temp.make_post(1, pg_temp.hs1('CS') || '{"keys":["check","s1"],"s1_label":"bet","min_to":1,"max_to":95.7,"pot_base":9.1}') as pcs \gset
select pg_temp.make_post(1, pg_temp.hs1('C') || '{"keys":["check"],"s1_label":null,"min_to":null,"max_to":null,"pot_base":9.1}') as pc \gset

select pg_temp.paint('[[0,0,0,10,10]]') as call_s1 \gset
select pg_temp.paint('[[0,0,0,20,0]]') as call_only \gset
select pg_temp.paint('[[0,20,0,0,0]]') as fold_only \gset
select pg_temp.paint('[[0,0,20,0,0]]') as check_only \gset
select pg_temp.paint('[[0,0,10,0,10]]') as check_s1 \gset

-- ---- size（s1 を使う回答） ----
select pg_temp.login(2);
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 'NaN') $$, :'pfcs', :'call_s1'),
  'P0001', 'size_out_of_range', 'C-01 size = NaN は size_out_of_range');
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, -1) $$, :'pfcs', :'call_s1'),
  '23514', null, 'C-01 size が負は 23514（bb_amount の CHECK）');
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 12.999) $$, :'pfcs', :'call_s1'),
  'P0001', 'size_out_of_range', 'C-01 size が min（13）より 0.001 小さい');
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 95.701) $$, :'pfcs', :'call_s1'),
  'P0001', 'size_out_of_range', 'C-01 size が max（95.7）より 0.001 大きい');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pfcs', :'call_s1'),
  'P0001', 'size_out_of_range', 'C-01 s1 を使うのに size が無い');
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 20) $$, :'pfcs', :'call_only'),
  'P0001', 'size_not_allowed', 'C-01 s1 を使わないのに size がある');
select lives_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 13) $$, :'pfcs', :'call_s1'),
  'C-01 size が min ちょうど（13）は受け付ける');
select pg_temp.logout();
select pg_temp.login(3);
select lives_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 95.7) $$, :'pfcs', :'call_s1'),
  'C-01 size が max ちょうど（95.7）は受け付ける');
select pg_temp.logout();

-- ---- paint そのもの ----
select pg_temp.login(4);
select throws_ok(format($$ insert into public.answers (post_id) values (%L) $$, :'pfcs'),
  'P0001', 'paint_length', 'C-01 paint が無い（null）');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, ''::bytea) $$, :'pfcs'),
  'P0001', 'paint_length', 'C-01 paint が空（0 バイト）');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pfcs', substring(:'call_only'::bytea from 1 for 675)),
  'P0001', 'paint_length', 'C-01 paint が 675 バイト');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pfcs', :'call_only'::bytea || '\x00'::bytea),
  'P0001', 'paint_length', 'C-01 paint が 677 バイト');
select throws_ok($$ insert into public.answers (post_id, paint) values (null, '\x00') $$, 'P0001', 'post_not_found', 'C-01 post_id が null は post_not_found');
select pg_temp.logout();

-- ---- 使えないキー ----
select pg_temp.login(5);
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pcs', :'fold_only'),
  'P0001', 'paint_illegal_key', 'C-01 keys が check,s1 の投稿に fold は使えない');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pcs', :'call_only'),
  'P0001', 'paint_illegal_key', 'C-01 keys が check,s1 の投稿に call は使えない');
select lives_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 1) $$, :'pcs', :'check_s1'),
  'C-01 keys が check,s1 の投稿に check・s1（size 1 = min）は使える');
select throws_ok(format($$ insert into public.answers (post_id, paint, size) values (%L, %L, 5) $$, :'pc', :'check_s1'),
  'P0001', 'paint_illegal_key', 'C-01 keys が check だけの投稿に s1 は使えない');
select lives_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pc', :'check_only'),
  'C-01 keys が check だけの投稿に check は使える');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pfcs', :'check_only'),
  'P0001', 'paint_illegal_key', 'C-01 keys が fold,call,s1 の投稿に check は使えない');
select pg_temp.logout();

-- ---- クライアントが渡した uid・created_at は使われない ----
select pg_temp.login(6);
insert into public.answers (post_id, uid, created_at, paint) values (:'pfcs', pg_temp.uid(7), '2000-01-01T00:00:00Z', :'call_only');
select is((select uid from public.answers where post_id = :'pfcs'), pg_temp.uid(6), 'C-01 uid は呼んだ人（他人の uid を渡しても）');
select ok((select created_at from public.answers where post_id = :'pfcs') > now() - interval '1 minute', 'C-01 created_at はサーバーの現在時刻（2000 年を渡しても）');
select pg_temp.logout();
select is((select count(*)::int from public.answers where uid = pg_temp.uid(7)), 0, 'C-01 他人（7）の名義の回答は作られない');

-- 拒否された回答は、集計にも回答数にも影響しない（失敗した文は何も残さない）
select is((select n from public.post_aggregates where post_id = :'pfcs'), 3, 'C-01 pfcs の集計の N は成功した 3 件（2・3・6）だけ');
select is((select answer_count from public.posts where id = :'pfcs'), 3, 'C-01 pfcs の answer_count も 3');
select is((select n from public.post_aggregates where post_id = :'pcs'), 1, 'C-01 pcs の集計の N は成功した 1 件だけ');
select is((select n from public.post_aggregates where post_id = :'pc'), 1, 'C-01 pc の集計の N は成功した 1 件だけ');

select * from finish(true);
rollback;

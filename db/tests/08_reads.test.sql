-- DB-20: Villain の情報（Reads）と MTT の情報（詳細仕様 18 章 §4）
begin;
\ir helpers/setup.psql
select plan(14);

select pg_temp.create_user(n) from generate_series(1, 3) as n;

-- 前の版の create-post（キーを送らない）の投稿は「情報なし」
select pg_temp.make_post(1, pg_temp.hs1('旧')) as old \gset
select is((select villain_reads from public.post_hands where post_id = :'old'), '{}'::jsonb, 'DB-20 キーの無い投稿の villain_reads は {}');
select is((select mtt from public.post_hands where post_id = :'old'), null::jsonb, 'DB-20 キーの無い投稿の mtt は null');

-- mtt に JSON の null を送っても null
select pg_temp.make_post(1, pg_temp.hs1('null') || '{"villain_reads":{},"mtt":null}') as nul \gset
select is((select mtt from public.post_hands where post_id = :'nul'), null::jsonb, 'DB-20 mtt の JSON の null は null');

-- 情報のある投稿
select pg_temp.make_post(1, pg_temp.hs1('有') || '{"fmt":"mtt","rake":null,
  "villain_reads":{"BB":{"vpip":30,"pfr":20,"memo":"見本"}},
  "mtt":{"stage":"bubble","rank":12,"left":58,"paid":50,"entries":320}}') as rich \gset
select is((select villain_reads->'BB'->>'memo' from public.post_hands where post_id = :'rich'), '見本', 'DB-20 villain_reads を保存する');
select is((select mtt->>'stage' from public.post_hands where post_id = :'rich'), 'bubble', 'DB-20 mtt を保存する');

-- 形の強制（最後の砦）
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('配列') || '{"villain_reads":[]}') $$, '23514', null,
  'DB-20 villain_reads はオブジェクトだけ');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('文字') || '{"mtt":"bubble"}') $$, '23514', null,
  'DB-20 mtt はオブジェクトか null だけ');
select throws_ok(format($$ select pg_temp.make_post(1, pg_temp.hs1('大') || jsonb_build_object('villain_reads', jsonb_build_object('BB', jsonb_build_object('memo', %L)))) $$, repeat('x', 5000)),
  '23514', null, 'DB-20 villain_reads は 4KB まで');

-- 回答の前でも get_post_detail で返す（回答の手がかり）
select pg_temp.login(3);
select public.get_post_detail(:'rich') as d \gset
select is((:'d'::jsonb)->>'viewer', 'unanswered', 'DB-20 未回答者として読む');
select is((:'d'::jsonb)->'hand'->'villain_reads'->'BB'->>'vpip', '30', 'DB-20 未回答者にも villain_reads を返す');
select is((:'d'::jsonb)->'hand'->'mtt'->>'entries', '320', 'DB-20 未回答者にも mtt を返す');
select is(((public.get_post_detail(:'old'))->'hand'->'mtt'), 'null'::jsonb, 'DB-20 情報なしの投稿の mtt は null');

-- 一覧の印
select is((select has_reads from public.list_posts() where title = '有') and (select has_mtt from public.list_posts() where title = '有'), true,
  'DB-20 list_posts の has_reads・has_mtt（情報あり）');
select is((select has_reads or has_mtt from public.list_posts() where title = '旧'), false,
  'DB-20 list_posts の has_reads・has_mtt（情報なし）');
select pg_temp.logout();

select * from finish();
rollback;

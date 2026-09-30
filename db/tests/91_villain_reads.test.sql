-- T4-03・T4-05（Villain・MTT の情報（P11）の総合テスト。docs/villain-reads-test-plan.md §3 T4）:
-- villain_reads の 8KB・mtt の 1KB の境目（バイト数。多バイト文字を含む）、insert_post → get_post_detail の一周、
-- 未回答者に後の Action・Board・Hero のハンドが返らないこと（不変条件 10）、list_posts の印と権限（security definer・search_path）。
begin;
\ir helpers/setup.psql
select plan(58);

-- 1 = 投稿者、2 = 回答者、3 = 未回答の閲覧者
select pg_temp.create_user(n) from generate_series(1, 3) as n;
update public.app_settings set daily_post_limit = 100;

-- villain_reads の中身が text で ちょうど n バイトになるオブジェクト（pad を調整する。`c` はパディングの文字）
create or replace function pg_temp.vr_bytes(n int, c text default 'x') returns jsonb language plpgsql as $$
declare
  base int := octet_length(jsonb_build_object('BB', jsonb_build_object('pad', ''))::text);
  clen int := octet_length(c);
  k int := (n - base) / clen;
  rest int := (n - base) - k * clen;
begin
  return jsonb_build_object('BB', jsonb_build_object('pad', repeat(c, k) || repeat('x', rest)));
end $$;

create or replace function pg_temp.mtt_bytes(n int) returns jsonb language plpgsql as $$
declare
  base int := octet_length(jsonb_build_object('pad', '')::text);
begin
  return jsonb_build_object('pad', repeat('x', n - base));
end $$;

-- ---- 大きさの境目 ----
select is(octet_length(pg_temp.vr_bytes(8192)::text), 8192, 'T4-03 下準備: 8192 バイトのオブジェクトを作れている');
select lives_ok($$ select pg_temp.make_post(1, pg_temp.hs1('8192') || jsonb_build_object('villain_reads', pg_temp.vr_bytes(8192))) $$,
  'T4-03 villain_reads は text でちょうど 8192 バイトまで保存する');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('8193') || jsonb_build_object('villain_reads', pg_temp.vr_bytes(8193))) $$, '23514', null,
  'T4-03 villain_reads は 8193 バイトで断る');
-- 文字数ではなくバイト数（あ は 3 バイト。2800 文字 = 8400 バイト）
select is(char_length(pg_temp.vr_bytes(8400, 'あ')->'BB'->>'pad') < 8192, true, 'T4-03 下準備: 文字数は 8192 未満だがバイト数は超える');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('あ') || jsonb_build_object('villain_reads', pg_temp.vr_bytes(8400, 'あ'))) $$, '23514', null,
  'T4-03 villain_reads の上限はバイト数（多バイト文字で 8192 バイトを超えたら断る）');
select lives_ok($$ select pg_temp.make_post(1, pg_temp.hs1('あ ok') || jsonb_build_object('villain_reads', pg_temp.vr_bytes(8190, 'あ'))) $$,
  'T4-03 villain_reads は多バイト文字でも 8192 バイトに収まれば保存する');

select is(octet_length(pg_temp.mtt_bytes(1024)::text), 1024, 'T4-03 下準備: 1024 バイトの mtt を作れている');
select lives_ok($$ select pg_temp.make_post(1, pg_temp.hs1('m1024') || jsonb_build_object('fmt', 'mtt', 'rake', null, 'mtt', pg_temp.mtt_bytes(1024))) $$,
  'T4-03 mtt は text でちょうど 1024 バイトまで保存する');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('m1025') || jsonb_build_object('fmt', 'mtt', 'rake', null, 'mtt', pg_temp.mtt_bytes(1025))) $$, '23514', null,
  'T4-03 mtt は 1025 バイトで断る');

-- ---- 形（最後の砦） ----
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('数値') || '{"villain_reads":1}') $$, '23514', null, 'T4-03 villain_reads は数値を断る');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('文字') || '{"villain_reads":"x"}') $$, '23514', null, 'T4-03 villain_reads は文字列を断る');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('mtt配列') || '{"mtt":[]}') $$, '23514', null, 'T4-03 mtt は配列を断る');
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('mtt数') || '{"mtt":5}') $$, '23514', null, 'T4-03 mtt は数値を断る');
-- 記録（特性）: villain_reads に JSON の null を直接渡すと、{} にならず形の制約で断られる（mtt の null は null になる）。create-post は必ず {} を渡すので画面からは起きない
select throws_ok($$ select pg_temp.make_post(1, pg_temp.hs1('vr null') || '{"villain_reads":null}') $$, '23514', null,
  'T4-03 記録: insert_post に villain_reads の JSON null を直接渡すと形の制約で断る（{} にはならない）');
-- 記録（特性）: mtt の空のオブジェクトは null にならずそのまま保存され、一覧の has_mtt が true になる（create-post は空を null にして渡す）
select pg_temp.make_post(1, pg_temp.hs1('mtt空') || '{"fmt":"mtt","rake":null,"mtt":{}}') as mtt_empty \gset
select is((select mtt from public.post_hands where post_id = :'mtt_empty'), '{}'::jsonb, 'T4-03 記録: mtt の {} は {} のまま保存する');

-- ---- insert_post → get_post_detail の一周（投稿者・回答者・未回答者で同じ値）----
-- SB・BB の 2 席に Read。BB の Spot は無し（判断地点より前の実際の Action は Call・Check のみ）。SB は Fold to Steal の Spot Read
select pg_temp.make_post(1, pg_temp.hs1('一周') || $j$ {
  "fmt": "mtt", "rake": null,
  "villain_reads": {
    "SB": {"vpip": 18, "reads": [{"scope":"spot","street":"pf","action":"fold_steal","texture":null,"runout":null,"size":null,"lean":"under","strong":true}]},
    "BB": {"vpip": 30, "pfr": 12, "agg": 1, "image": 3,
           "reads": [{"scope":"general","street":"turn","action":"barrel","texture":null,"runout":["flush","pair"],"size":"big","lean":"value","strong":false},
                     {"scope":"general","street":"flop","action":"raise","texture":{"high":"a","connect":"none"},"runout":null,"size":null,"lean":"bluff","strong":true}]}
  },
  "mtt": {"speed": 100, "rank": 12, "left": 58, "paid": 50, "entries": 320, "avg": 35.5, "prize": "flat"}
} $j$::jsonb) as rt \gset

select pg_temp.login(3);
select public.get_post_detail(:'rt') as du \gset
select pg_temp.logout();
select pg_temp.login(1);
select public.get_post_detail(:'rt') as da \gset
select pg_temp.logout();
select pg_temp.login(2);
insert into public.answers (post_id, paint) values (:'rt', pg_temp.paint('[[0,0,0,20,0]]'));
select public.get_post_detail(:'rt') as dr \gset
select pg_temp.logout();

select is((:'du'::jsonb)->>'viewer', 'unanswered', 'T4-03 未回答者として読めている');
select is((:'du'::jsonb)->'hand'->'villain_reads'->'BB'->'reads'->1->>'lean', 'bluff', 'T4-03 一周: 入れた villain_reads が未回答者にそのまま返る（2 件目の Read）');
select is((:'du'::jsonb)->'hand'->'villain_reads', (:'da'::jsonb)->'hand'->'villain_reads', 'T4-03 villain_reads は未回答者・投稿者で同じ');
select is((:'du'::jsonb)->'hand'->'villain_reads', (:'dr'::jsonb)->'hand'->'villain_reads', 'T4-03 villain_reads は未回答者・回答者で同じ');
select is((:'du'::jsonb)->'hand'->'mtt', (:'dr'::jsonb)->'hand'->'mtt', 'T4-03 mtt は未回答者・回答者で同じ');
select is((:'du'::jsonb)->'hand'->'mtt'->>'avg', '35.5', 'T4-03 一周: mtt.avg の小数第 1 位が保たれる');
select is((:'du'::jsonb)->'hand'->'villain_reads'->'BB'->'reads'->0->'runout', '["flush","pair"]'::jsonb, 'T4-03 一周: runout の配列が保たれる');
select is((:'du'::jsonb)->'hand'->'villain_reads'->'SB'->'reads'->0->>'strong', 'true', 'T4-03 一周: strong の真偽値が保たれる');

-- ---- T4-05 不変条件 10: 未回答者に、判断地点より後の Action・Board・Hero のハンドが返らない ----
select is(jsonb_array_length((:'du'::jsonb)->'hand'->'actions'), 10, 'T4-05 未回答者の actions は停止位置（10）より前だけ');
select is(((:'du'::jsonb)->'hand'->'actions') @> '[{"street":"river"}]'::jsonb, false, 'T4-05 未回答者の actions に River の Action が無い');
select is(((:'du'::jsonb)->'hand'->'actions') @> '[{"pos":"BTN","type":"bet","to":6.5}]'::jsonb, false, 'T4-05 未回答者の actions に Hero のスポットの Action（Bet 6.5）が無い');
select is((:'du'::jsonb)->'hand'->'board', '["Kh","8d","3c","2s"]'::jsonb, 'T4-05 未回答者の board はスポットのストリートまで（River の 7h が無い）');
select is((:'du'::jsonb)->'secrets', 'null'::jsonb, 'T4-05 未回答者に secrets（Hero のハンド・known_cards）が返らない');
select is((:'du'::jsonb)->'aggregate', 'null'::jsonb, 'T4-05 未回答者に集計が返らない');
select is(((:'du'::jsonb)::text) ~ '"(Ad|Kd|Ks|Js|7h)"', false, 'T4-05 未回答者の応答の全体に Hero のハンド・known_cards・River のカードの文字列が無い');
-- 返るキーは決めたものだけ（新しいキーを足したらここで気づく）
select is((select array_agg(k order by k) from jsonb_object_keys((:'du'::jsonb)->'hand') k),
  array['actions','ante','bb','board','mtt','rake','sb','spot_index','stacks','stop_index','truncated','villain_reads'],
  'T4-05 未回答者の hand のキーは決めたものだけ');
select is((select array_agg(k order by k) from jsonb_object_keys(:'du'::jsonb) k),
  array['aggregate','answered','hand','my_answer','post','secrets','viewer'], 'T4-05 未回答者の応答のトップのキーは決めたものだけ');
select is(((:'du'::jsonb)->'hand'->>'truncated')::boolean, true, 'T4-05 truncated = true');
-- 回答後は全部見える（対照）
select is(jsonb_array_length((:'dr'::jsonb)->'hand'->'actions'), 15, 'T4-05 対照: 回答後は全 Action');
select is((:'dr'::jsonb)->'secrets'->'hero_cards', '["Ad","Kd"]'::jsonb, 'T4-05 対照: 回答後は Hero のハンドが返る');

-- 未回答者に返る villain_reads の Spot Read は、返る Action（停止位置より前）の範囲の Action だけを指している
select is((select bool_and(e->>'street' = 'pf' and e->>'action' = 'fold_steal')
           from jsonb_array_elements((:'du'::jsonb)->'hand'->'villain_reads'->'SB'->'reads') e where e->>'scope' = 'spot'),
  true, 'T4-05 Spot Read の Action は未回答者に見える Action の範囲（Preflop の Fold to Steal）');

-- ---- 前の版の投稿（キーが無い）----
select pg_temp.make_post(1, pg_temp.hs1('旧の投稿')) as old \gset
select pg_temp.login(3);
select public.get_post_detail(:'old') as dold \gset
select pg_temp.logout();
select is((:'dold'::jsonb)->'hand'->'villain_reads', '{}'::jsonb, 'T4-04 前の版の投稿: villain_reads は {}');
select is((:'dold'::jsonb)->'hand'->'mtt', 'null'::jsonb, 'T4-04 前の版の投稿: mtt は JSON の null');

-- ---- list_posts ----
select pg_temp.login(3);
select is((select has_reads from public.list_posts() where title = '一周'), true, 'T4-03 list_posts: Read のある投稿は has_reads');
select is((select has_mtt from public.list_posts() where title = '一周'), true, 'T4-03 list_posts: MTT のある投稿は has_mtt');
select is((select has_reads or has_mtt from public.list_posts() where title = '旧の投稿'), false, 'T4-03 list_posts: 前の版の投稿は印なし');
select is((select has_reads from public.list_posts() where title = 'vr null'), null, 'T4-03 下準備: 断られた投稿は一覧に無い');
select is((select has_mtt from public.list_posts() where title = 'mtt空'), true, 'T4-03 記録: mtt が {} の投稿は has_mtt = true（create-post は空を null にするので起きない）');
select pg_temp.logout();

-- list_posts の戻りの列（型を作り直したので、決めた列だけ）
select is((select array_agg(u.n order by u.o) from pg_proc p cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as u(n, m, o)
           where p.proname = 'list_posts' and p.pronamespace = 'public'::regnamespace and u.m = 't'),
  array['id','created_at','title','fmt','hero','street','effective_stack','answer_count','is_mine','answered_by_me','can_delete','players','board','has_reads','has_mtt'],
  'T4-03 list_posts の戻りの列は決めたもの（has_reads・has_mtt を含む）');

-- ---- 権限・security definer・search_path が前と同じ ----
select is((select count(*)::int from pg_proc where proname = 'list_posts' and pronamespace = 'public'::regnamespace), 1, 'T4-03 list_posts は 1 つだけ（古い版が残っていない）');
select is((select prosecdef from pg_proc where proname = 'list_posts' and pronamespace = 'public'::regnamespace), true, 'T4-03 list_posts は security definer');
select is((select prosecdef from pg_proc where proname = 'get_post_detail' and pronamespace = 'public'::regnamespace), true, 'T4-03 get_post_detail は security definer');
select is((select prosecdef from pg_proc where proname = 'insert_post' and pronamespace = 'public'::regnamespace), true, 'T4-03 insert_post は security definer');
select is((select bool_and(exists (select 1 from unnest(p.proconfig) c where c ~ '^search_path=(""|'''')?$'))
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('list_posts', 'get_post_detail', 'insert_post')),
  true, 'T4-03 list_posts・get_post_detail・insert_post の search_path が空に固定されている');
select is(has_function_privilege('authenticated', 'public.list_posts(text,text,text,jsonb,integer)', 'execute'), true, 'T4-03 authenticated は list_posts を実行できる');
select is(has_function_privilege('anonymous', 'public.list_posts(text,text,text,jsonb,integer)', 'execute'), false, 'T4-03 anonymous は list_posts を実行できない');
select is(has_function_privilege('authenticated', 'public.get_post_detail(uuid)', 'execute'), true, 'T4-03 authenticated は get_post_detail を実行できる');
select is(has_function_privilege('anonymous', 'public.get_post_detail(uuid)', 'execute'), false, 'T4-03 anonymous は get_post_detail を実行できない');
select is(has_function_privilege('authenticated', 'public.insert_post(uuid,jsonb)', 'execute')
          or has_function_privilege('anonymous', 'public.insert_post(uuid,jsonb)', 'execute'), false, 'T4-03 insert_post は authenticated・anonymous から直接呼べない');

-- 利用者は post_hands の villain_reads・mtt を直接読めず、書き換えられない
select pg_temp.login(1);
select throws_ok($$ select villain_reads from public.post_hands $$, '42501', null, 'T4-03 authenticated は post_hands.villain_reads を直接読めない');
select throws_ok($$ update public.post_hands set villain_reads = '{}'::jsonb $$, '42501', null, 'T4-03 投稿者でも post_hands.villain_reads を書き換えられない');
select throws_ok($$ update public.post_hands set mtt = null $$, '42501', null, 'T4-03 投稿者でも post_hands.mtt を書き換えられない');
select throws_ok(format($$ select public.insert_post(%L::uuid, pg_temp.hs1('直接')) $$, pg_temp.uid(1)), '42501', null, 'T4-03 利用者が insert_post を直接呼べない');
select pg_temp.logout();

select * from finish(true);
rollback;

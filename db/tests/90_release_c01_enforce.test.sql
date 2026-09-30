-- C-01（リリース前テスト。docs/release-test-plan.md §3 C）: 不変条件 4・6・8・9・10 の DB での強制。
-- 既存の 01〜07 に無い場合を足す（未回答の応答に何が含まれるか、スポットの Street ごとの Board、権限の一覧、
-- 許可リスト・sub の無いトークン、回答の二重・書き換えの回り道、識別情報の露出）。
begin;
\ir helpers/setup.psql
select plan(83);

-- 1 = 投稿者（post・pflop・priver・ppf）、2 = post2 の投稿者、3 = 未回答の閲覧者、4 = 回答者、5 = 許可リストの人、6 = 予備、7 = 管理者
select pg_temp.create_user(n) from generate_series(1, 7) as n;
insert into public.app_admins (uid) values (pg_temp.uid(7));
update public.app_settings set daily_post_limit = 100;

select pg_temp.make_post(1) as post \gset
select pg_temp.make_post(2, pg_temp.hs1('P2')) as post2 \gset
select pg_temp.make_post(1, pg_temp.hs1('FLOP') || '{"street":"flop","spot_index":7,"stop_index":7,"pot_base":9.1,"min_to":3.6,"max_to":97.5}') as pflop \gset
select pg_temp.make_post(1, pg_temp.hs1('RIVER') || '{"street":"river","spot_index":13,"stop_index":13,"pot_base":50,"min_to":15,"max_to":90}') as priver \gset
-- サーバー（create-post）は作らない形（Preflop なのに Board が入っている）でも、DB の出し分けが Board を返さないこと（多重の防御）
select pg_temp.make_post(1, pg_temp.hs1('PF') || '{"street":"pf","spot_index":3,"stop_index":3,"pot_base":1.5,"min_to":2,"max_to":100}') as ppf \gset
select pg_temp.paint('[[0,0,0,20,0]]') as aa \gset

-- ================================================================
-- 不変条件 10: 未回答者の get_post_detail の応答に、隠す情報が一切含まれない
-- ================================================================
select pg_temp.login(3);
select public.get_post_detail(:'post') as d \gset
select public.get_post_detail(:'pflop') as dflop \gset
select public.get_post_detail(:'priver') as driver \gset
select public.get_post_detail(:'ppf') as dpf \gset
select pg_temp.logout();

select ok((:'d'::jsonb)::text !~ '"(Ad|Kd|Ks|Js)"', 'C-01 未回答者の応答に Hero のハンド・known_cards のカードが含まれない');
select ok((:'d'::jsonb)::text !~ 'hero_cards|known_cards', 'C-01 未回答者の応答に hero_cards・known_cards のキーが無い');
select ok((:'d'::jsonb)::text !~ '7h', 'C-01 ターンのスポットの応答にリバーのカードが含まれない');
select is(jsonb_path_query_array((:'d'::jsonb), '$.hand.actions[*] ? (@.street == "river")'), '[]'::jsonb, 'C-01 ターンのスポットの応答にリバーのアクションが含まれない');
select ok((:'d'::jsonb)::text not like '%' || pg_temp.uid(1)::text || '%', 'C-01 応答に投稿者の UID が含まれない（get_post_detail は author_uid を返さない）');

select is((:'dflop'::jsonb)->'hand'->'board', '["Kh","8d","3c"]'::jsonb, 'C-01 Flop のスポットの Board は 3 枚まで');
select is(jsonb_array_length((:'dflop'::jsonb)->'hand'->'actions'), 7, 'C-01 Flop のスポットのアクションは spot_index（7）件まで');
select is((:'driver'::jsonb)->'hand'->'board', '["Kh","8d","3c","2s","7h"]'::jsonb, 'C-01 River のスポットの Board は 5 枚');
select is(jsonb_array_length((:'driver'::jsonb)->'hand'->'actions'), 13, 'C-01 River のスポットのアクションは spot_index（13）件まで');
select is((:'dpf'::jsonb)->'hand'->'board', '[]'::jsonb, 'C-01 Preflop のスポットは、保存された Board があっても返さない');
select is(jsonb_array_length((:'dpf'::jsonb)->'hand'->'actions'), 3, 'C-01 Preflop のスポットのアクションは spot_index（3）件まで');

-- 別の投稿に回答しても、この投稿の閲覧の権利にならない（権利は投稿ごと）
select pg_temp.login(3);
insert into public.answers (post_id, paint) values (:'post2', :'aa');
select is((select count(*)::int from public.post_secrets), 1, 'C-01 別の投稿に回答すると、その投稿の post_secrets だけ読める');
select is((select count(*)::int from public.post_secrets where post_id = :'post'), 0, 'C-01 回答していない投稿の post_secrets は読めない');
select is((select count(*)::int from public.post_aggregates where post_id = :'post'), 0, 'C-01 回答していない投稿の post_aggregates は読めない');
select is(public.can_view_results(:'post'), false, 'C-01 can_view_results は投稿ごと');
select is(public.can_view_aggregate(:'post'), false, 'C-01 can_view_aggregate は投稿ごと');
select is(public.can_view_results(gen_random_uuid()), false, 'C-01 存在しない投稿は false');
select is((public.get_post_detail(:'post'))->'secrets', 'null'::jsonb, 'C-01 別の投稿への回答のあとも、この投稿の secrets は null');
select pg_temp.logout();

select pg_temp.login(2);
select is((select count(*)::int from public.post_secrets), 1, 'C-01 投稿者が読める post_secrets は自分の投稿の分だけ');
select pg_temp.logout();

-- 管理者も特別扱いされない（他人の回答・集計・Hero のハンドは読めない）
select pg_temp.login(7);
select is((select count(*)::int from public.answers), 0, 'C-01 管理者も他人の回答は読めない');
select is((select count(*)::int from public.post_aggregates), 0, 'C-01 管理者も回答するまで集計は読めない');
select is((select count(*)::int from public.post_secrets), 0, 'C-01 管理者も回答するまで他人の Hero のハンドは読めない');
select pg_temp.logout();

-- ================================================================
-- 不変条件 9・4: 回答の二重・書き換え・集計の改ざんの回り道
-- ================================================================
select pg_temp.login(4);
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L), (%L, %L) $$, :'post', :'aa', :'post', :'aa'),
  '23505', null, 'C-01 同じ文で同じ投稿に 2 件入れると 23505');
select is((select count(*)::int from public.answers), 0, 'C-01 失敗した文は 1 件も残らない');
insert into public.answers (post_id, paint) values (:'post', :'aa');
select lives_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) on conflict do nothing $$, :'post', pg_temp.paint('[[0,20,0,0,0]]')),
  'C-01 ON CONFLICT DO NOTHING は 2 回目を捨てるだけ');
select is((select n from public.post_aggregates where post_id = :'post'), 1, 'C-01 ON CONFLICT DO NOTHING のあとも集計の N は 1');
select is((select answer_count from public.posts where id = :'post'), 1, 'C-01 ON CONFLICT DO NOTHING のあとも answer_count は 1');
select is((select count(*)::int from public.answers where post_id = :'post'), 1, 'C-01 回答は 1 件のまま');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) on conflict (post_id, uid) do update set paint = excluded.paint $$, :'post', pg_temp.paint('[[0,20,0,0,0]]')),
  '42501', null, 'C-01 ON CONFLICT DO UPDATE で回答を書き換えられない（update 権限なし）');
select throws_ok($$ delete from public.answers $$, '42501', null, 'C-01 回答を delete できない');
select throws_ok($$ truncate public.answers $$, '42501', null, 'C-01 answers を truncate できない');
select throws_ok(format($$ update public.posts set answer_count = 99 where id = %L $$, :'post'), '42501', null, 'C-01 answer_count を書き換えられない');
select throws_ok(format($$ update public.post_aggregates set n = 99 where post_id = %L $$, :'post'), '42501', null, 'C-01 集計を書き換えられない');
select throws_ok(format($$ delete from public.post_aggregates where post_id = %L $$, :'post'), '42501', null, 'C-01 集計を消せない');
select throws_ok($$ insert into public.post_aggregates (post_id) values (gen_random_uuid()) $$, '42501', null, 'C-01 集計の行を作れない');
select throws_ok(format($$ update public.post_secrets set hero_cards = '{2c,2d}' where post_id = %L $$, :'post'), '42501', null, 'C-01 post_secrets を書き換えられない');
select throws_ok($$ insert into public.post_secrets (post_id, hero_cards) values (gen_random_uuid(), '{2c,2d}') $$, '42501', null, 'C-01 post_secrets に書けない');
select throws_ok($$ insert into public.post_hands (post_id) values (gen_random_uuid()) $$, '42501', null, 'C-01 post_hands に書けない');
select throws_ok($$ insert into public.app_admins (uid) values (public.current_uid()) $$, '42501', null, 'C-01 自分を管理者にできない');
select throws_ok($$ insert into public.app_allowlist (uid) values (public.current_uid()) $$, '42501', null, 'C-01 自分を許可リストに入れられない');
select throws_ok($$ update public.app_settings set allowlist_enabled = false $$, '42501', null, 'C-01 許可リストの設定を変えられない');
select throws_ok($$ update public.app_settings set daily_post_limit = 100 $$, '42501', null, 'C-01 投稿上限を変えられない');
select throws_ok($$ insert into public.post_quota (uid, day, count) values (public.current_uid(), current_date, 0) $$, '42501', null, 'C-01 投稿数の枠に書けない');
select throws_ok($$ delete from public.post_quota $$, '42501', null, 'C-01 投稿数の枠を消せない');
select pg_temp.logout();

-- 全体の整合（トリガが数える回数と、実際の件数が常に合う）
select is((select count(*)::int from public.posts p where p.answer_count <> (select count(*) from public.answers a where a.post_id = p.id)),
  0, 'C-01 すべての投稿で answer_count = 回答の件数');
select is((select count(*)::int from public.posts p join public.post_aggregates g on g.post_id = p.id where g.n <> p.answer_count),
  0, 'C-01 すべての投稿で集計の N = answer_count');

-- ================================================================
-- 不変条件 4・8: 権限・RLS・ポリシーの一覧が決めたとおり（増えたら気づく）
-- ================================================================
select is(
  (select coalesce(jsonb_object_agg(t, privs), '{}'::jsonb) from (
     select c.relname::text as t,
            to_jsonb(array(select pv from unnest(array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) as pv
                           where case when pv in ('DELETE', 'TRIGGER', 'TRUNCATE') then has_table_privilege('authenticated', c.oid, pv)
                                      else has_any_column_privilege('authenticated', c.oid, pv) end
                           order by pv)) as privs
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')) x
   where privs <> '[]'::jsonb),
  '{"answers":["INSERT","SELECT"],"post_aggregates":["SELECT"],"post_secrets":["SELECT"],"posts":["DELETE","SELECT"]}'::jsonb,
  'C-01 authenticated の表・列の権限は決めたとおり（post_hands・app_*・post_quota には何も無い）');
select is(
  (select coalesce(jsonb_object_agg(t, privs), '{}'::jsonb) from (
     select c.relname::text as t,
            to_jsonb(array(select pv from unnest(array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) as pv
                           where case when pv in ('DELETE', 'TRIGGER', 'TRUNCATE') then has_table_privilege('anonymous', c.oid, pv)
                                      else has_any_column_privilege('anonymous', c.oid, pv) end
                           order by pv)) as privs
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')) x
   where privs <> '[]'::jsonb),
  '{}'::jsonb, 'C-01 anonymous の表・列の権限は何も無い');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), 0, 'C-01 public のすべての表で RLS が有効');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm', 'f')), 0, 'C-01 public に view・materialized view・外部表が無い（RLS を迂回する道が無い）');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege('authenticated', c.oid, 'USAGE') or has_sequence_privilege('anonymous', c.oid, 'USAGE'))), 0,
  'C-01 シーケンスの権限が authenticated・anonymous に無い');
select is(
  (select jsonb_object_agg(tablename, cmds) from (
     select tablename::text, jsonb_agg(cmd order by cmd) as cmds from pg_policies where schemaname = 'public' group by tablename) x),
  '{"answers":["INSERT","SELECT"],"post_aggregates":["SELECT"],"post_secrets":["SELECT"],"posts":["DELETE","SELECT"]}'::jsonb,
  'C-01 ポリシーがあるのは決めた表・操作だけ（ほかは全拒否）');
select is((select count(*)::int from pg_policies where schemaname = 'public' and not (roles = array['authenticated']::name[])), 0,
  'C-01 すべてのポリシーの対象は authenticated だけ（PUBLIC・anonymous 向けは無い）');
select is((select count(*)::int from pg_roles where rolname in ('authenticated', 'anonymous') and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)), 0,
  'C-01 authenticated・anonymous は RLS を迂回できる権限・ロールの作成権限を持たない');
select is(pg_has_role('authenticated', current_user, 'usage') or pg_has_role('anonymous', current_user, 'usage'), false,
  'C-01 authenticated・anonymous は DB の所有者の権限を引き継がない');

-- ================================================================
-- 不変条件 6: 識別情報（メール・名前）を見せない・置かない
-- ================================================================
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and column_name ~* '(email|name|avatar|image|phone|ip_?addr)'), 0,
  'C-01 public の表にメール・名前・画像・電話・IP の列が無い');
select is((select count(*)::int from information_schema.tables t
           where t.table_schema in ('neon_auth', 'migrations')
             and (has_any_column_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'SELECT')
                  or has_any_column_privilege('anonymous', format('%I.%I', t.table_schema, t.table_name), 'SELECT'))), 0,
  'C-01 neon_auth（メール・名前）と migrations の表を authenticated・anonymous は読めない');

-- F-006（2026-09-30 さつき）: posts の author_uid（投稿者の UID）は Data API から読めない（列単位の権限）。ほかの列は読める
select pg_temp.login(3);
select throws_ok($$ select author_uid from public.posts $$, '42501', null, 'F-006 posts の author_uid は読めない');
select ok((select count(*) from public.posts where title is not null) > 0, 'F-006 posts の author_uid 以外の列は読める');
select pg_temp.logout();

-- ================================================================
-- 不変条件 8: sub の無いトークン（authenticated だが誰か分からない）は何も読めない・書けない・消せない
-- ================================================================
create or replace function pg_temp.login_nosub() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
end $$;

select pg_temp.login_nosub();
select is((select count(*)::int from public.posts), 0, 'C-01 sub の無い authenticated は posts を読めない');
select is((select public.whoami()), '{"admin": false, "allowed": false}'::jsonb, 'C-01 sub の無い authenticated の whoami は allowed = false');
select throws_ok(format($$ select public.get_post_detail(%L) $$, :'post'), 'P0001', 'not_allowed', 'C-01 sub の無い authenticated の get_post_detail は not_allowed');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'post', :'aa'), 'P0001', 'not_authenticated', 'C-01 sub の無い authenticated は回答できない');
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'not_authenticated', 'C-01 sub の無い authenticated は delete_my_account できない');
select pg_temp.logout();
select is((select count(*)::int from neon_auth."user" where id in (select pg_temp.uid(n) from generate_series(1, 7) as n)), 7,
  'C-01 sub の無い delete_my_account は誰のアカウントも消さなかった');

-- sub が UUID でない（壊れたトークン）は、何も返さずに失敗する
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"not-a-uuid"}', true);
select set_config('role', 'authenticated', true);
select throws_ok($$ select count(*) from public.posts $$, '22P02', null, 'C-01 sub が UUID でないと posts の読み出しは失敗する（何も返さない）');
select throws_ok($$ select * from public.list_posts() $$, '22P02', null, 'C-01 sub が UUID でないと list_posts は失敗する');
select pg_temp.logout();

-- ================================================================
-- list_posts の件数の上限（一覧の負荷）
-- ================================================================
select pg_temp.make_post(1, pg_temp.hs1('L' || g)) from generate_series(1, 55) as g;
select pg_temp.login(3);
select is((select count(*)::int from public.list_posts(p_limit => 1000)), 50, 'C-01 list_posts の limit は 50 まで（60 件あっても）');
select is((select count(*)::int from public.list_posts(p_limit => 0)), 1, 'C-01 list_posts の limit 0 は 1 件');
select is((select count(*)::int from public.list_posts(p_limit => -5)), 1, 'C-01 list_posts の limit が負でも 1 件');
select is((select count(*)::int from public.list_posts(p_tab => 'x')), 0, 'C-01 list_posts の p_tab が想定外の値なら「自分の投稿」だけ（他人の分は返らない）');
select pg_temp.logout();

-- ================================================================
-- insert_post の入口（Function が所有者として呼ぶ）: 消えたアカウントの JWT・上限 0
-- ================================================================
select throws_ok(format($$ select public.insert_post(%L, %L::jsonb) $$, gen_random_uuid(), pg_temp.hs1('GHOST')), '23503', null,
  'C-01 存在しないユーザー（削除済みのアカウントの JWT が 15 分残っている場合）の insert_post は 23503 で断られる');
select is((select count(*)::int from public.post_quota where uid not in (select id from neon_auth."user")), 0, 'C-01 断られた投稿は、存在しないユーザーの枠の行も残さない');
update public.app_settings set daily_post_limit = 0;
select throws_ok(format($$ select public.insert_post(%L, %L::jsonb) $$, pg_temp.uid(2), pg_temp.hs1('ZERO')), 'P0001', 'daily_limit', 'C-01 daily_post_limit = 0 なら誰も投稿できない');
update public.app_settings set daily_post_limit = 100;

-- ================================================================
-- 不変条件 8: 許可リスト（リスト外は読めない・書けない・作れない・消せない）
-- ================================================================
insert into public.app_allowlist (uid) values (pg_temp.uid(2)), (pg_temp.uid(5));
update public.app_settings set allowlist_enabled = true;

select pg_temp.login(3);   -- リスト外。許可リストが有効になる前に post2 へ回答済み
select is((select count(*)::int from public.post_aggregates), 0, 'C-01 許可リストから外れると、回答済みの集計も読めない');
select is((select count(*)::int from public.post_secrets), 0, 'C-01 許可リストから外れると、回答済みの Hero のハンドも読めない');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'pflop', :'aa'), '42501', null, 'C-01 許可リスト外は回答を送れない（RLS）');
select pg_temp.logout();

select pg_temp.login(1);   -- リスト外の投稿者
delete from public.posts where id = :'post';
select pg_temp.logout();
select is((select count(*)::int from public.posts where id = :'post'), 1, 'C-01 許可リスト外の投稿者は自分の投稿も削除できない');
select throws_ok(format($$ select public.insert_post(%L, %L::jsonb) $$, pg_temp.uid(1), pg_temp.hs1('NEW')), 'P0001', 'not_allowed', 'C-01 許可リスト外は insert_post が not_allowed');
select is((select count(*)::int from public.post_quota where uid = pg_temp.uid(1) and day = (now() at time zone 'utc')::date and count = 59), 1,
  'C-01 not_allowed で断られた投稿は、投稿数の枠を使わない（59 件のまま）');

select pg_temp.login(5);   -- リストに載っている
select is((select count(*)::int from public.list_posts(p_limit => 1000)), 50, 'C-01 許可リストの人は list_posts を読める');
select pg_temp.logout();
select pg_temp.login(7);   -- 管理者（リストには無いが常に許可）
select is((select public.whoami()), '{"admin": true, "allowed": true}'::jsonb, 'C-01 管理者は許可リストに無くても allowed');
select is((select count(*)::int from public.list_posts(p_limit => 1000)), 50, 'C-01 管理者は list_posts を読める');
select pg_temp.logout();

select * from finish(true);
rollback;

-- C-02（リリース前テスト。docs/release-test-plan.md §3 C）: security definer の関数すべて。
-- search_path の固定、grant / revoke、呼んだ人での絞り込み、関数・スキーマの書き換えができないこと、直接呼べない関数。
begin;
\ir helpers/setup.psql
select plan(40);

-- 1 = 投稿者 A・C、2 = B の投稿者（A に回答）、3 = A・B に回答、4 = 管理者
select pg_temp.create_user(n) from generate_series(1, 4) as n;
insert into public.app_admins (uid) values (pg_temp.uid(4));
update public.app_settings set daily_post_limit = 100;

-- ================================================================
-- カタログ: 関数の一覧・search_path・所有者・実行権限
-- ================================================================
-- security definer の関数の一覧（増えたら、その関数の見直しが要る）
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef),
  array['admin_delete_unanswered_posts', 'answers_after_delete', 'answers_after_insert', 'answers_before_insert',
        'apply_answer_to_aggregate', 'can_view_aggregate', 'can_view_results', 'delete_my_account', 'get_post_detail',
        'insert_post', 'is_admin', 'is_allowed', 'is_allowed_uid', 'list_posts', 'whoami'],
  'C-02 security definer の関数は決めたものだけ');

-- public のすべての関数（definer でなくても）に search_path が空で固定されている
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c ~ '^search_path=(""|'''')?$')),
  null::text[], 'C-02 public のすべての関数で search_path が空に固定されている');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and pg_get_userbyid(p.proowner) in ('authenticated', 'anonymous')), 0,
  'C-02 関数の所有者が authenticated・anonymous ではない');

-- PUBLIC（全員）に実行権限が残っている関数が無い（proacl が null = 既定の PUBLIC 実行可）
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))), 0,
  'C-02 PUBLIC に実行権限が残っている public の関数が無い');

-- authenticated が実行できる definer の関数は、決めたものだけ
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')),
  array['admin_delete_unanswered_posts', 'can_view_aggregate', 'can_view_results', 'delete_my_account', 'get_post_detail',
        'is_admin', 'is_allowed', 'list_posts', 'whoami'],
  'C-02 authenticated が実行できる security definer の関数は決めたものだけ');

-- 利用者が関数・スキーマを作り換えられない（検索パス・関数の差し替えができない）
select is(has_schema_privilege('authenticated', 'public', 'CREATE') or has_schema_privilege('anonymous', 'public', 'CREATE'), false,
  'C-02 authenticated・anonymous は public スキーマにオブジェクトを作れない');
select is(has_database_privilege('authenticated', current_database(), 'CREATE') or has_database_privilege('anonymous', current_database(), 'CREATE'), false,
  'C-02 authenticated・anonymous はスキーマを作れない');

select pg_temp.login(1);
select throws_ok($$ create function public.evil() returns int language sql as 'select 1' $$, '42501', null, 'C-02 public に関数を作れない');
select throws_ok($$ create or replace function public.is_admin() returns boolean language sql as 'select true' $$, '42501', null, 'C-02 is_admin を差し替えられない');
select throws_ok($$ alter function public.is_allowed() set search_path = pg_temp $$, '42501', null, 'C-02 関数の search_path を書き換えられない');
select throws_ok($$ drop function public.whoami() $$, '42501', null, 'C-02 関数を消せない');
select throws_ok($$ create schema evil $$, '42501', null, 'C-02 スキーマを作れない');
select throws_ok($$ create table public.evil (id int) $$, '42501', null, 'C-02 public に表を作れない');
select pg_temp.logout();

-- ================================================================
-- 直接呼べない（内部用の）definer の関数
-- ================================================================
select pg_temp.login(1);
select throws_ok($$ select public.is_allowed_uid(public.current_uid()) $$, '42501', null, 'C-02 is_allowed_uid は呼べない（ほかの人の許可・管理者の状態を調べる道具にならない）');
select throws_ok(format($$ select public.apply_answer_to_aggregate(%L, %L, 1) $$, gen_random_uuid(), pg_temp.paint('[[0,0,0,20,0]]')), '42501', null, 'C-02 apply_answer_to_aggregate は呼べない（集計を直接いじれない）');
select throws_ok($$ select public.answers_before_insert() $$, '42501', null, 'C-02 トリガ関数 answers_before_insert は直接呼べない');
select throws_ok($$ select public.answers_after_insert() $$, '42501', null, 'C-02 トリガ関数 answers_after_insert は直接呼べない');
select throws_ok($$ select public.answers_after_delete() $$, '42501', null, 'C-02 トリガ関数 answers_after_delete は直接呼べない');
select throws_ok($$ select public.insert_post(public.current_uid(), '{}') $$, '42501', null, 'C-02 insert_post は呼べない');
select throws_ok($$ select public.validate_paint('\x00', '{}') $$, '42501', null, 'C-02 validate_paint は呼べない');
select throws_ok($$ select public.fail('x') $$, '42501', null, 'C-02 fail は呼べない');
select pg_temp.logout();

-- ================================================================
-- 呼んだ人での絞り込み
-- ================================================================
select pg_temp.make_post(1, pg_temp.hs1('A')) as a \gset
select pg_temp.make_post(2, pg_temp.hs1('B')) as b \gset
select pg_temp.make_post(1, pg_temp.hs1('C')) as c \gset

select pg_temp.login(2);
insert into public.answers (post_id, paint) values (:'a', pg_temp.paint('[[0,0,0,20,0]]'));
select is(public.is_admin(), false, 'C-02 is_admin は呼んだ人が管理者でなければ false');
select is(public.is_allowed(), true, 'C-02 is_allowed は許可リストが無効なら true');
select pg_temp.logout();

select pg_temp.login(3);
insert into public.answers (post_id, paint) values (:'a', pg_temp.paint('[[0,20,0,0,0]]')), (:'b', pg_temp.paint('[[0,0,0,20,0]]'));
select public.get_post_detail(:'a') as d3 \gset
select pg_temp.logout();
select pg_temp.login(2);
select public.get_post_detail(:'a') as d2 \gset
select pg_temp.logout();
select isnt((:'d3'::jsonb)->'my_answer'->>'paint', (:'d2'::jsonb)->'my_answer'->>'paint', 'C-02 get_post_detail の my_answer は呼んだ人自身の回答（他人のものを返さない）');
select is(left((:'d3'::jsonb)->'my_answer'->>'paint', 10), '\x14000000','C-02 ユーザー 3 の my_answer はユーザー 3 の paint');
select is(left((:'d2'::jsonb)->'my_answer'->>'paint', 10), '\x00001400', 'C-02 ユーザー 2 の my_answer はユーザー 2 の paint');
select is(((:'d2'::jsonb)->'aggregate'->>'n')::int, 2, 'C-02 回答後の aggregate は投稿全体の集計（2 人分）');

select pg_temp.login(4);   -- 管理者
select is(public.is_admin(), true, 'C-02 is_admin は管理者なら true');
select is((select public.whoami()), '{"admin": true, "allowed": true}'::jsonb, 'C-02 管理者の whoami');
-- 管理者も、回答するまで他人の投稿の集計・Hero のハンドを get_post_detail で得られない
select is((public.get_post_detail(:'a'))->'aggregate', 'null'::jsonb, 'C-02 管理者も回答前は get_post_detail の aggregate が null');
select is((public.get_post_detail(:'a'))->'secrets', 'null'::jsonb, 'C-02 管理者も回答前は get_post_detail の secrets が null');
select is(((public.get_post_detail(:'a'))->'post'->>'can_delete')::boolean, true, 'C-02 管理者は他人の投稿を can_delete');
select pg_temp.logout();

-- 容量の整理: 他人の回答がある投稿は消さない。p_before より新しい投稿は消さない
select pg_temp.login(4);
select is(public.admin_delete_unanswered_posts(now() - interval '1 day'), 0, 'C-02 admin_delete_unanswered_posts は p_before より新しい投稿を消さない');
select is(public.admin_delete_unanswered_posts(now()), 0, 'C-02 admin_delete_unanswered_posts は p_before ちょうどの投稿を消さない（created_at < p_before）');
select is(public.admin_delete_unanswered_posts(now() + interval '1 day'), 1, 'C-02 admin_delete_unanswered_posts は他人の回答がある投稿（A・B）を残し、回答のない C だけ消す');
select pg_temp.logout();
select is((select array_agg(title order by title) from public.posts), array['A', 'B'], 'C-02 A・B は残っている');

-- delete_my_account は呼んだ人の分だけを消す（ユーザー 2: B の投稿者・A に回答）
select pg_temp.login(2);
select public.delete_my_account();
select pg_temp.logout();
select is((select count(*)::int from neon_auth."user" where id in (select pg_temp.uid(n) from generate_series(1, 4) as n)), 3, 'C-02 delete_my_account は呼んだ人のアカウントだけ消す');
select is((select array_agg(title order by title) from public.posts), array['A'], 'C-02 delete_my_account は呼んだ人の投稿（B）だけ消す');
select is((select answer_count from public.posts where title = 'A'), 1, 'C-02 delete_my_account で、回答していた A の回答数が 2 → 1 に戻る');
select is((select array_agg(uid order by uid) from public.answers), array[pg_temp.uid(3)], 'C-02 delete_my_account は他人（3）の回答を消さない（B への回答は B と一緒に消える）');

select * from finish(true);
rollback;

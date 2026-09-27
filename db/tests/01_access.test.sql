-- DB-01〜04・11・12: 権限と閲覧制限（詳細仕様 02 章 §5）
begin;
\ir helpers/setup.psql
select plan(38);

select pg_temp.create_user(1);  -- 投稿者
select pg_temp.create_user(2);  -- 回答者
select pg_temp.create_user(3);  -- 未回答者
select pg_temp.make_post(1) as post \gset
select pg_temp.paint('[[0,0,0,20,0]]') as aa_call \gset

-- ---- DB-01 未認証（anon）は何も読めない・書けない・RPC を実行できない ----
select pg_temp.login(0);
select throws_ok($$ select * from public.posts $$, '42501', null, 'DB-01 未ログイン（anonymous）は posts を読めない');
select throws_ok($$ select * from public.post_hands $$, '42501', null, 'DB-01 未ログイン（anonymous）は post_hands を読めない');
select throws_ok($$ select * from public.post_secrets $$, '42501', null, 'DB-01 未ログイン（anonymous）は post_secrets を読めない');
select throws_ok($$ select * from public.host_answers $$, '42501', null, 'DB-01 未ログイン（anonymous）は host_answers を読めない');
select throws_ok($$ select * from public.answers $$, '42501', null, 'DB-01 未ログイン（anonymous）は answers を読めない');
select throws_ok($$ select * from public.post_aggregates $$, '42501', null, 'DB-01 未ログイン（anonymous）は post_aggregates を読めない');
select throws_ok($$ select * from public.app_settings $$, '42501', null, 'DB-01 未ログイン（anonymous）は app_settings を読めない');
select throws_ok($$ select * from public.app_admins $$, '42501', null, 'DB-01 未ログイン（anonymous）は app_admins を読めない');
select throws_ok($$ select * from public.app_allowlist $$, '42501', null, 'DB-01 未ログイン（anonymous）は app_allowlist を読めない');
select throws_ok($$ select * from public.post_quota $$, '42501', null, 'DB-01 未ログイン（anonymous）は post_quota を読めない');
select throws_ok(format($$ insert into public.answers (post_id, paint) values (%L, %L) $$, :'post', :'aa_call'),
  '42501', null, 'DB-01 未ログイン（anonymous）は answers に書けない');
select throws_ok($$ select public.whoami() $$, '42501', null, 'DB-01 未ログイン（anonymous）は whoami を実行できない');
select throws_ok($$ select * from public.list_posts() $$, '42501', null, 'DB-01 未ログイン（anonymous）は list_posts を実行できない');
select throws_ok(format($$ select public.get_post_detail(%L) $$, :'post'), '42501', null, 'DB-01 未ログイン（anonymous）は get_post_detail を実行できない');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'DB-01 未ログイン（anonymous）は delete_my_account を実行できない');
select throws_ok(format($$ select public.insert_post(%L, '{}') $$, pg_temp.uid(1)), '42501', null, 'DB-01 未ログイン（anonymous）は insert_post を実行できない');
select pg_temp.logout();

-- public スキーマの関数で anonymous が実行できるものが 1 つも無い（新しい関数に既定で付与されていない）
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anonymous', p.oid, 'execute')),
  0, 'DB-01 未ログイン（anonymous）が実行できる public の関数は無い');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  array['admin_delete_unanswered_posts', 'can_view_results', 'current_uid', 'delete_my_account', 'get_post_detail',
        'is_admin', 'is_allowed', 'list_posts', 'save_host_answer', 'whoami'],
  'DB-01 authenticated が実行できる関数は決めたものだけ');

-- ---- DB-03 / DB-04 authenticated は posts に直接書けない・insert_post を実行できない ----
select pg_temp.login(1);
select throws_ok($$ insert into public.posts (author_uid, title, fmt, hero, villain, street, effective_stack, keys, pot_base)
                   values (public.current_uid(), 't', 'cash', 'BTN', 'BB', 'pf', 100, '{check}', 1) $$,
  '42501', null, 'DB-03 posts に直接 insert できない');
select throws_ok(format($$ update public.posts set title = 'x' where id = %L $$, :'post'), '42501', null, 'DB-03 posts を update できない');
select throws_ok(format($$ select public.insert_post(%L, '{}') $$, pg_temp.uid(1)), '42501', null, 'DB-04 insert_post は authenticated から実行できない');
select throws_ok($$ select * from public.post_hands $$, '42501', null, 'post_hands は直接読めない（get_post_detail 経由のみ）');
select is((select public.whoami()), '{"admin": false, "allowed": true}'::jsonb, 'whoami（許可リスト無効）');
select pg_temp.logout();

-- ---- DB-12 閲覧制限: 未回答者は読めない、回答後は読める、投稿者は常に読める ----
select pg_temp.login(3);
select is((select count(*)::int from public.posts), 1, 'DB-12 未回答者も posts は読める');
select is((select count(*)::int from public.post_secrets), 0, 'DB-12 未回答者は post_secrets を読めない');
select is((select count(*)::int from public.post_aggregates), 0, 'DB-12 未回答者は post_aggregates を読めない');
select pg_temp.logout();

select pg_temp.login(1);
select public.save_host_answer(:'post', pg_temp.paint('[[0,20,0,0,0]]'), null);
select is((select count(*)::int from public.post_secrets), 1, 'DB-12 投稿者は post_secrets を読める');
select is((select count(*)::int from public.host_answers), 1, 'DB-12 投稿者は host_answers を読める');
select is((select count(*)::int from public.post_aggregates), 1, 'DB-12 投稿者は post_aggregates を読める');
select pg_temp.logout();

select pg_temp.login(3);
select is((select count(*)::int from public.host_answers), 0, 'DB-12 未回答者は host_answers を読めない');
select pg_temp.logout();

select pg_temp.login(2);
insert into public.answers (post_id, paint) values (:'post', :'aa_call');
select is((select count(*)::int from public.post_secrets), 1, 'DB-12 回答後は post_secrets を読める');
select is((select count(*)::int from public.host_answers), 1, 'DB-12 回答後は host_answers を読める');
select pg_temp.logout();

-- ---- DB-11 他人の回答は見えない ----
select pg_temp.login(3);
select is((select count(*)::int from public.answers), 0, 'DB-11 他人の回答は見えない');
select pg_temp.logout();
select pg_temp.login(2);
select is((select count(*)::int from public.answers), 1, 'DB-11 自分の回答は見える');
select pg_temp.logout();

-- ---- DB-02 許可リスト有効時、リスト外のユーザーは読めない ----
update public.app_settings set allowlist_enabled = true;
insert into public.app_allowlist (uid) values (pg_temp.uid(2));
select pg_temp.login(3);
select is((select count(*)::int from public.posts), 0, 'DB-02 リスト外は posts を読めない');
select throws_ok(format($$ select public.get_post_detail(%L) $$, :'post'), 'P0001', 'not_allowed', 'DB-02 リスト外の get_post_detail は not_allowed');
select is((select public.whoami()), '{"admin": false, "allowed": false}'::jsonb, 'DB-02 whoami の allowed = false');
select pg_temp.logout();
select pg_temp.login(2);
select is((select count(*)::int from public.posts), 1, 'DB-02 リストに載っていれば読める');
select pg_temp.logout();

select * from finish(true);
rollback;

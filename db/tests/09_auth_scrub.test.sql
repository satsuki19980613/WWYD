-- DB-21: ログインで届く個人の情報を DB に残さない（20261011000000_auth_scrub.sql。CLAUDE.md 不変条件 6）
begin;
\ir helpers/setup.psql
select plan(14);

-- 利用者: 書き込みのたびにメールアドレス・表示名・画像を置き換える
insert into neon_auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
values (pg_temp.uid(1), 'Some One', 'someone@gmail.com', true, 'https://lh3.googleusercontent.com/a/x', now(), now());
select is((select email from neon_auth."user" where id = pg_temp.uid(1)), pg_temp.uid(1)::text || '@wwyd.invalid',
  'DB-21 作成時のメールアドレスは <id>@wwyd.invalid に置き換わる');
select is((select name from neon_auth."user" where id = pg_temp.uid(1)), 'Player', 'DB-21 作成時の表示名は Player に置き換わる');
select is((select image from neon_auth."user" where id = pg_temp.uid(1)), null, 'DB-21 作成時の画像は残らない');

update neon_auth."user" set email = 'again@gmail.com', name = 'Again', image = 'https://lh3.googleusercontent.com/a/y'
  where id = pg_temp.uid(1);
select is((select array[email, name, coalesce(image, '(null)')] from neon_auth."user" where id = pg_temp.uid(1)),
  array[pg_temp.uid(1)::text || '@wwyd.invalid', 'Player', '(null)'], 'DB-21 更新しても置き換わる');

-- Google との連携: トークン（中にメールアドレスが入っている）を残さない。Google の番号（accountId）は残す
insert into neon_auth.account (id, "accountId", "providerId", "userId", "idToken", "accessToken", "refreshToken", "createdAt", "updatedAt")
values (gen_random_uuid(), 'google-sub-1', 'google', pg_temp.uid(1), 'id', 'access', 'refresh', now(), now());
select is((select array["idToken", "accessToken", "refreshToken"] from neon_auth.account where "userId" = pg_temp.uid(1)),
  array[null, null, null]::text[], 'DB-21 作成時の Google のトークンは残らない');
select is((select "accountId" from neon_auth.account where "userId" = pg_temp.uid(1)), 'google-sub-1',
  'DB-21 Google の番号は残る（次のログインで本人を見分ける）');
update neon_auth.account set "idToken" = 'id2', "accessToken" = 'access2', "refreshToken" = 'refresh2' where "userId" = pg_temp.uid(1);
select is((select array["idToken", "accessToken", "refreshToken"] from neon_auth.account where "userId" = pg_temp.uid(1)),
  array[null, null, null]::text[], 'DB-21 更新してもトークンは残らない');

-- ログインの記録: IP アドレスとブラウザの種類を残さない
insert into neon_auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "userId", "ipAddress", "userAgent")
values (gen_random_uuid(), now() + interval '1 day', 'db21-token', now(), now(), pg_temp.uid(1), '203.0.113.7', 'Mozilla/5.0');
select is((select array["ipAddress", "userAgent"] from neon_auth.session where "userId" = pg_temp.uid(1)),
  array[null, null]::text[], 'DB-21 作成時の IP アドレス・ブラウザの種類は残らない');
update neon_auth.session set "ipAddress" = '203.0.113.8', "userAgent" = 'Mozilla/5.1' where "userId" = pg_temp.uid(1);
select is((select array["ipAddress", "userAgent"] from neon_auth.session where "userId" = pg_temp.uid(1)),
  array[null, null]::text[], 'DB-21 更新しても IP アドレス・ブラウザの種類は残らない');

-- 試験の共通の作り方（pg_temp.create_user）で作った利用者も置き換わる
select pg_temp.create_user(2);
select is((select email from neon_auth."user" where id = pg_temp.uid(2)), pg_temp.uid(2)::text || '@wwyd.invalid',
  'DB-21 ほかの書き方で作っても置き換わる');

-- 残っていない・トリガーが外れていない
select is((select count(*)::int from neon_auth."user" where email not like '%@wwyd.invalid' or name <> 'Player' or image is not null), 0,
  'DB-21 メールアドレス・表示名・画像が残っている利用者は 0 人');
select is((select count(*)::int from pg_trigger t join pg_proc p on p.oid = t.tgfoid
           where not t.tgisinternal and t.tgenabled <> 'D' and p.pronamespace = 'public'::regnamespace
             and (t.tgrelid::regclass::text, p.proname) in (('neon_auth."user"', 'auth_user_scrub'),
                                                           ('neon_auth.account', 'auth_account_scrub'),
                                                           ('neon_auth.session', 'auth_session_scrub'))), 3,
  'DB-21 置き換えのトリガーが 3 つとも有効');

-- 置き換えの関数は利用者から呼べない
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname like 'auth\_%\_scrub'
             and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anonymous', oid, 'execute'))), 0,
  'DB-21 authenticated・anonymous は置き換えの関数を実行できない');

-- ログインした利用者は、ログインの仕組みの表を読めない
select pg_temp.login(1);
select throws_ok($$ select email from neon_auth."user" $$, '42501', null, 'DB-21 authenticated は neon_auth."user" を読めない');
select pg_temp.logout();

select * from finish();
rollback;

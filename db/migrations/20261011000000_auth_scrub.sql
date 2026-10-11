-- ログインで届く個人の情報を DB に残さない（運営者にも Neon の管理画面で見えないようにする。CLAUDE.md 不変条件 6。privatematch と同じ仕組み）
--   Neon Auth は Google でログインした人を neon_auth."user"（メールアドレス・表示名・画像）、neon_auth.account（Google のトークン）、
--   neon_auth.session（IP アドレス・ブラウザの種類）に書く。アプリはどれも使わない（利用者は UID だけで見分ける。
--   2 回目からのログインは account の "accountId"（Google がアカウントごとに発行する番号）で本人を見つける）。
--   user.email:   書き込みのたびに <id>@wwyd.invalid に置き換える（一意のまま・実在しない宛先）
--   user.name:    'Player' に、user.image（アイコン画像の URL）を空にする
--   account:      "idToken"（中にメールアドレスが入っている）と "accessToken" / "refreshToken"（Google に聞けばメールアドレスが分かる）を空にする
--   session:      "ipAddress" と "userAgent" を空にする
--   トリガーなので、Neon Auth がどのロールで書いても置き換える前の値は保存されない。すでに入っている分も置き換える（元に戻せない）

create function public.auth_user_scrub()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := new.id::text || '@wwyd.invalid';
  new.name := 'Player';
  new.image := null;
  return new;
end $$;

create function public.auth_account_scrub()
returns trigger language plpgsql set search_path = '' as $$
begin
  new."idToken" := null;
  new."accessToken" := null;
  new."refreshToken" := null;
  return new;
end $$;

create function public.auth_session_scrub()
returns trigger language plpgsql set search_path = '' as $$
begin
  new."ipAddress" := null;
  new."userAgent" := null;
  return new;
end $$;

revoke all on function public.auth_user_scrub(), public.auth_account_scrub(), public.auth_session_scrub()
  from public, anonymous, authenticated;

create trigger auth_user_scrub before insert or update on neon_auth."user"
  for each row execute function public.auth_user_scrub();
create trigger auth_account_scrub before insert or update on neon_auth.account
  for each row execute function public.auth_account_scrub();
create trigger auth_session_scrub before insert or update on neon_auth.session
  for each row execute function public.auth_session_scrub();

-- すでに入っている分（トリガーが置き換える）
update neon_auth."user" set email = email
  where email not like '%@wwyd.invalid' or name is distinct from 'Player' or image is not null;
update neon_auth.account set "idToken" = null
  where "idToken" is not null or "accessToken" is not null or "refreshToken" is not null;
update neon_auth.session set "ipAddress" = null
  where "ipAddress" is not null or "userAgent" is not null;

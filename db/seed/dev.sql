-- 開発用の試験データ（dev ブランチ専用。`npm run db:seed -- --branch dev`。production では実行しない）
-- 一覧（P4）以降の画面を確かめるための投稿と回答を作る。何度実行しても同じ状態になる（前回の分を消してから作る）。
--
-- - 試験用ユーザー 8 人（UUID が 00000000-0000-0000-5eed-…、メールは @example.test）が 5 件ずつ投稿（計 40 件、過去 12 日に散らす）
-- - dev に実在するユーザー（さつきのログイン）には「自分の投稿」を 3 件ずつ作り、試験用の投稿のいくつかに回答させる
-- - 回答は試験用ユーザー同士でも入れ、回答数を 0〜7 にばらつかせる
-- ハンドはすべて H-S1（04 章）。スポットは BTN のアクション 7 / 10 / 13（フロップ〜リバー。プリフロップは出題しない）、Villain は BB。
-- 派生メタは packages/core の spotView で計算した値（create-post が保存する値と同じ）。
begin;

-- ---- 前回の試験データを消す ----
delete from public.posts where title like '試験%';
delete from neon_auth."user" where id::text like '00000000-0000-0000-5eed-%';

-- ---- 試験用ユーザー ----
insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
select ('00000000-0000-0000-5eed-' || lpad(n::text, 12, '0'))::uuid, 'seed' || n, 'seed' || n || '@example.test', false, now(), now()
from generate_series(1, 8) as n;

-- ---- 投稿 ----
create temp table seed_spot (street text, spot_index int, stop_index int, min_to numeric, max_to numeric, pot_base numeric);
insert into seed_spot values
  ('flop',  7,  8,  3.6, 97.5, 9.1),
  ('turn',  10, 11, 13,  95.7, 22.1),
  ('river', 13, 14, 30,  89.2, 52.1);

create temp table seed_title (i int, title text);
insert into seed_title values
  (0, '試験 BTN vs BB のシングルレイズドポット'),
  (1, '試験 ドライボードでのチェックレイズ頻度'),
  (2, '試験 ターンのバレルにどう応じる？'),
  (3, '試験 リバーのポラライズドベット'),
  (4, '試験 とても長いタイトルの例。二行に収まらないときは省略記号で切られるはず');

-- H-S1 のスポットを 1 件作る（DB の所有者として insert_post を呼ぶ。create-post と同じ）
create function pg_temp.seed_post(author uuid, title text, sp seed_spot, fmt text) returns uuid language sql as $$
  select public.insert_post(author, jsonb_build_object(
    'title', title, 'fmt', fmt, 'hero', 'BTN', 'villain', 'BB', 'street', sp.street,
    'effective_stack', 100, 'keys', '["fold","call","s1"]'::jsonb, 's1_label', 'raise',
    'min_to', sp.min_to, 'max_to', sp.max_to, 'pot_base', sp.pot_base,
    'sb', 0.5, 'bb', 1, 'ante', 0, 'rake', case when fmt = 'cash' then 5 end,
    'stacks', '{"UTG":100,"HJ":100,"CO":100,"BTN":100,"SB":100,"BB":100}'::jsonb,
    'board', '["Kh","8d","3c","2s","7h"]'::jsonb,
    'actions', '[
      {"street":"pf","pos":"UTG","type":"fold"},{"street":"pf","pos":"HJ","type":"fold"},
      {"street":"pf","pos":"CO","type":"fold"},{"street":"pf","pos":"BTN","type":"raise","to":2.5},
      {"street":"pf","pos":"SB","type":"fold"},{"street":"pf","pos":"BB","type":"call"},
      {"street":"flop","pos":"BB","type":"check"},{"street":"flop","pos":"BTN","type":"bet","to":1.8},
      {"street":"flop","pos":"BB","type":"call"},
      {"street":"turn","pos":"BB","type":"check"},{"street":"turn","pos":"BTN","type":"bet","to":6.5},
      {"street":"turn","pos":"BB","type":"call"},
      {"street":"river","pos":"BB","type":"check"},{"street":"river","pos":"BTN","type":"bet","to":15},
      {"street":"river","pos":"BB","type":"call"}]'::jsonb,
    'spot_index', sp.spot_index, 'stop_index', sp.stop_index,
    'hero_cards', '["Ad","Kd"]'::jsonb, 'known_cards', '{"BB":["Ks","Js"]}'::jsonb))
$$;

-- 投稿上限（1 日 5 件）を一時的に広げ、最後に戻す。実在ユーザーの枠は使った分を戻す
create temp table seed_limit as select daily_post_limit from public.app_settings;
update public.app_settings set daily_post_limit = 100;

create temp table seed_posts (id uuid, author uuid, k int);
do $$
declare
  u int;
  j int;
  sp seed_spot;
  pid uuid;
  real_user record;
begin
  for u in 1..8 loop
    for j in 0..4 loop
      select * into sp from seed_spot order by spot_index offset ((u + j) % 3) limit 1;
      pid := pg_temp.seed_post(('00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'))::uuid,
                               (select title from seed_title where i = j), sp, case when (u + j) % 3 = 0 then 'mtt' else 'cash' end);
      insert into seed_posts values (pid, ('00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'))::uuid, u * 5 + j);
    end loop;
  end loop;

  for real_user in select id from neon_auth."user" where id::text not like '00000000-0000-0000-%' loop
    for j in 1..3 loop
      select * into sp from seed_spot order by spot_index offset (j % 3) limit 1;
      pid := pg_temp.seed_post(real_user.id, '試験 自分の投稿 ' || j, sp, 'cash');
      insert into seed_posts values (pid, real_user.id, 100 + j);
    end loop;
    update public.post_quota set count = greatest(0, count - 3)
    where uid = real_user.id and day = (now() at time zone 'utc')::date;
  end loop;
end $$;

update public.app_settings set daily_post_limit = (select daily_post_limit from seed_limit);

-- 作成日時を過去 12 日に散らす（作成日時の書き換えはトリガで拒否されるので、一時的に外す）
alter table public.posts disable trigger posts_only_count_update;
update public.posts p set created_at = now() - make_interval(mins => (s.k * 397) % (12 * 24 * 60))
from seed_posts s where s.id = p.id and s.k < 100;
update public.posts p set created_at = now() - make_interval(mins => s.k - 100)
from seed_posts s where s.id = p.id and s.k >= 100;
alter table public.posts enable trigger posts_only_count_update;

-- ---- 回答（AA を call 100%、22 を fold 100%） ----
do $$
declare
  p record;
  u int;
  real_user record;
  v_paint bytea := set_byte(set_byte(decode(repeat('00', 676), 'hex'), 2, 20), 672, 20);
begin
  for p in select * from seed_posts where k < 100 loop
    for u in 1..8 loop
      -- 回答数を 0〜7 にばらつかせる（試験データでは投稿者自身の回答は入れない）
      continue when ('00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'))::uuid = p.author;
      continue when (p.k * 7 + u * 3) % 8 >= (p.k % 9);
      perform set_config('request.jwt.claims',
        json_build_object('sub', '00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'), 'role', 'authenticated')::text, true);
      insert into public.answers (post_id, paint) values (p.id, v_paint);
    end loop;
  end loop;

  -- 実在ユーザーの投稿にも回答を付ける（削除のカスケードを確かめるため。自分の投稿 n に n 件）
  for p in select * from seed_posts where k >= 100 loop
    for u in 1..(p.k - 100) loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', '00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'), 'role', 'authenticated')::text, true);
      insert into public.answers (post_id, paint) values (p.id, v_paint);
    end loop;
  end loop;

  for real_user in select id from neon_auth."user" where id::text not like '00000000-0000-0000-%' loop
    perform set_config('request.jwt.claims', json_build_object('sub', real_user.id, 'role', 'authenticated')::text, true);
    insert into public.answers (post_id, paint)
    select id, v_paint from seed_posts where k < 100 and k % 4 = 0;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

select count(*) as seed_posts, sum(answer_count) as seed_answers from public.posts where title like '試験%';
commit;

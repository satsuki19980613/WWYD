-- 本番でも使える試験データ（`npm run db:sample -- --branch <ブランチ>`。消すときは `npm run db:sample-clean -- --branch <ブランチ>`）
-- スマホなどで本番の画面を確かめるための投稿と回答を作る。何度実行しても同じ状態になる（前回の分を消してから作る）。
--
-- - 試験用ユーザー 8 人（UUID が 00000000-0000-0000-5eed-…、メールは @example.test。個人の情報は持たない）が 5 件ずつ投稿（計 40 件、過去 12 日に散らす）
-- - 回答は試験用ユーザー同士だけ（回答数 0〜7）。**実在するユーザーの投稿・回答・投稿枠には一切触れない**（dev.sql との違い）
-- - 消すときは試験用ユーザーの投稿を作成者で選んで消す（回答・集計はカスケード）。題名では選ばない（利用者の投稿を巻き込まないため）
-- ハンドはすべて H-S1（04 章）。スポットは BTN の手番 7 / 10 / 13（フロップ〜リバー。Hero の Check / Bet を答える。2026-09-29）。
begin;

-- ---- 前回の試験データを消す ----
delete from public.posts where author_uid::text like '00000000-0000-0000-5eed-%';
delete from neon_auth."user" where id::text like '00000000-0000-0000-5eed-%';

-- ---- 試験用ユーザー ----
insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
select ('00000000-0000-0000-5eed-' || lpad(n::text, 12, '0'))::uuid, 'seed' || n, 'seed' || n || '@example.test', false, now(), now()
from generate_series(1, 8) as n;

-- ---- 投稿 ----
create temp table seed_spot (street text, spot_index int, stop_index int, min_to numeric, max_to numeric, pot_base numeric);
insert into seed_spot values
  ('flop',  7,  7,  1, 97.5, 5.5),
  ('turn',  10, 10, 1, 95.7, 9.1),
  ('river', 13, 13, 1, 89.2, 22.1);

create temp table seed_title (i int, title text);
insert into seed_title values
  (0, '試験 BTN vs BB のシングルレイズドポット'),
  (1, '試験 ドライボードでの C-bet 頻度'),
  (2, '試験 ターンで 2 バレル目を打つ？'),
  (3, '試験 リバーのポラライズドベット'),
  (4, '試験 とても長いタイトルの例。二行に収まらないときは省略記号で切られるはず');

-- H-S1 のスポットを 1 件作る（DB の所有者として insert_post を呼ぶ。create-post と同じ）
create function pg_temp.seed_post(author uuid, title text, sp seed_spot, fmt text) returns uuid language sql as $$
  select public.insert_post(author, jsonb_build_object(
    'title', title, 'fmt', fmt, 'hero', 'BTN', 'street', sp.street,
    'effective_stack', 100, 'keys', '["check","s1"]'::jsonb, 's1_label', 'bet',
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

-- 投稿上限（1 日 5 件）を一時的に広げ、最後に戻す
create temp table seed_limit as select daily_post_limit from public.app_settings;
update public.app_settings set daily_post_limit = 100;

create temp table seed_posts (id uuid, author uuid, k int);
do $$
declare
  u int;
  j int;
  sp seed_spot;
  pid uuid;
begin
  for u in 1..8 loop
    for j in 0..4 loop
      select * into sp from seed_spot order by spot_index offset ((u + j) % 3) limit 1;
      pid := pg_temp.seed_post(('00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'))::uuid,
                               (select title from seed_title where i = j), sp, case when (u + j) % 3 = 0 then 'mtt' else 'cash' end);
      insert into seed_posts values (pid, ('00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'))::uuid, u * 5 + j);
    end loop;
  end loop;
end $$;

update public.app_settings set daily_post_limit = (select daily_post_limit from seed_limit);

-- 作成日時を過去 12 日に散らす（作成日時の書き換えはトリガで拒否されるので、一時的に外す）
alter table public.posts disable trigger posts_only_count_update;
update public.posts p set created_at = now() - make_interval(mins => (s.k * 397) % (12 * 24 * 60))
from seed_posts s where s.id = p.id;
alter table public.posts enable trigger posts_only_count_update;

-- ---- 回答（AA を Bet 100%、22 を Check 100%）。試験用ユーザー同士だけ ----
do $$
declare
  p record;
  u int;
  v_paint bytea := set_byte(set_byte(decode(repeat('00', 676), 'hex'), 3, 20), 673, 20);
begin
  for p in select * from seed_posts loop
    for u in 1..8 loop
      -- 回答数を 0〜7 にばらつかせる（試験データでは投稿者自身の回答は入れない）
      continue when ('00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'))::uuid = p.author;
      continue when (p.k * 7 + u * 3) % 8 >= (p.k % 9);
      perform set_config('request.jwt.claims',
        json_build_object('sub', '00000000-0000-0000-5eed-' || lpad(u::text, 12, '0'), 'role', 'authenticated')::text, true);
      insert into public.answers (post_id, paint) values (p.id, v_paint);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

select count(*) as sample_posts, sum(answer_count) as sample_answers from public.posts where author_uid::text like '00000000-0000-0000-5eed-%';
commit;

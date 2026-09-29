-- 回答が多い投稿の試験データ（`npm run db:sample-large -- --branch <ブランチ>`。消すときは `npm run db:sample-clean -- --branch <ブランチ>`）
-- 集計の濃さ（5 段）を、回答が 400〜2000 件ある投稿で確かめるためのもの。何度実行しても同じ状態になる。
--
-- - 投稿 4 件（回答 400 / 800 / 1300 / 2000 件）。投稿者は sample.sql の試験用ユーザー 1〜4（無ければ作る）
-- - 回答者は試験用ユーザー 1001〜3000（UUID が 00000000-0000-0000-5eed-…、メールは @example.test。個人の情報は持たない）
-- - 回答のレンジは、ハンドの強さに人ごとの基準とマスごとのばらつきを足して決める（乱数の種を固定するので毎回同じ）
-- - 実在するユーザーの投稿・回答には一切触れない
begin;

-- ---- 前回の分を消す（投稿を先に消せば、回答の減算は走らない） ----
delete from public.posts where author_uid::text like '00000000-0000-0000-5eed-%' and title like '試験 回答が多い%';
delete from neon_auth."user"
where id::text between '00000000-0000-0000-5eed-000000001001' and '00000000-0000-0000-5eed-000000003000';

-- ---- 試験用ユーザー（投稿者 1〜4 と回答者 1001〜3000） ----
insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
select ('00000000-0000-0000-5eed-' || lpad(n::text, 12, '0'))::uuid, 'seed' || n, 'seed' || n || '@example.test', false, now(), now()
from (select generate_series(1, 4) as n union all select generate_series(1001, 3000)) s
on conflict (id) do nothing;

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

-- 投稿ごとの設定: 回答数、スポット、レンジの広さ（基準）、人ごとの基準のばらつき、マスごとのばらつき
create temp table big_post (no int, answers int, spot_index int, title text, base numeric, spread numeric, noise numeric, id uuid);
insert into big_post values
  (1, 400,  7,  '試験 回答が多い投稿 400 件（フロップ・意見が揃う）',  0.55, 0.10, 0.10, null),
  (2, 800,  10, '試験 回答が多い投稿 800 件（ターン・意見が割れる）',  0.50, 0.40, 0.20, null),
  (3, 1300, 13, '試験 回答が多い投稿 1300 件（リバー・狭いレンジ）',   0.70, 0.20, 0.15, null),
  (4, 2000, 10, '試験 回答が多い投稿 2000 件（ターン・広いレンジ）',   0.30, 0.25, 0.25, null);

update big_post b set id = pg_temp.seed_post(('00000000-0000-0000-5eed-' || lpad(b.no::text, 12, '0'))::uuid, b.title,
  (select s from seed_spot s where s.spot_index = b.spot_index), 'cash');

update public.app_settings set daily_post_limit = (select daily_post_limit from seed_limit);

-- マスの強さ（0〜1）。ペアは AA 1.0〜22 0.4、それ以外は高いランクと低いランクから。スーテッドは少し強い
create temp table cell_strength as
select idx,
  case
    when idx / 13 = idx % 13 then 1.0 - 0.05 * (idx / 13)
    else greatest(0, 0.95 - 0.05 * least(idx / 13, idx % 13) - 0.045 * greatest(idx / 13, idx % 13))
         + case when idx / 13 < idx % 13 then 0.06 else 0 end
  end as s
from generate_series(0, 168) idx;

-- ---- 回答 ----
select setseed(0.2026);
do $$
declare
  b record;
  u int;
  t numeric;
  v_paint bytea;
  v_size numeric;
  v_min numeric;
  v_max numeric;
  v_pot numeric;
begin
  for b in select * from big_post order by no loop
    select min_to, max_to, pot_base into v_min, v_max, v_pot from seed_spot where spot_index = b.spot_index;
    for u in 1..b.answers loop
      t := b.base + (random() - 0.5) * b.spread;
      -- マスごと: レンジ内か（強さ＋ばらつき > 基準）。レンジ内なら余裕の大きさでベット / チェックを混ぜる（合計 20。キーは check / s1）
      select decode(string_agg(
               '00' || lpad(to_hex(case when inr then 20 - r else 0 end), 2, '0') || '00' || lpad(to_hex(r), 2, '0'),
               '' order by idx), 'hex')
        into v_paint
      from (
        select idx, inr,
          -- 余裕が小さい: チェック / 中くらい: チェックとベットを混ぜる / 大きい: ほぼベット
          case when not inr or m <= 0.1 then 0 when m <= 0.35 then 5 * floor(k * 2) else 10 + 5 * floor(k * 3) end::int as r
        from (
          select idx, m, random() as k, (idx = 0 or m > 0) as inr
          from (select idx, s + (random() - 0.5) * b.noise - t as m from cell_strength) x
        ) y
      ) z;
      -- ベットを含むならサイズ（ポットの 33〜120%。min〜max に収める）
      v_size := case when exists (select 1 from generate_series(0, 168) i where get_byte(v_paint, i * 4 + 3) > 0)
                     then round(least(v_max, greatest(v_min, v_pot * (0.33 + random()::numeric * 0.87))), 1) end;
      perform set_config('request.jwt.claims',
        json_build_object('sub', '00000000-0000-0000-5eed-' || lpad((1000 + u)::text, 12, '0'), 'role', 'authenticated')::text, true);
      insert into public.answers (post_id, paint, size) values (b.id, v_paint, v_size);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

select b.answers as planned, p.answer_count, p.street from big_post b join public.posts p on p.id = b.id order by b.no;
commit;

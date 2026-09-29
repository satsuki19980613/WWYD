-- C-03（リリース前テスト）: DB の jsonb は NUL と、対になっていないサロゲートを受け付けない。
-- create-post（packages/functions）の検証はタイトルのこれらを通すので、insert_post の引数の変換で DB が断り 500 internal になる。
-- 関連: packages/functions/src/createPost/release.tc.handler.test.ts の it.fails
begin;
select plan(5);

create or replace function pg_temp.sqlstate_of(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- Function は JSON.stringify(payload) を文字列で渡し、SQL 側で `$2::jsonb` に変換する。同じ変換をここで確かめる
select is(left(pg_temp.sqlstate_of($q$ select ('{"title":"a\u0000b"}'::text)::jsonb $q$), 2), '22', 'C-03 jsonb は NUL を含む文字列を断る（データ例外）');
select is(left(pg_temp.sqlstate_of($q$ select ('{"title":"a\ud800b"}'::text)::jsonb $q$), 2), '22', 'C-03 jsonb は対になっていない上位サロゲートを断る');
select is(left(pg_temp.sqlstate_of($q$ select ('{"title":"a\udc00b"}'::text)::jsonb $q$), 2), '22', 'C-03 jsonb は対になっていない下位サロゲートを断る');
select is(pg_temp.sqlstate_of($q$ select ('{"title":"a😀b"}'::text)::jsonb $q$), 'ok', 'C-03 （対照）対になったサロゲート（絵文字）は通る');
select is(pg_temp.sqlstate_of($q$ select ('{"title":"a　b"}'::text)::jsonb $q$), 'ok', 'C-03 （対照）全角空白は通る');

select * from finish(true);
rollback;

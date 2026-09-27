-- 利用者の ID（詳細仕様 12 章 §5.1）。
-- Neon の auth.uid() は authenticated ロールから使えず（auth スキーマの使用権限を付与できない）、
-- SECURITY DEFINER の関数の中では値を返さない。そのため、Data API がリクエストごとに設定する
-- request.jwt.claims の sub（Neon Auth の neon_auth."user".id）を自前で読む（Supabase の auth.uid() と同じ作り）。
-- request.jwt.claims は検証済みの JWT から Data API が設定する値で、利用者が直接書き換えることはできない。
create or replace function public.current_uid()
returns uuid language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

revoke all on function public.current_uid() from public, anonymous, authenticated;
grant execute on function public.current_uid() to authenticated;

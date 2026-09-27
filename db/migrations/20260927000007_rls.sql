-- RLS と権限（詳細仕様 02 章 §2）。未認証では何も読めない・書けない（CLAUDE.md 不変条件 8）

alter table public.app_settings    enable row level security;
alter table public.app_admins      enable row level security;
alter table public.app_allowlist   enable row level security;
alter table public.post_quota      enable row level security;
alter table public.posts           enable row level security;
alter table public.post_hands      enable row level security;
alter table public.post_secrets    enable row level security;
alter table public.host_answers    enable row level security;
alter table public.answers         enable row level security;
alter table public.post_aggregates enable row level security;

-- 既定の付与を取り消し、必要な権限だけ与える（Data API の「Grant public schema access」は使わない。12 章 N-02）
revoke all on all tables    in schema public from anonymous, authenticated;
revoke all on all sequences in schema public from anonymous, authenticated;
revoke all on all functions in schema public from public, anonymous, authenticated;
-- これから作る表・シーケンスにも既定で付与されないようにする。
-- 関数は既定権限では防げない（Postgres が新しい関数に PUBLIC の実行権限を付け、これはスキーマ単位の既定権限では
-- 取り消せない）。そのため、以後のマイグレーションでは関数を作るたびにその場で
-- `revoke all on function … from public, anonymous, authenticated` してから必要な付与だけを行う（DB-01 のテストで検出する）。
alter default privileges in schema public revoke all on tables    from anonymous, authenticated;
alter default privileges in schema public revoke all on sequences from anonymous, authenticated;
alter default privileges in schema public revoke execute on functions from anonymous, authenticated;

grant select, delete on public.posts           to authenticated;
grant select         on public.post_secrets    to authenticated;
grant select         on public.host_answers    to authenticated;
grant select         on public.post_aggregates to authenticated;
grant select, insert on public.answers         to authenticated;
-- post_hands は直接の select を与えない（get_post_detail 経由のみ。Q-9）

-- posts: 許可済みは全件読める。挿入・更新のポリシーは作らない（挿入は insert_post RPC のみ）
create policy posts_select on public.posts
  for select to authenticated using (public.is_allowed());
create policy posts_delete on public.posts
  for delete to authenticated
  using (public.is_allowed() and (author_uid = (select public.current_uid()) or public.is_admin()));

-- Hero のハンド・known_cards / Hero の予想 / 集計: 投稿者本人か回答済みのみ
create policy post_secrets_select on public.post_secrets
  for select to authenticated using (public.can_view_results(post_id));
create policy host_answers_select on public.host_answers
  for select to authenticated using (public.can_view_results(post_id));
create policy post_aggregates_select on public.post_aggregates
  for select to authenticated using (public.can_view_results(post_id));

-- answers: 読むのは自分の行だけ。挿入は本人のみ・投稿者本人は不可。更新・削除のポリシーは作らない
create policy answers_select on public.answers
  for select to authenticated using (uid = (select public.current_uid()));
create policy answers_insert on public.answers
  for insert to authenticated
  with check (
    uid = (select public.current_uid())
    and public.is_allowed()
    and not exists (select 1 from public.posts p where p.id = post_id and p.author_uid = (select public.current_uid()))
  );

-- app_settings / app_admins / app_allowlist / post_quota: authenticated にはポリシーなし（読めない・書けない）。
-- 管理者は Neon のコンソールの SQL エディタ（DB の所有者ロール）で操作する（10 章）。

-- ポリシーから呼ぶ関数の実行権限
grant execute on function public.current_uid()          to authenticated;  -- 上の一括の revoke で外れるので付け直す
grant execute on function public.is_allowed()           to authenticated;
grant execute on function public.is_admin()             to authenticated;
grant execute on function public.can_view_results(uuid) to authenticated;

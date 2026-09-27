-- トリガ（詳細仕様 02 章 §3）

-- 回答の挿入前: 検証（仕様書 §5.3.8）。uid と作成日時はクライアントの値を信用しない
create or replace function public.answers_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.posts;
  uses_s1 boolean;
begin
  new.uid := auth.uid();
  new.created_at := now();
  if new.uid is null then perform public.fail('not_authenticated'); end if;
  select * into p from public.posts where id = new.post_id;
  if not found then perform public.fail('post_not_found'); end if;
  if p.author_uid = new.uid then perform public.fail('own_post'); end if;
  uses_s1 := public.validate_paint(new.paint, p.keys);
  perform public.check_size(uses_s1, new.size, p.min_to, p.max_to);
  return new;
end $$;

create trigger answers_before_insert
  before insert on public.answers
  for each row execute function public.answers_before_insert();

-- 回答の挿入後: 集計と回答数の加算
create or replace function public.answers_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_answer_to_aggregate(new.post_id, new.paint, 1);
  update public.posts set answer_count = answer_count + 1 where id = new.post_id;
  return null;
end $$;

create trigger answers_after_insert
  after insert on public.answers
  for each row execute function public.answers_after_insert();

-- 回答の削除後: 減算（アカウント削除のときだけ効く。投稿削除のカスケードでは投稿がもう無いので何もしない）
create or replace function public.answers_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.posts where id = old.post_id) then
    perform public.apply_answer_to_aggregate(old.post_id, old.paint, -1);
    update public.posts set answer_count = answer_count - 1 where id = old.post_id;
  end if;
  return null;
end $$;

create trigger answers_after_delete
  after delete on public.answers
  for each row execute function public.answers_after_delete();

-- 更新の禁止（保険）: answers の update と、posts の answer_count 以外の列の update を拒否する
create or replace function public.forbid_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.fail('update_forbidden');
  return null;
end $$;

create trigger answers_no_update before update on public.answers
  for each row execute function public.forbid_update();

create or replace function public.posts_only_count_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'answer_count') is distinct from (to_jsonb(old) - 'answer_count') then
    perform public.fail('update_forbidden');
  end if;
  return new;
end $$;

create trigger posts_only_count_update before update on public.posts
  for each row execute function public.posts_only_count_update();

-- トリガ関数は直接呼ばせない（トリガからの実行に実行権限は要らない）
revoke all on function public.answers_before_insert()   from public, anon, authenticated;
revoke all on function public.answers_after_insert()    from public, anon, authenticated;
revoke all on function public.answers_after_delete()    from public, anon, authenticated;
revoke all on function public.forbid_update()           from public, anon, authenticated;
revoke all on function public.posts_only_count_update() from public, anon, authenticated;

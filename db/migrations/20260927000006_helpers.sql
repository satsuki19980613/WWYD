-- 共通関数（詳細仕様 02 章 §1）
-- SECURITY DEFINER の関数はすべて search_path = '' とし、名前はスキーマ付きで書く（検索パスの乗っ取り対策）。
-- エラーは errcode P0001・message にコードを載せる（フロントエンドは 06 章 §7 の表で日本語にする）。

create or replace function public.fail(p_code text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end $$;

-- 利用を許可されたユーザーか（許可リストが有効なら、リストか管理者に載っている必要がある）
create or replace function public.is_allowed_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and (
    not (select s.allowlist_enabled from public.app_settings s)
    or exists (select 1 from public.app_allowlist a where a.uid = p_uid)
    or exists (select 1 from public.app_admins m where m.uid = p_uid)
  );
$$;

create or replace function public.is_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_allowed_uid(public.current_uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins m where m.uid = public.current_uid());
$$;

-- 集計・Hero のハンド・known_cards・Hero の予想を見てよいか（投稿者本人か、回答済み）
create or replace function public.can_view_results(p_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_allowed() and (
    exists (select 1 from public.posts p where p.id = p_post_id and p.author_uid = public.current_uid())
    or exists (select 1 from public.answers a where a.post_id = p_post_id and a.uid = public.current_uid())
  );
$$;

-- PostgREST と同じ bytea の 16 進表記（'\x' + 小文字 hex。05 章 §2.1）
create or replace function public.bytea_hex(p bytea)
returns text language sql immutable set search_path = '' as $$
  select '\x' || encode(p, 'hex');
$$;

-- paint の検証（05 章 §2.3 と同じ規則・同じ順序）。戻り値: s1 を 1 マスでも使っているか
-- 順序: 長さ → 値域（全バイト）→ 合法でないキー（全バイト）→ マスの合計 → 空
create or replace function public.validate_paint(p_paint bytea, p_keys text[])
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  legal    boolean[] := array['fold' = any (p_keys), 'check' = any (p_keys),
                              'call' = any (p_keys), 's1'    = any (p_keys)];
  i int; k int; b int; s int;
  uses_s1  boolean := false;
  nonempty boolean := false;
begin
  if p_paint is null or octet_length(p_paint) <> 676 then perform public.fail('paint_length'); end if;
  for i in 0..675 loop
    if get_byte(p_paint, i) > 20 then perform public.fail('paint_value'); end if;
  end loop;
  for i in 0..675 loop
    if get_byte(p_paint, i) > 0 and not legal[i % 4 + 1] then perform public.fail('paint_illegal_key'); end if;
  end loop;
  for i in 0..168 loop
    s := 0;
    for k in 0..3 loop
      b := get_byte(p_paint, i * 4 + k);
      if k = 3 and b > 0 then uses_s1 := true; end if;
      s := s + b;
    end loop;
    if s <> 0 and s <> 20 then perform public.fail('paint_sum'); end if;
    if s = 20 then nonempty := true; end if;
  end loop;
  if not nonempty then perform public.fail('paint_empty'); end if;
  return uses_s1;
end $$;

create or replace function public.check_size(p_uses_s1 boolean, p_size numeric, p_min numeric, p_max numeric)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_uses_s1 then
    if p_size is null or p_min is null or p_max is null or p_size < p_min or p_size > p_max then
      perform public.fail('size_out_of_range');
    end if;
  elsif p_size is not null then
    perform public.fail('size_not_allowed');
  end if;
end $$;

-- 集計への加減算（05 章 §3。p_sign は +1 / -1）。集計行を for update でロックし、同じ投稿への同時回答を直列化する
create or replace function public.apply_answer_to_aggregate(p_post_id uuid, p_paint bytea, p_sign int)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  c bytea; i int; k int; b int; s int; o int; v int;
begin
  select g.cells into c from public.post_aggregates g where g.post_id = p_post_id for update;
  if not found then return; end if;
  for i in 0..168 loop
    s := get_byte(p_paint, i*4) + get_byte(p_paint, i*4+1) + get_byte(p_paint, i*4+2) + get_byte(p_paint, i*4+3);
    continue when s = 0;
    o := i * 10;
    v := get_byte(c, o) * 256 + get_byte(c, o + 1) + p_sign;
    if v < 0 or v > 65535 then perform public.fail('aggregate_overflow'); end if;
    c := set_byte(set_byte(c, o, v >> 8), o + 1, v & 255);
    for k in 0..3 loop
      b := get_byte(p_paint, i * 4 + k);
      continue when b = 0;
      v := get_byte(c, o + 2 + k * 2) * 256 + get_byte(c, o + 3 + k * 2) + p_sign * b;
      if v < 0 or v > 65535 then perform public.fail('aggregate_overflow'); end if;
      c := set_byte(set_byte(c, o + 2 + k * 2, v >> 8), o + 3 + k * 2, v & 255);
    end loop;
  end loop;
  update public.post_aggregates g set cells = c, n = g.n + p_sign where g.post_id = p_post_id;
end $$;

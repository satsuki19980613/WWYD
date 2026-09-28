-- 本番でも使える試験データ（sample.sql）を消す（`npm run db:sample-clean -- --branch <ブランチ>`）
-- 試験用ユーザーの投稿を作成者で選んで消し（回答・集計はカスケード）、試験用ユーザーを消す。
-- 試験用ユーザーが実在するユーザーの投稿に回答していた場合（本番では作らない）も、その回答は answers の外部キーで消える。
begin;
delete from public.posts where author_uid::text like '00000000-0000-0000-5eed-%';
delete from neon_auth."user" where id::text like '00000000-0000-0000-5eed-%';
select count(*) as remaining_sample_posts from public.posts where author_uid::text like '00000000-0000-0000-5eed-%';
commit;

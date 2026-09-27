-- インデックス（詳細仕様 01 章 §4）
-- 一覧: 新着順 / 回答数順 × ストリートあり・なし。キーセットページングに合わせて id まで含める
create index posts_new_idx          on public.posts (created_at desc, id desc);
create index posts_many_idx         on public.posts (answer_count desc, created_at desc, id desc);
create index posts_street_new_idx   on public.posts (street, created_at desc, id desc);
create index posts_street_many_idx  on public.posts (street, answer_count desc, created_at desc, id desc);
-- 自分の投稿タブ、アカウント削除、投稿上限
create index posts_author_idx       on public.posts (author_uid, created_at desc, id desc);
-- 自分の回答（一覧の「回答済み」判定、アカウント削除）
create index answers_uid_idx        on public.answers (uid, post_id);

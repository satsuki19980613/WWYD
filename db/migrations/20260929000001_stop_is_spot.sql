-- 停止位置はスポットそのもの（詳細仕様 16 章。2026-09-29）
-- 出題を Hero の手番に変えたので、未回答者に見せるアクションは Hero の手番の直前まで（stop_index = spot_index）。
-- Villain の手番で止めていた頃の制約（stop_index > spot_index）が新しい投稿をすべて拒むため、置き換える。
alter table public.post_hands drop constraint post_hands_stop_after_spot;
alter table public.post_hands add constraint post_hands_stop_is_spot check (stop_index = spot_index);

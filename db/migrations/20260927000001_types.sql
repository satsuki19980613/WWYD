-- 型と共通定義（詳細仕様 01 章 §2.1）
create domain public.pos as text
  check (value in ('UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'));

create domain public.street as text
  check (value in ('pf', 'flop', 'turn', 'river'));

-- bb 単位の金額。小数第 3 位まで（04 章 §1）
create domain public.bb_amount as numeric(9, 3)
  check (value >= 0);

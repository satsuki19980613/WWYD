// DB-19: 同じ投稿への同時回答 10 件で集計の合計が一致すること（集計行の for update ロックの確認）。
// ローカルの Supabase（npx supabase start）の DB コンテナに、別々の接続で同時に回答を挿入する。
//   node scripts/dbConcurrency.mjs
// 本番には向けない（ローカルのコンテナ名に直接つなぐ）。作ったデータは最後に消す。
import { spawn } from 'node:child_process';

const CONTAINER = process.env.WWYD_DB_CONTAINER ?? 'supabase_db_WWYD';
const N = 10;
const uid = (n) => `00000000-0000-0000-0000-9${String(n).padStart(11, '0')}`;

function psql(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || `psql exit ${code}`))));
    p.stdin.end(sql);
  });
}

const users = Array.from({ length: N + 1 }, (_, i) => uid(i));
const cleanup = `delete from auth.users where id in (${users.map((u) => `'${u}'`).join(',')});`;

// AA を call 20、22 を fold 20 にした paint（05 章 §2）
const paint = `set_byte(set_byte(decode(repeat('00', 676), 'hex'), 2, 20), 672, 20)`;

try {
  await psql(cleanup);
  await psql(`insert into auth.users (id, aud, role) values ${users.map((u) => `('${u}','authenticated','authenticated')`).join(',')};`);
  const post = await psql(`select public.insert_post('${uid(0)}', jsonb_build_object(
    'title','DB-19','fmt','cash','hero','BTN','villain','BB','street','turn','effective_stack',100,
    'keys','["fold","call","s1"]'::jsonb,'s1_label','raise','min_to',13,'max_to',95.7,'pot_base',22.1,
    'sb',0.5,'bb',1,'ante',0,'rake',null,'stacks','{"UTG":100,"HJ":100,"CO":100,"BTN":100,"SB":100,"BB":100}'::jsonb,
    'board','[]'::jsonb,'actions','[]'::jsonb,'spot_index',10,'stop_index',11,'hero_cards','["Ad","Kd"]'::jsonb));`);

  // 10 本の接続で同時に挿入する（各接続は別ユーザー。pg_sleep で開始をそろえる）
  const start = Date.now() + 1500;
  await Promise.all(
    users.slice(1).map((u) =>
      psql(`select pg_sleep(greatest(0, (${start} - extract(epoch from clock_timestamp()) * 1000) / 1000.0));
        begin;
        select set_config('request.jwt.claims', json_build_object('sub','${u}','role','authenticated')::text, true);
        set local role authenticated;
        insert into public.answers (post_id, paint) values ('${post}', ${paint});
        commit;`),
    ),
  );

  const got = await psql(`select g.n || ',' || p.answer_count
      || ',' || (get_byte(g.cells, 0) * 256 + get_byte(g.cells, 1))
      || ',' || (get_byte(g.cells, 6) * 256 + get_byte(g.cells, 7))
      || ',' || (get_byte(g.cells, 1680) * 256 + get_byte(g.cells, 1681))
      || ',' || (get_byte(g.cells, 1682) * 256 + get_byte(g.cells, 1683))
    from public.post_aggregates g join public.posts p on p.id = g.post_id where g.post_id = '${post}';`);
  const expected = `${N},${N},${N},${N * 20},${N},${N * 20}`;
  if (got !== expected) {
    console.error(`DB-19 失敗: 期待 ${expected}（N, answer_count, AA の n / call, 22 の n / fold）、実際 ${got}`);
    process.exitCode = 1;
  } else {
    console.log(`DB-19 成功: 同時回答 ${N} 件で集計が一致（${got}）`);
  }
} finally {
  await psql(cleanup);
}

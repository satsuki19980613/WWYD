// Neon のデータベースの操作（マイグレーションの適用と DB テスト）。詳細仕様 12 章。
//
//   node scripts/db.mjs migrate --branch dev   … db/migrations の未適用分をブランチに適用する
//   node scripts/db.mjs test                   … 一時ブランチで DB テスト（下記）
//   node scripts/db.mjs test --keep            … 一時ブランチを消さずに残す（調べるとき。1 時間で自動削除）
//   node scripts/db.mjs seed --branch dev      … 開発用の試験データ（db/seed/dev.sql）を dev ブランチに入れ直す
//
// DB テスト: 空のブランチ test-base から一時ブランチを作り（1 時間で自動削除）、全マイグレーションを適用して
// pgTAP（db/tests/*.test.sql）と同時回答のテスト（DB-19）を実行し、最後に一時ブランチを消す。
// production に適用するときは `migrate --branch production`（**さつきの承認後に限る**。CLAUDE.md §12）。
//
// 必要なもの: Neon CLI のログイン（npx neonctl auth、CI では環境変数 NEON_API_KEY）と Docker（psql を動かす）。
// DB の接続文字列（パスワードを含む）は画面やログに出さない。
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = process.env.NEON_PROJECT_ID ?? 'patient-leaf-06853495';
const TEST_BASE = 'test-base';
const PSQL_IMAGE = 'postgres:18-alpine';
const ROOT = resolve(import.meta.dirname, '..');
const DB_DIR = resolve(ROOT, 'db');
const NEONCTL = resolve(ROOT, 'node_modules/neonctl/bin/cli.js');

function run(cmd, args, { input, env } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(out) : fail(Object.assign(new Error(err.trim() || `${cmd} exit ${code}`), { out }))));
    p.stdin.end(input ?? '');
  });
}

const neon = (...args) => run(process.execPath, [NEONCTL, ...args, '--project-id', PROJECT]);

async function connectionString(branch) {
  const url = (await neon('connection-string', branch, '--role-name', 'neondb_owner')).trim();
  if (!url.startsWith('postgres')) throw new Error(`接続文字列を取得できません（ブランチ ${branch}）`);
  return url;
}

/** Docker の psql で実行する。db/ を /db に読み取り専用でつなぐ。接続文字列は環境変数で渡す。 */
function psql(url, psqlArgs, input, searchPath) {
  return run(
    'docker',
    ['run', '--rm', '-i', '-e', 'PGURL', '-e', 'PGOPTIONS', '-v', `${DB_DIR}:/db:ro`, '-w', '/db/tests', PSQL_IMAGE,
      'sh', '-c', `psql "$PGURL" -X -q -v ON_ERROR_STOP=1 ${psqlArgs}`],
    { input, env: { PGURL: url, PGOPTIONS: searchPath ? `-c search_path=${searchPath}` : '' } },
  );
}

async function migrate(url) {
  await psql(url, '-f -', `
    create schema if not exists migrations;
    revoke all on schema migrations from public;
    create table if not exists migrations.applied (name text primary key, applied_at timestamptz not null default now());`);
  const applied = new Set((await psql(url, '-At -c "select name from migrations.applied"')).split('\n').map((s) => s.trim()).filter(Boolean));
  const files = readdirSync(resolve(DB_DIR, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  let n = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    // 1 ファイル = 1 トランザクション（途中で失敗したら何も残らない）
    await psql(url, `-1 -f /db/migrations/${f} -c "insert into migrations.applied (name) values ('${f}')"`);
    console.log(`適用: ${f}`);
    n++;
  }
  console.log(n === 0 ? '未適用のマイグレーションはありません。' : `${n} 件を適用しました。`);
}

async function pgtap(url) {
  // pgTAP は tap スキーマに入れる（pgTAP の fail() が public.fail() と衝突するため）。テストは search_path = tap, public で動かす
  // なりすまし中（authenticated / anonymous）にも pgTAP を呼べるよう、一時ブランチでだけ使用権限を付ける
  await psql(url, '-c "create schema if not exists tap" -c "create extension if not exists pgtap schema tap" -c "grant usage on schema tap to public"');
  const files = readdirSync(resolve(DB_DIR, 'tests')).filter((f) => f.endsWith('.test.sql')).sort();
  let total = 0;
  const failed = [];
  for (const f of files) {
    try {
      const out = await psql(url, `-At -f /db/tests/${f}`, undefined, 'tap,public');
      const oks = out.split('\n').filter((l) => /^ok \d+/.test(l)).length;
      const bad = out.split('\n').filter((l) => /^not ok/.test(l));
      total += oks;
      if (bad.length) failed.push(`${f}: ${bad.join(' / ')}`);
      console.log(`${bad.length ? 'NG' : 'ok'}  ${f}（${oks} 件）`);
    } catch (e) {
      const lines = String(e.out ?? '').split('\n').filter((l) => /^not ok|^#/.test(l)).slice(0, 10);
      failed.push(`${f}: ${e.message}\n${lines.join('\n')}`);
      console.log(`NG  ${f}`);
    }
  }
  return { total, failed };
}

// DB-19: 同じ投稿への同時回答 10 件で集計が一致する（集計行の for update ロック）
async function concurrency(url) {
  const N = 10;
  const uid = (n) => `00000000-0000-0000-0000-9${String(n).padStart(11, '0')}`;
  const users = Array.from({ length: N + 1 }, (_, i) => uid(i));
  const cleanup = `delete from neon_auth."user" where id in (${users.map((u) => `'${u}'`).join(',')});`;
  await psql(url, '-f -', cleanup);
  await psql(url, '-f -', `insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ${users
    .map((u, i) => `('${u}', 'c${i}', 'c${i}@example.test', false, now(), now())`).join(',')};`);
  try {
    const post = (await psql(url, '-At -f -', `select public.insert_post('${uid(0)}', jsonb_build_object(
      'title','DB-19','fmt','cash','hero','BTN','villain','BB','street','turn','effective_stack',100,
      'keys','["fold","call","s1"]'::jsonb,'s1_label','raise','min_to',13,'max_to',95.7,'pot_base',22.1,
      'sb',0.5,'bb',1,'ante',0,'rake',null,'stacks','{"UTG":100,"HJ":100,"CO":100,"BTN":100,"SB":100,"BB":100}'::jsonb,
      'board','[]'::jsonb,'actions','[]'::jsonb,'spot_index',10,'stop_index',11,'hero_cards','["Ad","Kd"]'::jsonb));`)).trim();
    const paint = `set_byte(set_byte(decode(repeat('00', 676), 'hex'), 2, 20), 672, 20)`;  // AA を call 20、22 を fold 20
    const start = Date.now() + 3000;
    await Promise.all(users.slice(1).map((u) => psql(url, '-f -', `
      select pg_sleep(greatest(0, (${start} - extract(epoch from clock_timestamp()) * 1000) / 1000.0));
      begin;
      select set_config('request.jwt.claims', json_build_object('sub','${u}','role','authenticated')::text, true);
      set local role authenticated;
      insert into public.answers (post_id, paint) values ('${post}', ${paint});
      commit;`)));
    const got = (await psql(url, '-At -f -', `select g.n || ',' || p.answer_count
        || ',' || (get_byte(g.cells, 0) * 256 + get_byte(g.cells, 1)) || ',' || (get_byte(g.cells, 6) * 256 + get_byte(g.cells, 7))
        || ',' || (get_byte(g.cells, 1680) * 256 + get_byte(g.cells, 1681)) || ',' || (get_byte(g.cells, 1682) * 256 + get_byte(g.cells, 1683))
      from public.post_aggregates g join public.posts p on p.id = g.post_id where g.post_id = '${post}';`)).trim();
    const expected = `${N},${N},${N},${N * 20},${N},${N * 20}`;
    console.log(got === expected ? `ok  DB-19 同時回答 ${N} 件で集計が一致（${got}）` : `NG  DB-19 期待 ${expected}、実際 ${got}`);
    return got === expected;
  } finally {
    await psql(url, '-f -', cleanup);
  }
}

async function test(keep) {
  const name = `test-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = JSON.parse(await neon('branches', 'create', '--name', name, '--parent', TEST_BASE, '--expires-at', expires, '--no-secrets', '-o', 'json'));
  const id = created.branch.id;
  console.log(`一時ブランチ ${name}（${id}）を作成（${expires} に自動削除）`);
  let ok = false;
  try {
    const url = await connectionString(id);
    await migrate(url);
    const { total, failed } = await pgtap(url);
    const conc = await concurrency(url);
    ok = failed.length === 0 && conc;
    console.log(`\npgTAP ${total} 件 / 失敗 ${failed.length} ファイル${failed.length ? '\n' + failed.join('\n') : ''}`);
  } finally {
    if (keep) console.log(`一時ブランチを残しました: ${id}`);
    else {
      await neon('branches', 'delete', id);
      console.log('一時ブランチを削除しました。');
    }
  }
  if (!ok) process.exitCode = 1;
}

const [cmd, ...rest] = process.argv.slice(2);
const branchArg = rest.includes('--branch') ? rest[rest.indexOf('--branch') + 1] : undefined;
try {
  if (cmd === 'migrate') {
    if (!branchArg) throw new Error('--branch を指定してください（例: --branch dev）');
    await migrate(await connectionString(branchArg));
  } else if (cmd === 'test') {
    await test(rest.includes('--keep'));
  } else if (cmd === 'seed') {
    // 開発用の試験データ（db/seed/dev.sql）。本番のデータを消さないよう dev ブランチだけに限る
    if (branchArg !== 'dev') throw new Error('seed は --branch dev にだけ実行できます');
    process.stdout.write(await psql(await connectionString(branchArg), '-f /db/seed/dev.sql'));
  } else {
    console.log('使い方: node scripts/db.mjs migrate --branch <ブランチ> | test [--keep] | seed --branch dev');
    process.exitCode = 1;
  }
} catch (e) {
  // 接続文字列が混ざらないよう、postgres:// を伏せて表示する
  console.error(String(e.message).replace(/postgres(ql)?:\/\/\S+/g, '<接続文字列>'));
  process.exitCode = 1;
}

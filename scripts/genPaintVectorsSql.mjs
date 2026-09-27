// 共有テストベクタ（packages/core/test-vectors/paint-validation.json）から pgTAP のテスト
// （supabase/tests/03_paint_vectors.test.sql）を生成する。TS（Vitest）と SQL が同じベクタで判定されることを保つ（DB-06）。
//   node scripts/genPaintVectorsSql.mjs          … 生成する
//   node scripts/genPaintVectorsSql.mjs --check  … 生成物が最新かを確かめる（CI）
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'packages/core/test-vectors/paint-validation.json';
const OUT = 'supabase/tests/03_paint_vectors.test.sql';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (v) => (v === null ? 'null' : String(v));
const { vectors } = JSON.parse(readFileSync(SRC, 'utf8'));

const lines = [
  '-- DB-06: 回答の検証を共有テストベクタで確かめる（TS の validatePaintBytes と同じ結果になること）。',
  `-- このファイルは scripts/genPaintVectorsSql.mjs が ${SRC} から生成する。手で編集しない。`,
  'begin;',
  `select plan(${vectors.length});`,
  '',
  '-- validate_paint → check_size の順に呼び、エラーコード（正常なら null）を返す（answers のトリガと同じ）',
  'create or replace function pg_temp.answer_code(p_hex text, p_keys text[], p_size numeric, p_min numeric, p_max numeric)',
  'returns text language plpgsql as $$',
  'declare u boolean;',
  'begin',
  "  u := public.validate_paint(decode(substr(p_hex, 3), 'hex'), p_keys);",
  '  perform public.check_size(u, p_size, p_min, p_max);',
  '  return null;',
  "exception when sqlstate 'P0001' then",
  '  return sqlerrm;',
  'end $$;',
  '',
];
for (const v of vectors) {
  const keys = `array[${v.keys.map(q).join(', ')}]::text[]`;
  lines.push(
    `select is(pg_temp.answer_code(${q(v.hex)}, ${keys}, ${num(v.size)}, ${num(v.min_to)}, ${num(v.max_to)}), ${v.expect === null ? 'null' : q(v.expect)}, ${q(v.name)});`,
  );
}
lines.push('', 'select * from finish();', 'rollback;', '');
const sql = lines.join('\n');

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    // 無ければ不一致として扱う
  }
  if (current.replace(/\r\n/g, '\n') !== sql) {
    console.error(`${OUT} が ${SRC} と一致しません。node scripts/genPaintVectorsSql.mjs で生成し直してください。`);
    process.exit(1);
  }
  console.log(`${OUT} は最新です。`);
} else {
  writeFileSync(OUT, sql);
  console.log(`${OUT} を生成しました（${vectors.length} 件）。`);
}

/**
 * OCR の精度を正解データで測る（手元専用。画像は git 管理外の sample/ にある）。
 *
 *   node --experimental-strip-types scripts/ocr/accuracy.mts [フォルダ ...] [--drafts]   （既定: sample/pc sample/sp）
 *
 * 各 `<名前>.png` を packages/ocr の readHandHistory で読み、`<名前>.expected.json` と比べる。
 * 文字認識はアプリと同じ tesseract.js（Node 版。学習データは node_modules から読み、外部に通信しない）。
 * 07 章 §6 の合格基準: ボード 100%、プレイヤー（Hero の席と各席のハンド）・アクション 95% 以上。
 *
 * `--drafts` は、正解の無い画像の読み取り結果を正解と同じ形で `<名前>.ocr.json` に書き出す
 * （目視で確かめて `<名前>.expected.json` を作るときの下書き。名前は含まない）。
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createWorker, OEM } from 'tesseract.js';
import { readHandHistory, TESSERACT_PARAMS, type OcrResult, type TextMode } from '../../packages/ocr/src/index.ts';
import { decodePng, encodePng } from './png.mts';

const POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
type Expected = {
  hero: string;
  hands: Record<string, string[]>;
  board: string[];
  actions: { street: string; pos: string; verb: string; amount: number | null }[];
};

const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (dirs.length === 0) dirs.push('sample/pc', 'sample/sp');
const verbose = process.argv.includes('--verbose');
const drafts = process.argv.includes('--drafts');

const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
  cacheMethod: 'none',
  gzip: true,
});
let currentMode: TextMode | null = null;
const reader = async (img: Parameters<typeof encodePng>[0], mode: TextMode): Promise<string> => {
  if (img.width === 0 || img.height === 0) return '';
  if (mode !== currentMode) {
    await worker.setParameters(TESSERACT_PARAMS[mode]);
    currentMode = mode;
  }
  const r = await worker.recognize(encodePng(img));
  if (verbose && mode === 'block') console.log(r.data.text);
  return r.data.text;
};

const actionKey = (a: { street: string; pos: string | null; verb: string; amount: number | null }): string =>
  `${a.street} ${a.pos} ${a.verb} ${a.amount ?? '-'}`;

type Tally = { ok: number; all: number };
const total: { board: Tally; players: Tally; actions: Tally; ms: number; n: number } = {
  board: { ok: 0, all: 0 },
  players: { ok: 0, all: 0 },
  actions: { ok: 0, all: 0 },
  ms: 0,
  n: 0,
};
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
    const expPath = join(dir, f.replace(/\.png$/, '.expected.json'));
    if (!existsSync(expPath)) {
      if (!drafts) {
        console.log(`${dir}/${f}: 正解データなし（飛ばす）`);
        continue;
      }
      const r = await readHandHistory(decodePng(readFileSync(join(dir, f))), reader);
      const draft = {
        source: 'OCR の読み取り結果（下書き。目視で確かめていない）',
        hero: r.hero,
        hands: Object.fromEntries(POS.map((p) => [p, r.hands[p] ?? null])),
        board: r.board,
        actions: r.actions,
        problems: r.problems,
      };
      writeFileSync(join(dir, f.replace(/\.png$/, '.ocr.json')), JSON.stringify(draft, null, 1));
      console.log(`${dir}/${f}: 下書きを書き出した${r.problems.length ? ` [${r.problems.map((p) => p.code).join(',')}]` : ''}`);
      continue;
    }
    const exp = JSON.parse(readFileSync(expPath, 'utf8')) as Expected;
    const img = decodePng(readFileSync(join(dir, f)));
    const t0 = Date.now();
    const r: OcrResult = await readHandHistory(img, reader);
    const ms = Date.now() - t0;
    total.ms += ms;
    total.n++;
    const diffs: string[] = [];

    total.board.all++;
    if (r.board.join() === exp.board.join()) total.board.ok++;
    else diffs.push(`ボード ${r.board.join()} ≠ ${exp.board.join()}`);

    total.players.all += 1 + POS.length;
    if (r.hero === exp.hero) total.players.ok++;
    else diffs.push(`Hero ${r.hero} ≠ ${exp.hero}`);
    for (const p of POS) {
      if ((r.hands[p] ?? []).join() === (exp.hands[p] ?? []).join()) total.players.ok++;
      else diffs.push(`${p} ${r.hands[p]?.join('') ?? '-'} ≠ ${exp.hands[p]?.join('')}`);
    }

    // アクションは順に突き合わせる（ずれたら以降も不一致として数える）
    const n = Math.max(exp.actions.length, r.actions.length);
    total.actions.all += exp.actions.length;
    for (let i = 0; i < n; i++) {
      const e = exp.actions[i];
      const g = r.actions[i];
      if (e && g && actionKey(e) === actionKey(g)) total.actions.ok++;
      else diffs.push(`${i + 1}手目 ${g ? actionKey(g) : '（なし）'} ≠ ${e ? actionKey(e) : '（なし）'}`);
    }

    // 結果に名前が入っていないこと（不変条件 6）は単体テストで確かめる。ここでは表示だけ
    const problems = r.problems.map((p) => p.code).join(',');
    console.log(`${dir}/${f} ${ms}ms ${diffs.length === 0 ? 'OK' : 'NG'}${problems ? ` [${problems}]` : ''}`);
    for (const d of diffs) console.log(`    ${d}`);
  }
}
await worker.terminate();

const pct = ({ ok, all }: Tally): string => `${ok}/${all}（${all ? ((100 * ok) / all).toFixed(1) : '-'}%）`;
console.log(`\nボード ${pct(total.board)}  プレイヤー ${pct(total.players)}  アクション ${pct(total.actions)}  平均 ${Math.round(total.ms / Math.max(1, total.n))}ms/枚`);

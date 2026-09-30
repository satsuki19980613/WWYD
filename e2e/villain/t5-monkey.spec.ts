/**
 * T5 モンキーテスト（docs/villain-reads-test-plan.md §3 T5-01・T5-03・T5-04・T5-05）。画面 × 大きさ × 種ごとに 1 本のテスト。
 *   T5-01 post    投稿画面の Villain の欄
 *   T5-04 mtt     MTT の欄（Game 形式の切り替え・Slider・数の欄）
 *   T5-03 answer  回答画面（席の ◆・All Villains・MTT・History・Replay）/ result 集計画面
 *   T5-05 storage localStorage の壊れた値（下書き・Preset の鍵）から起動してランダムに操作
 * T5-02（合法手のランダムウォーク＋ランダムな Read）は t5-walk.spec.ts。
 *
 * 環境変数（既定は通常の `npm run e2e` に入れても数分で終わる小さい量）:
 *   T5_SEEDS      種の数（既定 2）。種は T5_SEED_BASE + 1 … T5_SEED_BASE + T5_SEEDS（T5_SEED_BASE の既定は 0）
 *   T5_STEPS      1 種の手数（既定 25）。公式の量は 200
 *   T5_SCREENS    画面の絞り込み（カンマ区切り。post,mtt,answer,result,storage）
 *   T5_SIZES      大きさの絞り込み（pc1280,pc1024,sp。既定 pc1280,sp）
 *   T5_ONLY       1 本だけ再現する「画面:大きさ:種」（例 post:pc1280:7）。T5_STEPS も合わせる
 *   T5_RESULT_FILE 結果の JSON Lines（既定 t5-monkey-results/results.jsonl）
 *
 * 同じ種の再現: T5_ONLY=post:pc1280:7 T5_STEPS=200 E2E_PORT=5215 npx playwright test e2e/villain/t5-monkey.spec.ts --project=pc
 * 大きさが sp のテストは @sp（Pixel 7。--project=sp）、それ以外は PC の project（--project=pc）で動く。
 * 投稿画面から create-post に届いた本文は、サーバーと同じ判定（validateInput + verifyPost）に通し、断られたら違反にする。
 */
import { expect, test } from '@playwright/test';
import { makeCfg, runMonkey, saveResult, setupBackend, SCREENS, summarize, type ScreenId, type SizeClass } from './t5Kit.ts';
import { serverJudge } from './t5Gen.ts';

const SEEDS = Number(process.env.T5_SEEDS ?? 2);
const STEPS = Number(process.env.T5_STEPS ?? 25);
const BASE = Number(process.env.T5_SEED_BASE ?? 0);
const only = process.env.T5_ONLY?.split(':');
const screens = (process.env.T5_SCREENS?.split(',') as ScreenId[] | undefined) ?? SCREENS;
const sizes = (process.env.T5_SIZES?.split(',') as SizeClass[] | undefined) ?? (['pc1280', 'sp'] as SizeClass[]);

const ID_OF: Record<ScreenId, string> = { post: 'T5-01', mtt: 'T5-04', answer: 'T5-03', result: 'T5-03', storage: 'T5-05' };

test.describe.configure({ mode: 'parallel' });

// 種を外側にする（途中で止めても、全部の画面・大きさに同じ数の種が回っているように）
for (let k = 1; k <= SEEDS; k++) {
  for (const size of sizes) {
    for (const screen of screens) {
      const seed = BASE + k;
      if (only && (only[0] !== screen || only[1] !== size || Number(only[2]) !== seed)) continue;
      const name = `${ID_OF[screen]} monkey ${screen} ${size} seed=${seed}${size === 'sp' ? ' @sp' : ''}`;
      test(name, async ({ page }) => {
        test.setTimeout(30 * 60_000);
        const cfg = makeCfg(screen, seed);
        const judged: { ok: boolean; message: string; body: unknown }[] = [];
        const ctx = await setupBackend(page, cfg, seed, (body) => {
          const j = serverJudge(body);
          judged.push({ ok: j.ok, message: j.ok ? '' : j.message, body });
          return j.ok ? { status: 201, body: { id: '00000000-0000-4000-8000-000000000001' } } : { status: 422, body: { error: j.code } };
        });
        const r = await runMonkey(page, cfg, ctx, size, seed, STEPS);
        const rejected = judged.filter((j) => !j.ok);
        if (rejected.length > 0) {
          r.violations.push({ kind: 'server-rejects-app-body', detail: rejected[0]!.message.slice(0, 300), step: r.steps, op: 'submit', path: '/new', viewport: '' });
        }
        // アプリ由来の console.error（通信の失敗を混ぜたものは除く）も違反にする（計画書 §3 T5-01 の毎手の点検）
        for (const c of r.consoleErrors.filter((x) => !x.net)) {
          r.violations.push({ kind: 'console-error', detail: c.text.slice(0, 300), step: c.step, op: '', path: '', viewport: '' });
        }
        saveResult(r);
        console.log(`${summarize(r)} posts=${ctx.posts.length} judged=${judged.length} cover=${JSON.stringify(r.cover)}`);
        for (const v of r.violations) console.log(`  VIOLATION ${v.kind} step=${v.step} vp=${v.viewport} path=${v.path} op=[${v.op}] :: ${v.detail}`);
        const real = r.consoleErrors.filter((c) => !c.net);
        for (const c of real.slice(0, 5)) console.log(`  CONSOLE.ERROR step=${c.step} :: ${c.text}`);
        expect(r.violations, `${screen}/${size}/seed=${seed}`).toEqual([]);
      });
    }
  }
}

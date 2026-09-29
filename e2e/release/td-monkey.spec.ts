/**
 * T-D モンキーテスト（docs/release-test-plan.md §3 D）。画面 × 大きさ × 種ごとに 1 本のテスト（既定は 1 種 200 手 × 20 種）。
 *
 * 環境変数:
 *   TD_SEEDS      種の数（既定 20）。種は TD_SEED_BASE + 1 … TD_SEED_BASE + TD_SEEDS（TD_SEED_BASE の既定は 0）
 *   TD_STEPS      1 種の手数（既定 200）
 *   TD_SCREENS    画面の絞り込み（カンマ区切り。list,post,answer,result,drafts,legal,chrome）
 *   TD_SIZES      大きさの絞り込み（pc1280,pc1024,sp）
 *   TD_ONLY       1 本だけ再現する「画面:大きさ:種」（例 post:pc1280:7）。TD_STEPS も合わせる
 *
 * 落ちた種は td-monkey-results/results.jsonl（環境変数 TD_RESULT_FILE で変える）に画面・大きさ・種・手数・違反で残る。
 * 同じ種の再現: TD_ONLY=post:pc1280:7 E2E_PORT=5204 npx playwright test e2e/release/td-monkey.spec.ts --project=pc
 * 大きさが sp のテストは @sp（Pixel 7。--project=sp）、それ以外は PC の project（--project=pc）で動く。
 *
 * 投稿の画面は、種の 3 分の 2 で「合法手のランダムウォークで途中まで入れた状態」から始める（深い状態を探るため。td-walk.ts）。
 * 投稿の画面から create-post に届いた本文は、サーバーと同じ判定（validateInput + verifyPost）に通し、断られたら違反にする。
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { makeCfg, runMonkey, saveResult, setupBackend, SCREENS, SIZES, summarize, type ScreenId, type SizeClass } from './td-monkey.ts';
import { serverJudge, walkHand, type WalkEnv } from './td-walk.ts';

const SEEDS = Number(process.env.TD_SEEDS ?? 20);
const STEPS = Number(process.env.TD_STEPS ?? 200);
const BASE = Number(process.env.TD_SEED_BASE ?? 0);
const only = process.env.TD_ONLY?.split(':');
const screens = (process.env.TD_SCREENS?.split(',') as ScreenId[] | undefined) ?? SCREENS;
const sizes = (process.env.TD_SIZES?.split(',') as SizeClass[] | undefined) ?? (['pc1280', 'pc1024', 'sp'] as SizeClass[]);

/** OCR の確認画面から始める種の入力画像（sample/ は個人の対戦画像で、リポジトリの管理外。手元で読むだけ。無ければ ocr の試験は飛ばす） */
const SAMPLE_DIR = process.env.TD_SAMPLE_DIR ?? resolve(process.cwd(), '../../../sample');
function sampleImages(kind: 'pc' | 'sp'): string[] {
  try {
    return readdirSync(resolve(SAMPLE_DIR, kind))
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => resolve(SAMPLE_DIR, kind, f));
  } catch {
    return [];
  }
}

test.describe.configure({ mode: 'parallel' });

// 種を外側にする（途中で止めても、全部の画面・大きさに同じ数の種が回っているように）
for (let k = 1; k <= SEEDS; k++) {
  for (const size of sizes) {
    for (const screen of screens) {
      const seed = BASE + k;
      if (only && (only[0] !== screen || only[1] !== size || Number(only[2]) !== seed)) continue;
      const name = `monkey ${screen} ${size} seed=${seed}${size === 'sp' ? ' @sp' : ''}`;
      test(name, async ({ page }) => {
        test.setTimeout(20 * 60_000);
        const cfg = makeCfg(screen, seed);
        const judged: WalkEnv['judged'] = [];
        const ctx = await setupBackend(page, cfg, seed, (body) => {
          const j = serverJudge(body);
          judged.push({ ok: j.ok, message: j.ok ? '' : j.message, body });
          return j.ok ? { status: 201, body: { id: '00000000-0000-4000-8000-000000000001' } } : { status: 422, body: { error: j.code } };
        });
        let skip = false;
        let prefix = '';
        if (screen === 'ocr') {
          const images = sampleImages(size === 'sp' ? 'sp' : 'pc');
          test.skip(images.length === 0, `sample/ に画像が無い（${SAMPLE_DIR}）`);
          await page.setViewportSize(SIZES[size]);
          if (cfg.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
          // 確認画面（読み取り結果）が開く画像が見つかるまで、種から決めた順に試す（投稿できないハンドの画像はエラーで止まる）
          let image = '';
          let reviewOpen = false;
          for (let attempt = 0; attempt < 24 && !reviewOpen; attempt++) {
            image = images[(seed * 7 + attempt * 5) % images.length] as string;
            await page.goto('/new', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('ocr-file').setInputFiles(image);
            const busy = page.getByRole('dialog', { name: '読み取り中…' });
            await busy.waitFor({ timeout: 10_000 }).catch(() => undefined);
            await busy.waitFor({ state: 'detached', timeout: 150_000 }).catch(() => undefined);
            reviewOpen = (await page.getByRole('dialog', { name: '読み取り結果' }).count()) > 0;
          }
          prefix = `ocr=${image.split(/[\/]/).pop()} review=${reviewOpen}`;
          skip = true;
        }
        if (screen === 'post' && seed % 3 !== 0) {
          // 出発点: 合法手のランダムウォークで途中（または最後）まで入れた投稿
          await page.setViewportSize(SIZES[size]);
          if (cfg.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
          page.on('dialog', (d) => void d.accept().catch(() => undefined));
          const env: WalkEnv = { page, mobile: size === 'sp', posts: ctx.posts, judged };
          const r = await walkHand(env, seed, 1000 + seed, { stopAfterActions: seed % 3 === 1 ? 4 + (seed % 7) : 999 }).catch((e) => ({ outcome: 'stuck', detail: String(e.message).slice(0, 100), script: [] as string[], actions: 0 }));
          prefix = `prefix=${r.outcome}/${r.actions}`;
          skip = true;
        }
        const r = await runMonkey(page, cfg, ctx, size, seed, STEPS, { skipInitialGoto: skip });
        const rejected = judged.filter((j) => !j.ok);
        if (rejected.length > 0) {
          r.violations.push({ kind: 'server-rejects-app-body', detail: rejected[0]!.message.slice(0, 300), step: r.steps, op: 'submit', path: '/new', viewport: '' });
        }
        saveResult(r);
        console.log(`${summarize(r)} ${prefix} posts=${ctx.posts.length} judged=${judged.length} cover=${JSON.stringify(r.cover)}`);
        for (const v of r.violations) console.log(`  VIOLATION ${v.kind} step=${v.step} vp=${v.viewport} path=${v.path} op=[${v.op}] :: ${v.detail}`);
        expect(r.violations, `${screen}/${size}/seed=${seed}`).toEqual([]);
      });
    }
  }
}

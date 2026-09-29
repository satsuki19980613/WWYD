/**
 * T-D 合法手のランダムウォーク（投稿専用。docs/release-test-plan.md §3 D）。
 * 台のボタンだけでハンドを最後まで入れ、Spot を選んで投稿し、create-post への本文を packages/core の
 * validateInput + verifyPost（サーバーと同じ判定）に通す。
 *
 * 環境変数: TD_WALK_SEEDS（種の数。既定 20）、TD_HANDS（1 種のハンド数。既定 25）、TD_WALK_BASE（種の開始。既定 0）、
 *           TD_WALK_ONLY（1 本だけ再現する「種」。例 7）、TD_WALK_SIZES（pc,sp。既定 pc,sp）
 * 結果は td-monkey-results/walk.jsonl（TD_WALK_FILE で変える）。
 * 再現: TD_WALK_ONLY=7 TD_WALK_SIZES=pc E2E_PORT=5204 npx playwright test e2e/release/td-walk.spec.ts --project=pc
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { makeCfg, setupBackend } from './td-monkey.ts';
import { serverJudge, walkHand, type WalkEnv, type WalkResult } from './td-walk.ts';

const WALK_FILE = process.env.TD_WALK_FILE ?? 'td-monkey-results/walk.jsonl';
const SEEDS = Number(process.env.TD_WALK_SEEDS ?? 20);
const HANDS = Number(process.env.TD_HANDS ?? 25);
const BASE = Number(process.env.TD_WALK_BASE ?? 0);
const ONLY = process.env.TD_WALK_ONLY ? Number(process.env.TD_WALK_ONLY) : null;
/** 1 ハンドだけ再現する（TD_WALK_ONLY と合わせる。ハンドの乱数は種とハンド番号だけで決まる） */
const HAND_ONLY = process.env.TD_WALK_HAND ? Number(process.env.TD_WALK_HAND) : null;
const SIZES = (process.env.TD_WALK_SIZES ?? 'pc,sp').split(',');

test.describe.configure({ mode: 'parallel' });

for (const size of SIZES) {
  for (let k = 1; k <= SEEDS; k++) {
    const seed = BASE + k;
    if (ONLY !== null && ONLY !== seed) continue;
    test(`walk ${size} seed=${seed}${size === 'sp' ? ' @sp' : ''}`, async ({ page }) => {
      test.setTimeout(30 * 60_000);
      page.on('dialog', (d) => void d.accept().catch(() => undefined));
      page.on('crash', () => console.log('CRASH event'));
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text().slice(0, 300)}`);
      });
      await page.setViewportSize(size === 'sp' ? { width: 412, height: 915 } : { width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const cfg = makeCfg('post', seed);
      const judged: WalkEnv['judged'] = [];
      const ctx = await setupBackend(page, cfg, seed, (body) => {
        const j = serverJudge(body);
        judged.push({ ok: j.ok, message: j.ok ? '' : j.message, body });
        return j.ok ? { status: 201, body: { id: '00000000-0000-4000-8000-000000000001' } } : { status: 422, body: { error: j.code } };
      });
      const env: WalkEnv = { page, mobile: size === 'sp', posts: ctx.posts, judged };
      const results: WalkResult[] = [];
      for (let h = 1; h <= HANDS; h++) {
        if (HAND_ONLY !== null && h !== HAND_ONLY) continue;
        let r: WalkResult;
        try {
          r = await walkHand(env, seed, h);
        } catch (e) {
          r = { seed, hand: h, outcome: 'stuck', players: 0, actions: 0, detail: `exception: ${String((e as Error).message).slice(0, 300)}`, script: [] };
        }
        results.push(r);
        mkdirSync(dirname(WALK_FILE), { recursive: true });
        appendFileSync(WALK_FILE, JSON.stringify({ size, ...r }) + '\n');
      }
      const count = (o: string): number => results.filter((r) => r.outcome === o).length;
      console.log(`walk ${size} seed=${seed}: hands=${results.length} posted=${count('posted')} no-spot=${count('no-spot')} stuck=${count('stuck')} blocked=${count('blocked')} server-reject=${count('server-reject')} errors=${errors.length}`);
      for (const r of results) if (!['posted', 'no-spot'].includes(r.outcome)) console.log(`  ${r.outcome} hand=${r.hand} players=${r.players}: ${r.detail}\n    script: ${r.script.join(' ; ')}`);
      for (const e of errors.slice(0, 5)) console.log(`  ${e}`);
      expect(results.filter((r) => !['posted', 'no-spot'].includes(r.outcome)).map((r) => `${r.outcome}#${r.hand}`)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

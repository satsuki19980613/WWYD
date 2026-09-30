/**
 * T5-02 合法手のランダムウォーク＋ランダムな Read（docs/villain-reads-test-plan.md §3 T5-02）。
 * 台のボタンだけでハンドを最後まで入れ、Spot を選び、登録できる席にランダムな全体の傾向・Spot Read・General Read（MTT なら MTT の欄も）を
 * 画面の操作で入れて投稿する。create-post に届いた本文をサーバーと同じ判定（validateInput + verifyPost）に通し、
 * その本文から detailJson で回答画面を開いて、席のモーダル・All Villains・MTT・History が落ちないこと・表示が本文と合うことを確かめる。
 *
 * 環境変数:
 *   T5_HANDS   1 本のテストで行うハンド数（既定 3）
 *   T5_CHUNKS  大きさごとのテストの本数（既定 1）。合計のハンド数 = T5_HANDS × T5_CHUNKS × 大きさの数。公式の量は 150 × 2 × 2 = 600（PC・スマホ各 300）
 *   T5_SIZES   大きさの絞り込み（pc1280,sp。既定 両方）
 *   T5_WALK_SEED_BASE  種の基準（既定 0。本数 c の種は BASE + c）
 * 結果は t5-monkey-results/walk.jsonl に 1 ハンド 1 行で残る（T5_WALK_FILE で変える）。
 * 再現: 種 c・ハンド番号 h は walkHand(env, seed=BASE+c, hand=(c-1)*HANDS+h)。T5_ONLY_HAND=<c>:<h> で 1 ハンドだけ回せる。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { detailJson } from '../../packages/app/src/answer/detailFixtures.ts';
import { type Raw } from '../../packages/core/src/post/postFixtures.ts';
import { hasVisibleRead } from '../../packages/app/src/reads/readsModel.ts';
import { hasMttInfo } from '../../packages/app/src/reads/readsModel.ts';
import type { MttInfo, VillainReads } from '../../packages/core/src/index.ts';
import { checkView, ID, makeCfg, setupBackend, SNAPSHOT_JS, SIZES, type Snapshot } from './t5Kit.ts';
import { serverJudge, walkHand, type WalkEnv, type WalkResult } from './t5Walk.ts';

const HANDS = Number(process.env.T5_HANDS ?? 3);
const CHUNKS = Number(process.env.T5_CHUNKS ?? 1);
const BASE = Number(process.env.T5_WALK_SEED_BASE ?? 0);
const WALK_FILE = process.env.T5_WALK_FILE ?? 't5-monkey-results/walk.jsonl';
const only = process.env.T5_ONLY_HAND?.split(':').map(Number);
const sizes = (process.env.T5_SIZES?.split(',') as ('pc1280' | 'sp')[] | undefined) ?? (['pc1280', 'sp'] as ('pc1280' | 'sp')[]);

test.describe.configure({ mode: 'parallel' });

async function snap(page: Page): Promise<Snapshot> {
  await page.waitForTimeout(150);
  return (await page.evaluate(SNAPSHOT_JS)) as Snapshot;
}

/** 回答画面を本文から開いて、Villain・MTT の表示を一通り操作する。見つけた問題（種別: 詳細）を返す */
async function tourAnswer(page: Page, ctxBe: { detail: unknown }, body: Raw): Promise<string[]> {
  const problems: string[] = [];
  ctxBe.detail = detailJson(body, { viewer: 'unanswered', id: ID });
  await page.goto(`/s/${ID}/answer`, { waitUntil: 'domcontentloaded' });
  const vr = (body.villain_reads ?? {}) as VillainReads;
  const mtt = (body.mtt ?? null) as MttInfo | null;
  const take = async (what: string): Promise<Snapshot> => {
    const s = await snap(page);
    for (const p of s.problems) problems.push(`${what}: ${p.kind}: ${p.detail}`);
    for (const p of checkView(s, body, vr)) problems.push(`${what}: ${p.kind}: ${p.detail}`);
    return s;
  };
  await page.locator('.ptable').waitFor({ timeout: 10_000 }).catch(() => problems.push('answer: 卓が出ない'));
  await take('answer');
  const any = Object.values(vr).some((r) => hasVisibleRead(r));
  const allBtn = page.getByRole('button', { name: 'All Villains' });
  const mttBtn = page.getByRole('button', { name: 'MTT', exact: true });
  if ((await allBtn.count()) > 0 && (await allBtn.isEnabled()) !== any) problems.push(`answer: All Villains の押せる状態が情報と合わない（enabled=${await allBtn.isEnabled()} any=${any}）`);
  if ((await mttBtn.count()) > 0 && (await mttBtn.isEnabled()) !== hasMttInfo(mtt)) problems.push(`answer: MTT の押せる状態が情報と合わない（enabled=${await mttBtn.isEnabled()} mtt=${JSON.stringify(mtt)}）`);
  // 席の ◆
  const seatBtns = page.locator('button.pseat-btn');
  const n = await seatBtns.count();
  for (let i = 0; i < n; i++) {
    await seatBtns.nth(i).click();
    await take(`seat#${i}`);
    await page.keyboard.press('Escape');
    if ((await page.getByRole('dialog').count()) > 0) problems.push(`seat#${i}: Esc でモーダルが閉じない`);
  }
  if (any) {
    await allBtn.click();
    await take('All Villains');
    const folded = page.locator('details.rv-folded summary');
    if ((await folded.count()) > 0) {
      await folded.click();
      await take('All Villains(folded open)');
    }
    await page.keyboard.press('Escape');
  }
  if (hasMttInfo(mtt)) {
    await mttBtn.click();
    await take('MTT');
    await page.keyboard.press('Escape');
  }
  // History はスマホだけのボタン（PC は画面に並んでいる）
  const hist = page.getByRole('button', { name: 'History' });
  if ((await hist.count()) > 0) {
    await hist.click();
    await take('History');
    await page.keyboard.press('Escape');
  }
  return problems;
}

for (let c = 1; c <= CHUNKS; c++) {
  for (const size of sizes) {
    if (only && only[0] !== c) continue;
    test(`T5-02 walk ${size} chunk=${c}${size === 'sp' ? ' @sp' : ''}`, async ({ page }) => {
      test.setTimeout(60 * 60_000);
      const seed = BASE + c;
      const cfg = makeCfg('post', seed);
      const judged: WalkEnv['judged'] = [];
      const ctx = await setupBackend(page, cfg, seed, (body) => {
        const j = serverJudge(body);
        judged.push({ ok: j.ok, message: j.ok ? '' : j.message, body });
        return j.ok ? { status: 201, body: { id: ID } } : { status: 422, body: { error: j.code } };
      });
      await page.setViewportSize(SIZES[size]);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      page.on('dialog', (d) => void d.accept().catch(() => undefined));
      // 止まったときに例外で見えるように（既定は無制限）
      page.setDefaultTimeout(10_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`.slice(0, 300)));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push(`console.error: ${m.text()}`.slice(0, 300));
      });
      const env: WalkEnv = { page, mobile: size === 'sp', posts: ctx.posts, judged };
      const tally: Record<string, number> = {};
      const failures: string[] = [];
      let withReads = 0;
      let withMtt = 0;
      for (let h = 0; h < HANDS; h++) {
        const hand = (c - 1) * HANDS + h;
        if (only && only[1] !== hand) continue;
        let r: WalkResult;
        try {
          r = await walkHand(env, seed, hand);
        } catch (e) {
          r = { seed, hand, outcome: 'stuck', players: 0, actions: 0, detail: `exception: ${String((e as Error).message).slice(0, 200)}`, script: [] };
        }
        tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
        const row: Record<string, unknown> = { size, seed, hand, outcome: r.outcome, players: r.players, actions: r.actions, reads: r.reads ?? 0, mtt: r.mtt ?? false, detail: r.detail ?? '', problems: [] as string[] };
        if (r.outcome === 'server-reject' || r.outcome === 'blocked') failures.push(`${size} seed=${seed} hand=${hand}: ${r.outcome}: ${r.detail}\n    script: ${r.script.join(' ; ')}`);
        if (r.outcome === 'stuck') failures.push(`${size} seed=${seed} hand=${hand}: stuck: ${r.detail} script: ${r.script.join(' ; ').slice(0, 300)}`);
        if (r.outcome === 'posted' && r.body) {
          if ((r.reads ?? 0) > 0) withReads++;
          if (r.mtt) withMtt++;
          const ps = await tourAnswer(page, ctx.be, r.body as Raw).catch((e) => [`tour: exception ${String((e as Error).message).slice(0, 200)}`]);
          (row.problems as string[]).push(...ps);
          if (ps.length > 0) failures.push(`${size} seed=${seed} hand=${hand}: answer tour: ${ps.slice(0, 3).join(' | ')}`);
        }
        if (errors.length > 0) {
          (row.problems as string[]).push(...errors);
          failures.push(`${size} seed=${seed} hand=${hand}: ${errors[0]}`);
          errors.length = 0;
        }
        mkdirSync(dirname(WALK_FILE), { recursive: true });
        appendFileSync(WALK_FILE, JSON.stringify(row) + '\n');
      }
      console.log(`T5-02 ${size} chunk=${c} hands=${HANDS} outcomes=${JSON.stringify(tally)} withReads=${withReads} withMtt=${withMtt} posts=${ctx.posts.length}`);
      for (const f of failures) console.log(`  FAIL ${f}`);
      expect(failures).toEqual([]);
    });
  }
}

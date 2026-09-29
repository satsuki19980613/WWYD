/**
 * A-06（画像の読み込み）の部品。T4 の試験画像は個人の対戦画像で git 管理外。元のリポジトリの sample/ から絶対パスで読むだけで、
 * リポジトリの管理下にコピーしない。無ければ試験は skip する。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const SAMPLE_ROOT = process.env['WWYD_SAMPLE_DIR'] ?? 'C:/Users/sa641.SATSUKIPC/OneDrive/ドキュメント/一時ツール/WWYD/sample';

export type ExpectedAction = { street: 'pf' | 'flop' | 'turn' | 'river'; pos: string; verb: string; amount: number | null };
export type Expected = { hero: string; hands: Record<string, string[]>; board: string[]; actions: ExpectedAction[] };
export type Sample = { name: string; png: string; expected: Expected };

/** dir（pc / sp）の T4 画像と正解。正解の無い画像は含めない */
export function loadSamples(dir: 'pc' | 'sp'): Sample[] {
  const d = path.join(SAMPLE_ROOT, dir);
  if (!fs.existsSync(d)) return [];
  const out: Sample[] = [];
  for (const f of fs.readdirSync(d).sort()) {
    if (!f.endsWith('.png')) continue;
    const exp = path.join(d, f.replace(/\.png$/, '.expected.json'));
    if (!fs.existsSync(exp)) continue;
    out.push({ name: f, png: path.join(d, f), expected: JSON.parse(fs.readFileSync(exp, 'utf-8')) as Expected });
  }
  return out;
}

export const NO_SPOT = 'Flop 以降の Hero の Action がない Hand です';
export const PREFLOP_ALLIN = 'Preflop で All-in になった Hand は投稿できません';
export const UNREADABLE = '読み取れませんでした';

/** 正解に、Hero のフロップ以降のアクションが 1 つ以上あるか */
export function heroHasPostflop(e: Expected): boolean {
  return e.actions.some((a) => a.street !== 'pf' && a.pos === e.hero);
}

export type Outcome =
  | { kind: 'review' }
  | { kind: 'error'; message: string };

/** 「読み込む」を押し、ゲームを選び、ファイルを渡して、確認画面かエラーが出るまで待つ */
export async function importImage(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, game: RegExp = /^通常/): Promise<Outcome> {
  const errBox = page.locator('.pf-ocr .pf-errors');
  await page.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('dialog', { name: 'T4 の Game' }).getByRole('button', { name: game }).click();
  await (await chooser).setFiles(file);
  const review = page.getByRole('dialog', { name: '読み取り結果' });
  await expect(review.or(errBox)).toBeVisible({ timeout: 90_000 });
  if (await review.isVisible()) return { kind: 'review' };
  return { kind: 'error', message: (await errBox.innerText()).trim() };
}

const SUIT: Record<string, string> = { Spade: 's', Heart: 'h', Diamond: 'd', Club: 'c' };

/** 「Club の J」→ Jc */
export function cardOfLabel(label: string | null): string {
  const m = /^(Spade|Heart|Diamond|Club) の (\S+)$/.exec(label ?? '');
  return m ? `${m[2]}${SUIT[m[1] as string]}` : `?${label}`;
}

export type ReviewView = {
  hero: string | null;
  hands: Record<string, string[]>;
  board: string[];
  actions: { pos: string; verb: string; amount: string }[];
  issues: string[];
};

/** 確認画面の今の内容 */
export async function readReview(review: Locator): Promise<ReviewView> {
  return review.evaluate((root) => {
    const label = (e: Element): string => e.getAttribute('aria-label') ?? '';
    const hands: Record<string, string[]> = {};
    root.querySelectorAll('.ocr-rv-seat').forEach((seat) => {
      const pos = seat.querySelector('.ocr-rv-pos')?.textContent ?? '';
      hands[pos] = [...seat.querySelectorAll('.pf-hand .pcard')].map(label);
    });
    const heroBtn = root.querySelector('[role=radio][aria-checked=true]');
    return {
      hero: heroBtn ? (/^Hero を (\S+) にする$/.exec(label(heroBtn))?.[1] ?? null) : null,
      hands,
      board: [...root.querySelectorAll('.pf-board .pf-bslot.filled .pcard')].map(label),
      actions: [...root.querySelectorAll('.ocr-rv-row')].map((row) => ({
        pos: row.querySelector('.ocr-rv-actor')?.textContent ?? '',
        verb: row.querySelector('.select-trigger span')?.textContent ?? '',
        amount: (row.querySelector('.ocr-rv-amt input') as HTMLInputElement | null)?.value ?? '',
      })),
      issues: [...root.querySelectorAll('.pf-errors li')].map((li) => li.textContent ?? ''),
    };
  }).then((v) => ({
    ...v,
    hands: Object.fromEntries(Object.entries(v.hands).map(([k, arr]) => [k, arr.map(cardOfLabel)])),
    board: v.board.map(cardOfLabel),
  }));
}

const VERB_LABEL: Record<string, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };

/** 正解と確認画面の違い（空なら一致） */
export function diffReview(v: ReviewView, e: Expected): string[] {
  const d: string[] = [];
  if (v.hero !== e.hero) d.push(`Hero ${v.hero} ≠ ${e.hero}`);
  for (const [pos, cards] of Object.entries(e.hands)) {
    const got = (v.hands[pos] ?? []).join('');
    if (got !== cards.join('')) d.push(`${pos} の Hand ${got} ≠ ${cards.join('')}`);
  }
  if (v.board.join('') !== e.board.join('')) d.push(`Board ${v.board.join('')} ≠ ${e.board.join('')}`);
  if (v.actions.length !== e.actions.length) d.push(`Action の数 ${v.actions.length} ≠ ${e.actions.length}`);
  e.actions.forEach((a, i) => {
    const g = v.actions[i];
    if (!g) return;
    const wantAmt = a.amount === null ? '' : String(a.amount);
    if (g.pos !== a.pos || g.verb !== VERB_LABEL[a.verb] || (g.amount !== wantAmt && (a.verb === 'bet' || a.verb === 'raise'))) {
      d.push(`${i + 1}手目 ${g.pos} ${g.verb} ${g.amount} ≠ ${a.pos} ${VERB_LABEL[a.verb]} ${wantAmt}`);
    }
  });
  return d;
}

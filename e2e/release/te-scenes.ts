/**
 * リリース前テスト T-E（画面・操作性・アクセシビリティ）の共通部品: 全画面の「場面」（scene）の開き方。
 * どの場面も偽のバックエンド（e2e/fakeBackend.ts）だけを使い、本物にはつながない。
 * 場面ごとに PC（700px 以上）とスマホ（700px 未満）で開き方が違うので、`mobile` を受け取る。
 */
import { expect, type Page } from '@playwright/test';
import { acts } from '../../packages/core/src/poker/testHelpers.ts';
import { detailJson, aggregateHex, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { hmw, hs1, hs1bb, hs3 } from '../../packages/core/src/post/postFixtures.ts';
import { DATA, fakeBackend, UID, type Backend } from '../fakeBackend.ts';

export const ID = '00000000-0000-4000-8000-000000000001';

export type Scene = {
  id: string;
  /** PC の投稿・回答・集計は 1 画面に収める（17 章 §3.0） */
  fit?: boolean;
  /** PC だけ／スマホだけの場面 */
  only?: 'pc' | 'sp';
  /** モーダル・メニューなどを開いている場面（重なりの点検は、その面の中だけにする） */
  overlay?: boolean;
  open: (page: Page, mobile: boolean) => Promise<Backend>;
};

export const SIZES = [
  { name: '375x667', w: 375, h: 667 },
  { name: '390x844', w: 390, h: 844 },
  { name: '412x915', w: 412, h: 915 },
  { name: '768x1024', w: 768, h: 1024 },
  { name: '1024x640', w: 1024, h: 640 },
  { name: '1280x800', w: 1280, h: 800 },
  { name: '1366x768', w: 1366, h: 768 },
  { name: '1440x900', w: 1440, h: 900 },
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '2560x1440', w: 2560, h: 1440 },
] as const;
export const isMobileWidth = (w: number): boolean => w < 700;

// ---------------------------------------------------------------------------- 偽の投稿

const AGG = aggregateHex([paintOf({ AA: { call: 20 } }), paintOf({ AA: { call: 10, s1: 10 }, KK: { fold: 20 } })]);
const MY = { paint: paintHexOf({ AA: { call: 20 } }), size: null };

export const unanswered = (raw = hs1bb()): Record<string, unknown> => detailJson(raw, { viewer: 'unanswered', id: ID });
export const answered = (raw = hs1bb()): Record<string, unknown> =>
  detailJson(raw, { viewer: 'answered', id: ID, answerCount: 2, aggregate: AGG, myAnswer: MY });
export const authorAnswered = (): Record<string, unknown> =>
  detailJson(hs1bb(), { viewer: 'author', id: ID, answerCount: 2, aggregate: AGG, myAnswer: { paint: paintHexOf({ QQ: { fold: 5, s1: 15 } }), size: 20 } });
export const zeroAnswers = (): Record<string, unknown> =>
  detailJson(hs1bb(), { viewer: 'answered', id: ID, answerCount: 0, myAnswer: MY });

const longTitle = 'とても長いタイトルの投稿 — BTN の 3bet に対して CO がフロップで c-bet するときのレンジをみんなはどう考えるか（40文字）';

export function listRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    created_at: '2026-09-28T10:00:00.123456+00:00',
    title: 'BTN の 3bet',
    fmt: 'cash',
    hero: 'BTN',
    street: 'turn',
    effective_stack: 100,
    answer_count: 3,
    is_mine: false,
    answered_by_me: false,
    can_delete: false,
    players: 6,
    board: ['Kh', '8d', '3c', '2s'],
    ...over,
  };
}

/** 見本の投稿のタイトル（利用者が書くもの。用語の置き換えの対象外） */
export const USER_TITLES = ['K83r のターン', 'とても長いタイトルの投稿', 'マルチウェイ', 'MTT の見本', '古い下書き', '下書きの試験'];

export const LIST_ROWS = [
  listRow({}),
  listRow({ id: '00000000-0000-4000-8000-000000000002', title: '自分の投稿', is_mine: true, can_delete: true, players: 3, street: 'flop', board: ['Ah', 'Kd', '2c'], hero: 'SB' }),
  listRow({ id: '00000000-0000-4000-8000-000000000003', title: longTitle, answered_by_me: true, street: 'river', board: ['Kh', '8d', '3c', '2s', '9h'], hero: 'UTG', answer_count: 1234 }),
  listRow({ id: '00000000-0000-4000-8000-000000000004', title: '回答済みの自分の投稿', is_mine: true, answered_by_me: true, can_delete: true, hero: 'BB', players: 2, effective_stack: 9999.999, fmt: 'mtt' }),
  listRow({ id: '00000000-0000-4000-8000-000000000005', title: 'HJ', hero: 'HJ', players: 4 }),
  listRow({ id: '00000000-0000-4000-8000-000000000006', title: 'CO の overbet', hero: 'CO', players: 5 }),
];

// ---------------------------------------------------------------------------- 投稿の下書き

const each = <T,>(v: T): Record<string, T> => ({ UTG: v, HJ: v, CO: v, BTN: v, SB: v, BB: v });

/** H-S1 を入れ終えた下書き（Spot 10 を選び、タイトルも入っている） */
export function fullDraft(title = 'K83r のターン 2 バレル'): Record<string, unknown> {
  const raw = hs1();
  return {
    fmt: 'cash',
    sb: '0.5',
    ante: '0',
    rake: '5',
    players: 6,
    stacks: each('100'),
    hero: 'BTN',
    hands: { ...each(''), BTN: 'AdKd', BB: 'KsJs' },
    actions: acts({
      pf: 'UTG f, HJ f, CO f, BTN r2.5, SB f, BB c',
      flop: 'BB x, BTN b1.8, BB c',
      turn: 'BB x, BTN b6.5, BB c',
      river: 'BB x, BTN b15, BB c',
    }),
    board: raw.board as string[],
    spotIndex: raw.spot_index,
    title,
  };
}

export async function seedDrafts(page: Page, drafts: { title: string; draft?: Record<string, unknown> }[]): Promise<void> {
  const saved = drafts.map((d, i) => ({
    id: `d${i}`,
    savedAt: `2026-09-29T0${i}:00:00.000Z`,
    draft: d.draft ?? { ...fullDraft(d.title), title: d.title },
  }));
  await page.addInitScript(([k, v]) => localStorage.setItem(k as string, v as string), [`wwyd.drafts.v1.${UID}`, JSON.stringify(saved)]);
}

// ---------------------------------------------------------------------------- 場面の共通の動き

/** 動きの設定（既定は視差効果を減らす。動きの試験は 'no-preference' にして試す） */
let motion: 'reduce' | 'no-preference' = 'reduce';
export function setMotion(m: 'reduce' | 'no-preference'): void {
  motion = m;
}

async function base(page: Page, detail: Record<string, unknown> | null = null, signedIn = true): Promise<Backend> {
  await page.emulateMedia({ reducedMotion: motion });
  return fakeBackend(page, detail, { signedIn });
}

/** スマホはステップを移る（PC は全部の節が並んでいるので何もしない） */
export async function step(page: Page, name: RegExp): Promise<void> {
  const b = page.getByRole('button', { name });
  if ((await b.count()) > 0) await b.first().click();
}

/** 投稿の画面を開き、描画を待つ（PC は人数の欄、スマホはステップの見出し） */
async function gotoNew(page: Page): Promise<void> {
  await page.goto('/new');
  await page.getByRole('group', { name: '人数' }).or(page.getByRole('navigation', { name: 'ステップ' })).first().waitFor();
}

/** 回答の画面を開き、描画を待つ */
async function gotoAnswer(page: Page): Promise<void> {
  await page.goto(`/s/${ID}/answer`);
  await page.getByRole('heading', { level: 1 }).waitFor();
}

const players = (page: Page, n: string) => page.getByRole('group', { name: '人数' }).getByRole('button', { name: n, exact: true });

/** 6 人で UTG〜CO が Fold、BTN が Open 2.5（手番は SB） */
async function openBtn(page: Page, mobile: boolean): Promise<void> {
  await step(page, /^2\s*Player$/);
  await players(page, '6').click();
  await step(page, /^3\s*Action$/);
  const dock = page.getByRole('group', { name: 'Action' });
  await dock.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  await dock.getByRole('button', { name: /^Open/ }).click();
  await expect(page.getByRole('group', { name: 'Table' }).locator('.pseat.acting')).toContainText('SB');
  void mobile;
}

async function openFullDraft(page: Page, mobile: boolean, stepName?: RegExp): Promise<Backend> {
  const be = await base(page);
  await seedDrafts(page, [{ title: 'K83r のターン 2 バレル' }]);
  await page.goto('/drafts');
  await page.getByRole('link', { name: 'K83r のターン 2 バレル' }).click();
  await expect(page).toHaveURL('/new');
  if (mobile && stepName) await step(page, stepName);
  return be;
}

const cell = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label} `) });

async function paintSome(page: Page, mobile: boolean): Promise<void> {
  if (mobile) await page.getByRole('tab', { name: 'Range' }).click();
  await cell(page, 'AA').click();
  await cell(page, 'KK').click();
  await cell(page, 'QQ').click();
}

// ---------------------------------------------------------------------------- 場面の一覧

export const SCENES: Scene[] = [
  // --- ログイン・全画面の状態
  { id: 'login', open: async (p) => { const be = await base(p, null, false); await p.goto('/'); await p.getByRole('button', { name: 'Google でログイン' }).waitFor(); return be; } },
  { id: 'login-failed', open: async (p) => { const be = await base(p, null, false); await p.goto('/?error=access_denied'); await p.getByRole('alert').waitFor(); return be; } },
  { id: 'state-booting', open: async (p) => { const be = await base(p); await p.goto('/?devstate=booting'); return be; } },
  { id: 'state-maintenance', open: async (p) => { const be = await base(p); await p.goto('/?devstate=maintenance'); await p.getByText('メンテナンス中').waitFor(); return be; } },
  { id: 'state-offline', open: async (p) => { const be = await base(p); await p.goto('/?devstate=offline'); await p.getByText('オフラインです').waitFor(); return be; } },
  { id: 'state-unavailable', open: async (p) => { const be = await base(p); await p.goto('/?devstate=unavailable'); await p.getByText('このアカウントは利用できません').waitFor(); return be; } },
  { id: 'notfound', open: async (p) => { const be = await base(p); await p.goto('/no-such-page'); await p.getByText('ページが見つかりません').waitFor(); return be; } },
  { id: 'notfound-signedout', open: async (p) => { const be = await base(p, null, false); await p.goto('/no-such-page'); await p.getByRole('button', { name: 'Google でログイン' }).waitFor(); return be; } },

  // --- 規約
  { id: 'terms', open: async (p) => { const be = await base(p); await p.goto('/terms'); await p.getByRole('heading', { level: 1 }).waitFor(); return be; } },
  { id: 'privacy', open: async (p) => { const be = await base(p); await p.goto('/privacy'); await p.getByRole('heading', { level: 1 }).waitFor(); return be; } },
  { id: 'terms-signedout', open: async (p) => { const be = await base(p, null, false); await p.goto('/terms'); await p.getByRole('heading', { level: 1 }).waitFor(); return be; } },

  // --- 一覧
  { id: 'list-rows', open: async (p) => { const be = await base(p); be.listRows = LIST_ROWS; await p.goto('/'); await p.locator('.spot-row, .spot-card').first().waitFor(); return be; } },
  { id: 'list-mine', open: async (p) => { const be = await base(p); be.listRows = LIST_ROWS.filter((r) => r.is_mine); await p.goto('/?tab=mine&street=all&sort=many'); await p.locator('.spot-row, .spot-card').first().waitFor(); return be; } },
  { id: 'list-empty', open: async (p) => { const be = await base(p); be.listRows = []; await p.goto('/'); await p.getByText('該当 Spot なし').waitFor(); return be; } },
  { id: 'list-empty-mine', open: async (p) => { const be = await base(p); be.listRows = []; await p.goto('/?tab=mine'); await p.getByText('投稿なし').waitFor(); return be; } },
  {
    id: 'list-error',
    open: async (p) => {
      const be = await base(p);
      await p.route(`${DATA}/rpc/list_posts`, (r) => r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
      await p.goto('/');
      await p.getByText('読み込みに失敗しました').waitFor();
      return be;
    },
  },
  {
    id: 'list-loading',
    open: async (p) => {
      const be = await base(p);
      await p.route(`${DATA}/rpc/list_posts`, async (r) => {
        await new Promise((res) => setTimeout(res, 6000));
        await r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '[]' }).catch(() => undefined);
      });
      await p.goto('/');
      await p.locator('.skeleton').first().waitFor();
      return be;
    },
  },
  {
    id: 'list-delete-confirm',
    overlay: true,
    open: async (p) => {
      const be = await base(p); be.listRows = LIST_ROWS;
      await p.goto('/');
      await p.getByRole('button', { name: '削除' }).first().click();
      await p.getByRole('alertdialog').waitFor();
      return be;
    },
  },
  {
    id: 'list-delete-failed-toast',
    open: async (p) => {
      const be = await base(p); be.listRows = LIST_ROWS;
      await p.route(`${DATA}/posts**`, (r) => (r.request().method() === 'DELETE' ? r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{}' }) : r.fallback()));
      await p.goto('/');
      await p.getByRole('button', { name: '削除' }).first().click();
      await p.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      await p.getByText('削除できませんでした').waitFor();
      return be;
    },
  },

  // --- 投稿
  { id: 'new-empty', fit: true, open: async (p) => { const be = await base(p); await gotoNew(p); await p.getByPlaceholder(/タイトル/).or(p.getByRole('button', { name: /^Card|Player/ })).first().waitFor(); return be; } },
  {
    id: 'new-players6',
    fit: true,
    open: async (p, m) => { const be = await base(p); await gotoNew(p); await step(p, /^2\s*Player$/); await players(p, '6').click(); void m; return be; },
  },
  { id: 'new-action-btn-open', fit: true, open: async (p, m) => { const be = await base(p); await gotoNew(p); await openBtn(p, m); return be; } },
  {
    id: 'new-flop-picker',
    fit: true,
    open: async (p, m) => {
      const be = await base(p); await gotoNew(p); await openBtn(p, m);
      const dock = p.getByRole('group', { name: 'Action' });
      await dock.getByRole('button', { name: 'Fold' }).click();
      await dock.getByRole('button', { name: /^Call/ }).click();
      await p.getByRole('gridcell', { name: 'K♥' }).first().waitFor();
      return be;
    },
  },
  {
    id: 'new-hand-picker',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p); await gotoNew(p); await step(p, /^2\s*Player$/); await players(p, '6').click();
      await p.getByRole('button', { name: 'BTN の Hand' }).click();
      await p.getByRole('dialog', { name: 'BTN の Hand' }).or(p.getByRole('group', { name: 'Card キーボード' })).first().waitFor();
      return be;
    },
  },
  { id: 'new-full-draft', fit: true, open: async (p, m) => openFullDraft(p, m, /^4\s*Spot$/) },
  { id: 'new-full-draft-action-step', fit: true, open: async (p, m) => openFullDraft(p, m, /^3\s*Action$/) },
  {
    id: 'new-submit-errors',
    fit: true,
    open: async (p, m) => {
      const be = await base(p); await gotoNew(p);
      await step(p, /^4\s*Spot$/);
      await p.getByRole('button', { name: '投稿する' }).click();
      await p.getByRole('alert').or(p.locator('.form-err')).first().waitFor();
      void m;
      return be;
    },
  },
  {
    id: 'new-leave-dialog',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p); await gotoNew(p); await step(p, /^2\s*Player$/); await players(p, '6').click();
      await step(p, /^4\s*Spot$/);
      await p.getByPlaceholder(/タイトル/).fill('離れる');
      await p.getByRole('link', { name: /^List$|一覧へ/ }).first().click();
      await p.getByRole('alertdialog', { name: '下書きに保存しますか' }).waitFor();
      return be;
    },
  },
  {
    id: 'new-recount-dialog',
    fit: true,
    overlay: true,
    open: async (p, m) => {
      const be = await base(p); await gotoNew(p); await openBtn(p, m);
      await step(p, /^2\s*Player$/);
      await players(p, '5').click();
      await p.getByRole('alertdialog').waitFor();
      return be;
    },
  },
  {
    id: 'new-ocr-game-dialog',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p); await gotoNew(p);
      await p.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
      await p.getByRole('dialog', { name: 'T4 の Game' }).waitFor();
      return be;
    },
  },
  { id: 'new-history-modal-sp', only: 'sp', fit: true, overlay: true, open: async (p, m) => { const be = await base(p); await gotoNew(p); await openBtn(p, m); await p.getByRole('button', { name: 'History' }).click(); await p.getByRole('dialog', { name: 'Hand History' }).waitFor(); return be; } },


  {
    id: 'new-ocr-review',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p);
      // 文字認識（tesseract）は動かさず、runOcr の入口を差し替えて読み取り結果を返す（画像の解析そのものは A-06・ocr:accuracy の担当）
      await p.route('**/ocr/runOcr.ts*', (r) =>
        r.fulfill({
          contentType: 'text/javascript',
          body: `export class OcrCancelled extends Error {}
export async function runOcr() {
  const act = (street, pos, verb, amount = null) => ({ street, pos, verb, amount });
  return { hero: 'BTN', hands: { BTN: ['Ad', 'Kd'], BB: ['Ks', 'Js'] }, board: ['Qh', '8c', '2h'], problems: [],
    actions: [act('pf','UTG','fold'), act('pf','HJ','fold'), act('pf','CO','fold'), act('pf','BTN','raise',2.5), act('pf','SB','fold'), act('pf','BB','call'), act('flop','BB','check'), act('flop','BTN','bet',1.8), act('flop','BB','fold')] };
}`,
        }),
      );
      await gotoNew(p);
      const png = await p.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 960;
        c.height = 540;
        const x = c.getContext('2d')!;
        x.fillStyle = '#284';
        x.fillRect(0, 0, 960, 540);
        x.fillStyle = '#fff';
        x.font = '40px sans-serif';
        x.fillText('T4 sample image', 40, 80);
        return c.toDataURL('image/png').split(',')[1] as string;
      });
      await p.getByRole('button', { name: 'T4 Hand History 画像を読み込む' }).click();
      await p.getByRole('dialog', { name: 'T4 の Game' }).getByRole('button', { name: /^通常/ }).click();
      await p.getByTestId('ocr-file').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await p.getByRole('dialog', { name: '読み取り結果' }).waitFor();
      return be;
    },
  },

  // --- 下書き
  { id: 'drafts-empty', open: async (p) => { const be = await base(p); await p.goto('/drafts'); await p.getByText('下書きなし').waitFor(); return be; } },
  {
    id: 'drafts-3',
    open: async (p) => {
      const be = await base(p);
      await seedDrafts(p, [{ title: '一つ目の下書き' }, { title: longTitle }, { title: '三つ目', draft: { title: '三つ目', players: 3 } }]);
      await p.goto('/drafts');
      await p.getByText('3 / 3').waitFor();
      return be;
    },
  },
  {
    id: 'drafts-delete-confirm',
    overlay: true,
    open: async (p) => {
      const be = await base(p);
      await seedDrafts(p, [{ title: '消す下書き' }]);
      await p.goto('/drafts');
      await p.getByRole('button', { name: '削除' }).click();
      await p.getByRole('alertdialog').waitFor();
      return be;
    },
  },

  // --- 回答
  { id: 'answer', fit: true, open: async (p) => { const be = await base(p, unanswered()); await gotoAnswer(p); return be; } },
  { id: 'answer-painted', fit: true, open: async (p, m) => { const be = await base(p, unanswered()); await gotoAnswer(p); await paintSome(p, m); return be; } },
  { id: 'answer-range-tab-sp', only: 'sp', fit: true, open: async (p, m) => { const be = await base(p, unanswered()); await gotoAnswer(p); await paintSome(p, m); return be; } },
  { id: 'answer-flop-multiway', fit: true, open: async (p) => { const be = await base(p, unanswered(hmw())); await gotoAnswer(p); return be; } },
  { id: 'answer-mtt', fit: true, open: async (p) => { const be = await base(p, unanswered(hs3())); await gotoAnswer(p); return be; } },
  { id: 'answer-notfound', open: async (p) => { const be = await base(p, null); await p.goto(`/s/${ID}/answer`); await p.getByText('Spot が見つかりません').waitFor(); return be; } },
  {
    id: 'answer-load-error',
    open: async (p) => {
      const be = await base(p, unanswered());
      await p.route(`${DATA}/rpc/get_post_detail`, (r) => r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
      await p.goto(`/s/${ID}/answer`);
      await p.getByText('読み込みに失敗しました').waitFor();
      return be;
    },
  },

  // --- 集計
  { id: 'result-all', fit: true, open: async (p) => { const be = await base(p, answered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: /^全体/ }).waitFor(); return be; } },
  { id: 'result-mine', fit: true, open: async (p) => { const be = await base(p, answered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: '自分', exact: true }).click(); return be; } },
  { id: 'result-diff', fit: true, open: async (p) => { const be = await base(p, answered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: '自分との差' }).click(); return be; } },
  { id: 'result-author', fit: true, open: async (p) => { const be = await base(p, authorAnswered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: /^全体/ }).waitFor(); return be; } },
  { id: 'result-zero', fit: true, open: async (p) => { const be = await base(p, zeroAnswers()); await p.goto(`/s/${ID}/result`); await p.getByText('回答なし').waitFor(); return be; } },
  { id: 'result-cell-selected', fit: true, open: async (p) => { const be = await base(p, answered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: /^全体/ }).waitFor(); await p.getByRole('button', { name: 'AA', exact: true }).click(); return be; } },
  {
    id: 'result-delete-confirm',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p, authorAnswered());
      await p.goto(`/s/${ID}/result`);
      await p.getByRole('tab', { name: /^全体/ }).waitFor();
      await p.getByRole('button', { name: /削除/ }).first().click();
      await p.getByRole('alertdialog').waitFor();
      return be;
    },
  },
  { id: 'result-sp-history-tab', only: 'sp', fit: true, open: async (p) => { const be = await base(p, answered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: /^全体/ }).waitFor(); await p.getByRole('tab', { name: /Hand History/ }).click(); return be; } },


  // --- エラー・確認・トースト（文言を集めるための場面）
  {
    id: 'answer-submit-empty',
    fit: true,
    open: async (p, m) => {
      const be = await base(p, unanswered()); await gotoAnswer(p);
      if (m) await p.getByRole('tab', { name: 'Range' }).click();
      await p.getByRole('button', { name: '回答する' }).click();
      await p.locator('.pf-errors').first().waitFor();
      return be;
    },
  },
  {
    id: 'answer-confirm',
    fit: true,
    overlay: true,
    open: async (p, m) => {
      const be = await base(p, unanswered()); await gotoAnswer(p); await paintSome(p, m);
      await p.getByRole('button', { name: '回答する' }).click();
      await p.getByRole('alertdialog', { name: '回答を送信しますか' }).waitFor();
      return be;
    },
  },
  {
    id: 'answer-duplicate',
    fit: true,
    open: async (p, m) => {
      const be = await base(p, unanswered()); await gotoAnswer(p); await paintSome(p, m);
      be.insertError = { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "answers_pkey"', details: null, hint: null } };
      await p.getByRole('button', { name: '回答する' }).click();
      await p.getByRole('alertdialog').getByRole('button', { name: '送信する' }).click();
      await p.waitForTimeout(600);
      return be;
    },
  },
  {
    id: 'answer-server-error',
    fit: true,
    open: async (p, m) => {
      const be = await base(p, unanswered()); await gotoAnswer(p); await paintSome(p, m);
      be.insertError = { status: 500, body: { code: 'XX000', message: 'boom', details: null, hint: null } };
      await p.getByRole('button', { name: '回答する' }).click();
      await p.getByRole('alertdialog').getByRole('button', { name: '送信する' }).click();
      await p.waitForTimeout(600);
      return be;
    },
  },
  {
    id: 'new-server-error',
    fit: true,
    open: async (p, m) => {
      const be = await openFullDraft(p, m, /^4\s*Spot$/);
      await p.route('http://fn.e2e.test/**', (r) =>
        r.request().method() === 'OPTIONS'
          ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
          : r.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ error: 'daily_limit' }) }),
      );
      await p.getByRole('button', { name: '投稿する' }).click();
      await p.locator('.pf-errors').first().waitFor();
      return be;
    },
  },
  {
    id: 'new-preflop-allin-toast',
    fit: true,
    open: async (p, m) => {
      const be = await base(p); await gotoNew(p); await step(p, /^2\s*Player$/); await players(p, '6').click(); await step(p, /^3\s*Action$/);
      const dock = p.getByRole('group', { name: 'Action' });
      await dock.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
      if (m) {
        await dock.getByRole('button', { name: 'Raise の額（to。bb）' }).click();
        await p.getByRole('slider', { name: 'Raise の額（to。bb）' }).focus();
        await p.keyboard.press('End');
        await p.keyboard.press('Escape');
      } else {
        await dock.getByRole('textbox', { name: 'Raise の額（to。bb）' }).fill('100');
      }
      await dock.getByRole('button', { name: /^Open\s*100/ }).click();
      await p.locator('.toast').first().waitFor();
      return be;
    },
  },
  {
    id: 'new-draft-full-dialog',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p);
      await seedDrafts(p, [{ title: '古い一' }, { title: '古い二' }, { title: '古い三' }]);
      await gotoNew(p); await step(p, /^2\s*Player$/); await players(p, '6').click(); await step(p, /^4\s*Spot$/);
      await p.getByPlaceholder(/タイトル/).fill('新しい下書き');
      await p.getByRole('link', { name: /^List$|一覧へ/ }).first().click();
      await p.getByRole('alertdialog', { name: '下書きに保存しますか' }).getByRole('button', { name: '保存する' }).click();
      await p.getByRole('alertdialog', { name: '下書きがいっぱいです' }).waitFor();
      return be;
    },
  },
  {
    id: 'new-draft-full-confirm',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p);
      await seedDrafts(p, [{ title: '古い一' }, { title: '古い二' }, { title: '古い三' }]);
      await gotoNew(p); await step(p, /^2\s*Player$/); await players(p, '6').click(); await step(p, /^4\s*Spot$/);
      await p.getByPlaceholder(/タイトル/).fill('新しい下書き');
      await p.getByRole('link', { name: /^List$|一覧へ/ }).first().click();
      await p.getByRole('alertdialog', { name: '下書きに保存しますか' }).getByRole('button', { name: '保存する' }).click();
      const full = p.getByRole('alertdialog', { name: '下書きがいっぱいです' });
      await full.getByRole('listitem').first().getByRole('button', { name: '削除' }).click();
      await p.getByRole('alertdialog').filter({ hasText: '削除して' }).waitFor();
      return be;
    },
  },
  {
    id: 'new-clear-confirm',
    fit: true,
    overlay: true,
    open: async (p, m) => {
      const be = await base(p); await gotoNew(p); await openBtn(p, m);
      await p.getByRole('group', { name: 'Action' }).getByRole('button', { name: 'すべて消す' }).click();
      await p.getByRole('alertdialog').waitFor();
      return be;
    },
  },
  {
    id: 'new-ocr-busy',
    fit: true,
    overlay: true,
    open: async (p) => {
      const be = await base(p);
      await p.context().route('**/ocr/lang/**', async (r) => {
        await new Promise((res) => setTimeout(res, 5000));
        await r.continue().catch(() => undefined);
      });
      await gotoNew(p);
      await p.getByTestId('ocr-file').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
      await p.getByRole('dialog', { name: '読み取り中…' }).waitFor();
      return be;
    },
  },
  {
    id: 'account-delete-failed-toast',
    open: async (p) => {
      const be = await base(p);
      be.deleteAccountError = { status: 500, body: { code: 'XX000', message: 'boom', details: null, hint: null } };
      await p.goto('/');
      await p.getByRole('button', { name: 'アカウント' }).click();
      await p.getByRole('menuitem', { name: 'アカウントを削除' }).click();
      await p.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      await p.getByText('削除できませんでした').waitFor();
      return be;
    },
  },

  // --- アカウント・ⓘ
  {
    id: 'account-menu',
    overlay: true,
    open: async (p) => { const be = await base(p); be.listRows = LIST_ROWS; await p.goto('/'); await p.getByRole('button', { name: 'アカウント' }).click(); await p.getByRole('menu').waitFor(); return be; },
  },
  {
    id: 'account-delete-confirm',
    overlay: true,
    open: async (p) => {
      const be = await base(p); await p.goto('/');
      await p.getByRole('button', { name: 'アカウント' }).click();
      await p.getByRole('menuitem', { name: 'アカウントを削除' }).click();
      await p.getByRole('alertdialog').waitFor();
      return be;
    },
  },
  ...(
    [
      ['info-login', '/', false],
      ['info-list', '/', true],
      ['info-new', '/new', true],
      ['info-drafts', '/drafts', true],
      ['info-terms', '/terms', true],
    ] as const
  ).map(
    ([id, path, signedIn]): Scene => ({
      id,
      overlay: true,
      fit: id === 'info-new',
      open: async (p) => {
        const be = await base(p, null, signedIn);
        be.listRows = LIST_ROWS;
        await p.goto(path);
        await p.getByRole('button', { name: 'インフォメーション' }).click();
        await p.getByRole('dialog').waitFor();
        return be;
      },
    }),
  ),
  { id: 'info-answer', fit: true, overlay: true, open: async (p) => { const be = await base(p, unanswered()); await gotoAnswer(p); await p.getByRole('button', { name: 'インフォメーション' }).click(); await p.getByRole('dialog').waitFor(); return be; } },
  { id: 'info-result', fit: true, overlay: true, open: async (p) => { const be = await base(p, answered()); await p.goto(`/s/${ID}/result`); await p.getByRole('tab', { name: /^全体/ }).waitFor(); await p.getByRole('button', { name: 'インフォメーション' }).click(); await p.getByRole('dialog').waitFor(); return be; } },
  { id: 'info-account', overlay: true, open: async (p) => { const be = await base(p); await p.goto('/'); await p.getByRole('button', { name: 'アカウント' }).click(); await p.getByRole('button', { name: 'インフォメーション' }).click(); await p.getByRole('dialog').waitFor(); return be; } },
  { id: 'info-maintenance', overlay: true, open: async (p) => { const be = await base(p); await p.goto('/?devstate=maintenance'); await p.getByRole('button', { name: 'インフォメーション' }).click(); await p.getByRole('dialog').waitFor(); return be; } },
];

export const sceneById = (id: string): Scene => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`場面が無い: ${id}`);
  return s;
};

/** 場面がその画面幅で意味を持つか */
export const appliesTo = (s: Scene, mobile: boolean): boolean => !s.only || (s.only === 'sp') === mobile;

/**
 * T-A（探索）: 利用者の流れを最初から最後まで通す。一覧 → 未回答を開く → 回答 → 集計 → 次の Spot → 回答（前の塗りが持ち越されない）→ 一覧に戻ると「回答済み」。
 * 投稿 → 自分の投稿の一覧 → 自分で回答 → 集計 → 削除。ブラウザの戻る・進む・再読み込みでの復帰。
 * バックエンドは偽物（状態を持つ簡易版: 回答すると、その投稿は answered になり、list_posts に反映される）。
 */
import { expect, test, type Page } from '@playwright/test';
import { aggregateHex, detailJson, paintHexOf, paintOf } from '../../packages/app/src/answer/detailFixtures.ts';
import { hs1, hs1bb } from '../../packages/core/src/post/postFixtures.ts';
import { fakeBackend } from '../fakeBackend.ts';
import { DATA, fulfillJson, row, watchErrors } from './taKit.ts';

const A = row(1, { title: '投稿 A（未回答）', answer_count: 4 });
const B = row(2, { title: '投稿 B（未回答）', answer_count: 0 });
const idOf = (r: Record<string, unknown>): string => r['id'] as string;

/** 状態を持つ偽のバックエンド: 回答された投稿は answered、answer_count が増える */
async function stateful(page: Page): Promise<{ answered: Set<string>; rows: Record<string, unknown>[]; inserts: Record<string, unknown>[] }> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const be = await fakeBackend(page, null);
  const answered = new Set<string>();
  const rows = [{ ...A }, { ...B }];
  const raw = { [idOf(A)]: hs1bb(), [idOf(B)]: hs1() };
  const view = (id: string): Record<string, unknown> =>
    answered.has(id)
      ? detailJson(raw[id]!, { viewer: 'answered', id, answerCount: 5, aggregate: aggregateHex([paintOf({ AA: { call: 20 } })]), myAnswer: { paint: paintHexOf({ AA: { call: 20 } }), size: null } })
      : detailJson(raw[id]!, { viewer: 'unanswered', id });
  await page.route(`${DATA}/rpc/get_post_detail`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const id = (route.request().postDataJSON() as { p_post_id: string }).p_post_id;
    if (!raw[id]) return fulfillJson(route, 400, { code: 'P0001', message: 'post_not_found' });
    return fulfillJson(route, 200, view(id));
  });
  await page.route(`${DATA}/answers`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const b = route.request().postDataJSON() as { post_id: string };
    be.inserts.push(b as unknown as Record<string, unknown>);
    answered.add(b.post_id);
    const r = rows.find((x) => x['id'] === b.post_id);
    if (r) {
      r['answered_by_me'] = true;
      r['answer_count'] = Number(r['answer_count']) + 1;
    }
    return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  await page.route(`${DATA}/rpc/list_posts`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    return fulfillJson(route, 200, rows);
  });
  return { answered, rows, inserts: be.inserts };
}

for (const v of ['', ' @sp'] as const) {
  test(`一覧 → 回答 → 集計 → 次の Spot → 回答（塗り・Size・リプレイ位置は持ち越さない）→ 一覧は「回答済み」${v}`, async ({ page }) => {
    const errors = watchErrors(page);
    const st = await stateful(page);
    await page.goto('/');
    const sp = (page.viewportSize()?.width ?? 1280) < 700;
    // 1. A を開く（未回答 → 回答画面）
    await page.getByRole('link', { name: '投稿 A（未回答）' }).click();
    await expect(page).toHaveURL(`/s/${idOf(A)}/answer`);
    if (sp) await page.getByRole('tab', { name: 'Range' }).click();
    await page.getByRole('button', { name: /^AA / }).click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(`/s/${idOf(A)}/result`);
    expect(st.inserts).toHaveLength(1);
    // 2. 集計 → 次の Spot（B）へ
    await expect(page.getByRole('link', { name: '次の Spot' })).toHaveAttribute('href', `/s/${idOf(B)}`);
    await page.getByRole('link', { name: '次の Spot' }).click();
    await expect(page).toHaveURL(`/s/${idOf(B)}/answer`);
    // 3. B の回答画面は白紙（前の塗りを持ち越さない）
    if (sp) await page.getByRole('tab', { name: 'Range' }).click();
    await expect(page.locator('.rcell.on')).toHaveCount(0);
    if (sp) await page.getByRole('tab', { name: 'Replay' }).click(); // 背の低い端末は Range のタブにタイトルを出さない
    await expect(page.getByRole('heading', { name: 'K83r のターン 2 バレル' })).toBeVisible();
    if (sp) await page.getByRole('tab', { name: 'Range' }).click();
    await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
    // 4. 途中で一覧へ戻る（塗っていれば離脱確認はブラウザだけ。アプリ内の移動は妨げない）
    await page.goBack();
    await page.goBack();
    await page.goBack().catch(() => undefined);
    await page.goto('/');
    const rowA = sp ? page.locator('.spot-card').filter({ hasText: '投稿 A' }) : page.locator('.spot-row').filter({ hasText: '投稿 A' });
    await expect(rowA).toContainText('回答済み');
    await expect(rowA).toContainText(sp ? '5 人が回答' : '5');
    await rowA.getByRole('link', { name: '投稿 A（未回答）' }).click();
    await expect(page).toHaveURL(`/s/${idOf(A)}/result`); // 回答済みは集計へ
    expect(errors).toEqual([]);
  });

  test(`直接 URL: 回答済みの /answer は集計へ。存在しない ID は「Spot が見つかりません」。再読み込みしても同じ${v}`, async ({ page }) => {
    const st = await stateful(page);
    st.answered.add(idOf(A));
    await page.goto(`/s/${idOf(A)}/answer`);
    await expect(page).toHaveURL(`/s/${idOf(A)}/result`);
    await page.reload();
    await expect(page).toHaveURL(`/s/${idOf(A)}/result`);
    await page.goto('/s/does-not-exist/result');
    await expect(page.getByText('Spot が見つかりません')).toBeVisible();
    await page.getByRole('link', { name: '一覧へ' }).last().click();
    await expect(page).toHaveURL('/');
  });

  test(`回答画面から戻る（ブラウザ）→ 進む で、塗りは残らず白紙から。集計から戻る → 進むでも集計${v}`, async ({ page }) => {
    await stateful(page);
    await page.goto('/');
    await page.getByRole('link', { name: '投稿 B（未回答）' }).click();
    const sp = (page.viewportSize()?.width ?? 1280) < 700;
    if (sp) await page.getByRole('tab', { name: 'Range' }).click();
    await page.getByRole('button', { name: /^AA / }).click();
    await page.goBack();
    await expect(page).toHaveURL('/');
    await page.goForward();
    await expect(page).toHaveURL(`/s/${idOf(B)}/answer`);
    if (sp) await page.getByRole('tab', { name: 'Range' }).click();
    await expect(page.locator('.rcell.on')).toHaveCount(0);
  });
}

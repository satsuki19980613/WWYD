/**
 * T-A A-02: 一覧（06 章 §2・17 章 §3.2）。すべて / 自分の投稿、Street の絞り込み、並び替え（新着・回答数・見出しを押す）、
 * ↑↓ j k Enter、行を押す、削除（確認・やめる）、追加読み込み、空・エラー、経過時間。PC は表、スマホ（@sp）はカード。
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBackend, fakeList, fulfillJson, DATA, row, watchErrors } from './taKit.ts';

const SP = ' @sp';

/** 今から ms 前の created_at（サーバーと同じマイクロ秒つき） */
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString().replace('Z', '000+00:00');
}
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const rows = (): Record<string, unknown>[] => [
  row(1, { title: '未回答の他人の投稿', street: 'flop', board: ['Ah', 'Kd', '2c'], answer_count: 5, created_at: ago(30_000) }),
  row(2, { title: '回答済みの投稿', answered_by_me: true, answer_count: 9, created_at: ago(5 * MIN) }),
  row(3, { title: '自分の投稿 A', is_mine: true, can_delete: true, players: 3, street: 'flop', board: ['Ah', 'Kd', '2c'], answer_count: 0, created_at: ago(3 * HOUR) }),
  row(4, { title: '自分の投稿 B', is_mine: true, answered_by_me: true, can_delete: true, street: 'river', board: ['Ah', 'Kd', '2c', '7s', '9h'], answer_count: 12, created_at: ago(DAY + HOUR) }),
  row(5, { title: '管理者だけ消せる他人の投稿', can_delete: true, hero: 'BB', players: 2, street: 'turn', answer_count: 1, created_at: ago(5 * DAY) }),
];

const ID = (n: number): string => `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;

async function openList(page: Page, list = rows(), path = '/'): Promise<ReturnType<typeof fakeList> extends Promise<infer R> ? R : never> {
  const be = await fakeBackend(page, null);
  void be;
  const l = await fakeList(page, list);
  await page.goto(path);
  return l;
}

test.describe('A-02 一覧 PC', () => {
  test('行の内容・主操作・状態タグ・経過時間・削除の列（06 章 §2.2、17 章 §3.2）', async ({ page }) => {
    const errors = watchErrors(page);
    await openList(page);
    const r = page.locator('.spot-row');
    await expect(r).toHaveCount(5);
    // 新着順（created_at の新しい順）
    await expect(r.locator('.spot-link')).toHaveText(['未回答の他人の投稿', '回答済みの投稿', '自分の投稿 A', '自分の投稿 B', '管理者だけ消せる他人の投稿']);
    // 経過時間: 1 分未満・n分前・n時間前・昨日・n日前
    await expect(r.locator('.st-ago')).toHaveText(['たった今', '5分前', '3時間前', '昨日', '5日前']);
    // 主操作の文言と遷移先
    await expect(r.nth(0).locator('.spot-go')).toHaveText('回答する');
    await expect(r.nth(1).locator('.spot-go')).toHaveText('結果を見る');
    await expect(r.nth(2).locator('.spot-go')).toHaveText('回答する');
    await expect(r.nth(3).locator('.spot-go')).toHaveText('回答を見る');
    await expect(r.nth(0).locator('.spot-link')).toHaveAttribute('href', `/s/${ID(1)}/answer`);
    await expect(r.nth(1).locator('.spot-link')).toHaveAttribute('href', `/s/${ID(2)}/result`);
    await expect(r.nth(2).locator('.spot-link')).toHaveAttribute('href', `/s/${ID(3)}/answer`);
    await expect(r.nth(3).locator('.spot-link')).toHaveAttribute('href', `/s/${ID(4)}/result`);
    // 状態タグ（自分の投稿が優先。回答済みの自分の投稿は「自分の投稿」）
    await expect(r.nth(1)).toContainText('回答済み');
    await expect(r.nth(2)).toContainText('自分の投稿');
    await expect(r.nth(3)).toContainText('自分の投稿');
    await expect(r.nth(3)).not.toContainText('回答済み');
    // メタと人数
    await expect(r.nth(0)).toContainText('Cash · 100bb · 6 Players');
    await expect(r.nth(2)).toContainText('3 Players');
    await expect(r.nth(4)).toContainText('2 Players');
    // Board
    await expect(r.nth(3).locator('.pcard')).toHaveCount(5);
    await expect(r.nth(3).getByLabel('Board A♥ K♦ 2♣ 7♠ 9♥')).toBeVisible();
    await expect(r.nth(0).locator('.street-badge')).toHaveText('Flop');
    await expect(r.nth(3).locator('.street-badge')).toHaveText('River');
    // 回答数
    await expect(r.locator('.st-count')).toHaveText(['5', '9', '0', '12', '1']);
    // 削除は can_delete の行だけ。ほかの列の位置は同じ
    await expect(r.getByRole('button', { name: '削除' })).toHaveCount(3);
    const xs = await r.evaluateAll((els) => els.map((e) => Math.round((e.querySelector('.st-ago') as HTMLElement).getBoundingClientRect().right)));
    expect(new Set(xs).size).toBe(1);
    expect(errors).toEqual([]);
  });

  test('行のどこを押しても開く（Board・余白・回答する）。削除のボタンは開かず確認になる', async ({ page }) => {
    await openList(page);
    const r = page.locator('.spot-row');
    // リンクを行いっぱいに広げているので、各部品の中心の座標を押す
    for (const sel of ['.spot-board', '.st-count', '.spot-go', '.st-pos']) {
      const bb = (await r.nth(0).locator(sel).boundingBox())!;
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await expect(page, sel).toHaveURL(`/s/${ID(1)}/answer`);
      await page.goBack();
      await expect(r).toHaveCount(5);
    }
    // 行の左端・右端も
    const b = (await r.nth(1).boundingBox())!;
    await page.mouse.click(b.x + 4, b.y + b.height / 2);
    await expect(page).toHaveURL(`/s/${ID(2)}/result`);
    await page.goBack();
    await r.nth(2).getByRole('button', { name: '削除' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('alertdialog')).toContainText('この投稿を削除しますか');
  });

  test('絞り込み: 範囲・Street・並び替えが URL とサーバーの引数になる。再読み込みしても保つ', async ({ page }) => {
    const l = await openList(page);
    const rail = page.getByRole('complementary', { name: '絞り込み' });
    await rail.getByRole('group', { name: '範囲' }).getByRole('button', { name: '自分の投稿' }).click();
    await expect(page).toHaveURL('/?tab=mine');
    await expect(page.locator('.spot-row')).toHaveCount(2);
    await rail.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'River' }).click();
    await expect(page).toHaveURL('/?tab=mine&street=river');
    await expect(page.locator('.spot-row')).toHaveCount(1);
    await rail.getByRole('group', { name: '並び替え' }).getByRole('button', { name: '回答が多い順' }).click();
    await expect(page).toHaveURL('/?tab=mine&street=river&sort=many');
    const last = l.calls.at(-1)!;
    expect(last).toMatchObject({ tab: 'mine', street: 'river', sort: 'many', after: null, limit: 20 });
    await page.reload();
    await expect(page.locator('.spot-row')).toHaveCount(1);
    await expect(rail.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'River' })).toHaveAttribute('aria-pressed', 'true');
    // すべてに戻すとクエリから消える
    await rail.getByRole('group', { name: '範囲' }).getByRole('button', { name: 'すべて' }).click();
    await rail.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'すべて' }).click();
    await rail.getByRole('group', { name: '並び替え' }).getByRole('button', { name: '新着順' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('.spot-row')).toHaveCount(5);
  });

  test('Preflop の絞り込みは無い。?street=pf や未知の値は「すべて」', async ({ page }) => {
    const l = await openList(page, rows(), '/?street=pf&sort=zzz&tab=x');
    await expect(page.locator('.spot-row')).toHaveCount(5);
    const st = page.getByRole('group', { name: 'Street' });
    await expect(st.getByRole('button')).toHaveText(['すべて', 'Flop', 'Turn', 'River']);
    await expect(st.getByRole('button', { name: 'すべて' })).toHaveAttribute('aria-pressed', 'true');
    expect(l.calls[0]).toMatchObject({ tab: 'all', street: null, sort: 'new' });
  });

  test('見出しの「回答」「投稿」を押すと並び替わる（左の列と連動）', async ({ page }) => {
    await openList(page);
    const head = page.locator('.st-head');
    await head.getByRole('button', { name: '回答' }).click();
    await expect(page).toHaveURL('/?sort=many');
    await expect(page.locator('.st-count')).toHaveText(['12', '9', '5', '1', '0']);
    await expect(page.getByRole('group', { name: '並び替え' }).getByRole('button', { name: '回答が多い順' })).toHaveAttribute('aria-pressed', 'true');
    await head.getByRole('button', { name: '投稿' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('.st-count')).toHaveText(['5', '9', '0', '12', '1']);
  });

  test('キー: ↓ j で次の行、↑ k で前の行、Enter で開く。端で止まる', async ({ page }) => {
    await openList(page);
    const links = page.locator('.spot-link');
    await links.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press('j');
    await expect(links.nth(2)).toBeFocused();
    await page.keyboard.press('k');
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(links.nth(0)).toBeFocused();
    for (let i = 0; i < 8; i++) await page.keyboard.press('j');
    await expect(links.nth(4)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/s/${ID(5)}/answer`);
  });

  test('キー: 何も選んでいないとき最初の j は 1 行目', async ({ page }) => {
    await openList(page);
    await page.locator('.st-body').focus();
    await page.locator('.spot-link').nth(2).focus();
    await page.keyboard.press('Tab');
    // 行内の削除ボタンへ。ここで j を押しても落ちない
    await page.keyboard.press('j');
    await expect(page.locator('.spot-row')).toHaveCount(5);
  });

  test('削除: やめる・Esc は何もしない。削除する → 行が消える。失敗はトースト', async ({ page }) => {
    const errors = watchErrors(page);
    const be = await fakeBackend(page, null);
    await fakeList(page, rows());
    await page.goto('/');
    const del = page.locator('.spot-row').nth(2).getByRole('button', { name: '削除' });
    await del.click();
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toContainText('この投稿を削除しますか');
    await expect(dlg).toContainText('集まった回答もすべて削除されます。元には戻せません。');
    await expect(dlg.getByRole('button', { name: 'やめる' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await del.click();
    await dlg.getByRole('button', { name: 'やめる' }).click();
    expect(be.deletes).toEqual([]);
    await expect(page.locator('.spot-row')).toHaveCount(5);
    // 削除する
    await del.click();
    await dlg.getByRole('button', { name: '削除する' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('.spot-row')).toHaveCount(4);
    expect(be.deletes).toEqual([ID(3)]);
    await expect(page.locator('.spot-link').filter({ hasText: '自分の投稿 A' })).toHaveCount(0);
    // RLS で 0 件になった（他人の投稿など）→ 消さずにトースト
    await page.route(`${DATA}/posts*`, (route) => {
      if (route.request().method() === 'DELETE') return fulfillJson(route, 200, []);
      return route.fallback();
    });
    await page.locator('.spot-row').nth(2).getByRole('button', { name: '削除' }).click();
    await dlg.getByRole('button', { name: '削除する' }).click();
    await expect(page.locator('.toast')).toHaveText('削除できませんでした');
    await expect(page.locator('.spot-row')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('削除の通信中は二重に押せない（やめる・削除するが非活性）', async ({ page }) => {
    const be = await fakeBackend(page, null);
    await fakeList(page, rows());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`${DATA}/posts*`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      await gate;
      const id = (new URL(route.request().url()).searchParams.get('id') ?? '').replace(/^eq\./, '');
      be.deletes.push(id);
      return fulfillJson(route, 200, [{ id }]);
    });
    await page.goto('/');
    await page.locator('.spot-row').nth(2).getByRole('button', { name: '削除' }).click();
    const dlg = page.getByRole('alertdialog');
    await dlg.getByRole('button', { name: '削除する' }).click();
    await expect(dlg.getByRole('button', { name: '削除中…' })).toBeDisabled();
    await expect(dlg.getByRole('button', { name: 'やめる' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeVisible();
    release();
    await expect(dlg).toHaveCount(0);
    expect(be.deletes).toHaveLength(1);
  });

  test('空: 自分の投稿・すべて →「投稿なし」＋ Post。それ以外 →「該当 Spot なし」', async ({ page }) => {
    await openList(page, [row(1)], '/?tab=mine');
    await expect(page.getByText('投稿なし')).toBeVisible();
    await expect(page.locator('.list-empty').getByRole('link', { name: 'Post' })).toHaveAttribute('href', '/new');
    await page.goto('/?tab=mine&street=flop');
    await expect(page.getByText('該当 Spot なし')).toBeVisible();
    await expect(page.locator('.list-empty').getByRole('link', { name: 'Post' })).toHaveCount(0);
    await page.goto('/?street=river');
    await expect(page.getByText('該当 Spot なし')).toBeVisible();
    // 何もなければ表の見出しも出さない
    await page.goto('/?tab=mine');
    await expect(page.locator('.spot-table')).toHaveCount(0);
  });

  test('読み込み失敗 →「読み込みに失敗しました」＋再試行で回復', async ({ page }) => {
    await fakeBackend(page, null);
    let fail = true;
    await page.route(`${DATA}/rpc/list_posts`, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      return fail ? fulfillJson(route, 500, { code: 'XX000', message: 'boom' }) : fulfillJson(route, 200, rows());
    });
    await page.goto('/');
    await expect(page.getByRole('alert').filter({ hasText: '読み込みに失敗しました' })).toBeVisible();
    await expect(page.locator('.spot-row')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: '再試行' }).click();
    await expect(page.locator('.spot-row')).toHaveCount(5);
    await expect(page.getByText('読み込みに失敗しました')).toHaveCount(0);
  });

  test('追加読み込み: 20 件ずつ。最後まで行くと止まる。重複しない', async ({ page }) => {
    const many = Array.from({ length: 45 }, (_, i) => row(i + 1, { answer_count: 45 - i }));
    const l = await openList(page, many);
    await expect(page.locator('.spot-row')).toHaveCount(20);
    await page.locator('.spot-row').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.spot-row')).toHaveCount(40);
    await page.locator('.spot-row').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.spot-row')).toHaveCount(45);
    await page.waitForTimeout(400);
    // 最初の読み込みは開発サーバーの StrictMode で 2 回走ることがある。続きの読み込み（after あり）は 2 回
    const next = l.calls.filter((c) => c.after);
    expect(next).toHaveLength(2);
    expect(next[0]?.after).toMatchObject({ id: ID(20) });
    expect(next[1]?.after).toMatchObject({ id: ID(40) });
    const ids = await page.locator('.spot-link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(new Set(ids).size).toBe(45);
  });

  test('追加読み込みが失敗 → 続きの再試行ボタン。押すと続きが読める', async ({ page }) => {
    await fakeBackend(page, null);
    const many = Array.from({ length: 30 }, (_, i) => row(i + 1));
    let failed = false;
    await page.route(`${DATA}/rpc/list_posts`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      const a = route.request().postDataJSON() as { p_after: { id: string } | null };
      if (a.p_after && !failed) {
        failed = true;
        return fulfillJson(route, 500, { message: 'boom' });
      }
      const start = a.p_after ? many.findIndex((r) => r['id'] === a.p_after?.id) + 1 : 0;
      return fulfillJson(route, 200, many.slice(start, start + 20));
    });
    await page.goto('/');
    await expect(page.locator('.spot-row')).toHaveCount(20);
    await page.locator('.spot-row').last().scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '再試行' })).toBeVisible();
    await expect(page.locator('.spot-row')).toHaveCount(20);
    await page.getByRole('button', { name: '再試行' }).click();
    await expect(page.locator('.spot-row')).toHaveCount(30);
  });

  test('タブを素早く切り替えても、古い応答で上書きされない', async ({ page }) => {
    await fakeBackend(page, null);
    const all = [row(1, { title: 'すべての方' }), row(2, { title: 'すべての方 2', is_mine: false })];
    const mine = [row(3, { title: '自分の方', is_mine: true, can_delete: true })];
    await page.route(`${DATA}/rpc/list_posts`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      const a = route.request().postDataJSON() as { p_tab: string };
      if (a.p_tab === 'all') await new Promise((r) => setTimeout(r, 1200));
      return fulfillJson(route, 200, a.p_tab === 'mine' ? mine : all);
    });
    await page.goto('/?tab=mine');
    await page.getByRole('group', { name: '範囲' }).getByRole('button', { name: 'すべて' }).click();
    await page.getByRole('group', { name: '範囲' }).getByRole('button', { name: '自分の投稿' }).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('.spot-link')).toHaveText(['自分の方']);
  });

  test('長いタイトル・人数と Board が無い古い応答でも崩れない（横にはみ出さない）', async ({ page }) => {
    const errors = watchErrors(page);
    const long = 'あ'.repeat(120) + ' ' + 'Q'.repeat(80);
    await openList(page, [row(1, { title: long }), row(2, { players: undefined, board: undefined, title: '古い応答' }), row(3, { board: [], title: '空の Board' })]);
    await expect(page.locator('.spot-row')).toHaveCount(3);
    await expect(page.locator('.spot-row').nth(1)).toContainText('Cash · 100bb');
    await expect(page.locator('.spot-row').nth(1)).not.toContainText('Players');
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(over).toBe(false);
    expect(errors).toEqual([]);
  });

  test('MTT・小数のスタックの表記、Hero の色付き席名', async ({ page }) => {
    await openList(page, [row(1, { fmt: 'mtt', effective_stack: 22.5, hero: 'SB' }), row(2, { fmt: 'cash', effective_stack: 99.999 })]);
    await expect(page.locator('.spot-row').nth(0)).toContainText('MTT · 22.5bb');
    await expect(page.locator('.spot-row').nth(0).locator('.st-pos')).toHaveText('SB');
    await expect(page.locator('.spot-row').nth(1)).toContainText('Cash · 99.999bb');
  });

  test('ヘッダー: List・＋ Post のナビ。＋ Post で投稿へ。一覧に「＋ Post」の別ボタンは無い', async ({ page }) => {
    await openList(page);
    const nav = page.getByRole('navigation', { name: 'メニュー' });
    // 不具合の再現（Link が aria-current を捨てるため、いまいる項目の印が付かない）
    await expect(nav.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main').getByRole('link', { name: /Post/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'List' })).toBeAttached();
    await nav.getByRole('link', { name: '＋ Post' }).click();
    await expect(page).toHaveURL('/new');
    await expect(nav.getByRole('link', { name: '＋ Post' })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('A-02 一覧 スマホ', () => {
  test(`カード: 主操作・タグ・削除・経過時間${SP}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openList(page);
    const c = page.locator('.spot-card');
    await expect(c).toHaveCount(5);
    await expect(c.locator('.spot-link')).toHaveText(['未回答の他人の投稿', '回答済みの投稿', '自分の投稿 A', '自分の投稿 B', '管理者だけ消せる他人の投稿']);
    await expect(c.nth(0).locator('.spot-go')).toHaveText('回答する');
    await expect(c.nth(1).locator('.spot-go')).toHaveText('結果を見る');
    await expect(c.nth(3).locator('.spot-go')).toHaveText('回答を見る');
    await expect(c.nth(0)).toContainText('5 人が回答 · たった今');
    await expect(c.nth(1)).toContainText('9 人が回答 · 5分前');
    await expect(c.nth(2)).toContainText('0 人が回答 · 3時間前');
    await expect(c.nth(3)).toContainText('昨日');
    await expect(c.nth(4)).toContainText('5日前');
    // 2 段目は Hero の席（席の色）と条件を 1 行に（18 章 §6。「Hero」の語は省く）
    await expect(c.nth(0).locator('.spot-cond')).toHaveText('BTN · Cash · 100bb · 6 Players');
    await expect(c.nth(1).locator('.spot-tag.answered')).toHaveText('回答済み');
    await expect(c.nth(2).locator('.spot-tag.mine')).toHaveText('自分の投稿');
    await expect(c.getByRole('button', { name: '削除' })).toHaveCount(3);
    // カード全体が押せる（右下の目印の位置）
    const b = (await c.nth(1).boundingBox())!;
    await page.mouse.click(b.x + b.width - 6, b.y + b.height - 6);
    await expect(page).toHaveURL(`/s/${ID(2)}/result`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(over).toBe(false);
    expect(errors).toEqual([]);
  });

  test(`タブ・Street・並び替え・「＋ Post」の固定ボタン${SP}`, async ({ page }) => {
    const l = await openList(page);
    await expect(page.getByRole('tab', { name: 'すべて' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: '自分の投稿' }).click();
    await expect(page).toHaveURL('/?tab=mine');
    await expect(page.locator('.spot-card')).toHaveCount(2);
    await page.getByRole('group', { name: 'Street' }).getByRole('button', { name: 'Flop' }).click();
    await expect(page).toHaveURL('/?tab=mine&street=flop');
    await expect(page.locator('.spot-card')).toHaveCount(1);
    await page.getByRole('group', { name: '並び替え' }).getByRole('button', { name: '回答が多い順' }).click();
    expect(l.calls.at(-1)).toMatchObject({ tab: 'mine', street: 'flop', sort: 'many' });
    await page.getByRole('link', { name: '＋ Post' }).click();
    await expect(page).toHaveURL('/new');
  });

  test(`タブは矢印キーで移れる${SP}`, async ({ page }) => {
    await openList(page);
    await page.getByRole('tab', { name: 'すべて' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '自分の投稿' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'すべて' })).toHaveAttribute('aria-selected', 'true');
  });

  test(`削除: 確認 → やめる / 削除する。空の表示${SP}`, async ({ page }) => {
    const be = await fakeBackend(page, null);
    await fakeList(page, rows());
    await page.goto('/');
    await page.locator('.spot-card').nth(3).getByRole('button', { name: '削除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'やめる' }).click();
    await expect(page.locator('.spot-card')).toHaveCount(5);
    await page.locator('.spot-card').nth(3).getByRole('button', { name: '削除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.locator('.spot-card')).toHaveCount(4);
    expect(be.deletes).toEqual([ID(4)]);
    await page.goto('/?tab=mine&street=turn');
    await expect(page.getByText('該当 Spot なし')).toBeVisible();
  });

  test(`読み込み中はカードの骨組み 3 枚。エラーは再試行${SP}`, async ({ page }) => {
    await fakeBackend(page, null);
    let fail = true;
    await page.route(`${DATA}/rpc/list_posts`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      await new Promise((r) => setTimeout(r, 500));
      return fail ? fulfillJson(route, 500, { message: 'x' }) : fulfillJson(route, 200, rows());
    });
    await page.goto('/');
    await expect(page.locator('.spot-card.skeleton')).toHaveCount(3);
    await expect(page.getByText('読み込みに失敗しました')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: '再試行' }).click();
    await expect(page.locator('.spot-card')).toHaveCount(5);
  });

  test(`追加読み込み（下へスクロール）${SP}`, async ({ page }) => {
    const many = Array.from({ length: 25 }, (_, i) => row(i + 1));
    await openList(page, many);
    await expect(page.locator('.spot-card')).toHaveCount(20);
    await page.locator('.spot-card').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.spot-card')).toHaveCount(25);
  });

  test(`Street のボタンと Post の固定ボタンが 44px 前後の大きさ${SP}`, async ({ page }) => {
    await openList(page);
    for (const loc of [page.getByRole('tab', { name: 'すべて' }), page.getByRole('link', { name: '＋ Post' }), page.getByRole('group', { name: 'Street' }).getByRole('button').first()]) {
      const b = (await loc.boundingBox())!;
      expect(b.height, await loc.innerText()).toBeGreaterThanOrEqual(36);
    }
    const del = (await page.locator('.spot-card').nth(2).getByRole('button', { name: '削除' }).boundingBox())!;
    expect(del.width).toBeGreaterThanOrEqual(36);
    expect(del.height).toBeGreaterThanOrEqual(36);
  });
});

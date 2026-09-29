/**
 * T-A A-05: 下書き（06 章 §3.2、14 章 §3.5）。離れるときの保存・保存しない・やめる、3 件がいっぱいのとき、開き直す、
 * 投稿すると消える、ブラウザの戻る、壊れた保存データ、保存できないブラウザ、アカウント削除で消える。
 */
import { expect, test, type Page } from '@playwright/test';
import { UID } from '../fakeBackend.ts';
import { fakeBackend, fakeCreatePost, watchErrors } from './taKit.ts';
import { acting, errorsBox, isMobile, pickSpot, playSrpTurn, setPlayers, setTitle, step, S_ACTION, S_PLAYER, submit, toSpot } from './taPost.ts';

const KEY = `wwyd.drafts.v1.${UID}`;
const VARIANTS = ['', ' @sp'] as const;

const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: '下書きに保存しますか' });
const draftsButton = (page: Page) => page.getByRole('link', { name: /^下書き/ });

/** 一覧の外への遷移の入口（PC は List のナビ、スマホは「一覧へ」） */
async function goList(page: Page): Promise<void> {
  if (isMobile(page)) await page.getByRole('link', { name: '一覧へ' }).click();
  else await page.getByRole('navigation', { name: 'メニュー' }).getByRole('link', { name: 'List' }).click();
}

async function stored(page: Page): Promise<{ id: string; savedAt: string; draft: Record<string, any> }[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), KEY);
}

async function startPost(page: Page, title = ''): Promise<void> {
  await page.goto('/new');
  await setPlayers(page, 6);
  if (title) await setTitle(page, title);
}

test.beforeEach(async ({ page }) => {
  await fakeBackend(page, null);
  await fakeCreatePost(page);
});

for (const v of VARIANTS) {
  test.describe(`A-05 下書き${v}`, () => {
    test(`何も入れていなければ聞かずに離れられる。人数だけ選んだら聞く${v}`, async ({ page }) => {
      await page.goto('/new');
      await goList(page);
      await expect(page).toHaveURL('/');
      await expect(leaveDialog(page)).toHaveCount(0);
      await page.goto('/new');
      await setPlayers(page, 3);
      await goList(page);
      await expect(leaveDialog(page)).toBeVisible();
    });

    test(`ダイアログの内容・初期フォーカスは「保存する」・Esc は「やめる」で入力は残る${v}`, async ({ page }) => {
      await startPost(page, 'ダイアログ');
      await goList(page);
      const dlg = leaveDialog(page);
      await expect(dlg).toContainText('下書きは 3 件まで、この端末に保存できます。');
      for (const n of ['保存する', '保存しない', 'やめる']) await expect(dlg.getByRole('button', { name: n, exact: true })).toBeVisible();
      await expect(dlg.getByRole('button', { name: '保存する' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      await expect(page).toHaveURL('/new');
      await toSpot(page);
      await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('ダイアログ');
      // 背景を押しても「やめる」
      await goList(page);
      await page.locator('.modal-backdrop').click({ position: { x: 3, y: 3 } });
      await expect(dlg).toHaveCount(0);
      await expect(page).toHaveURL('/new');
    });

    test(`どの入口から離れても聞く: 下書きのボタン・アカウントメニューの規約・ブラウザの戻る${v}`, async ({ page }) => {
      await startPost(page, '入口');
      // 下書きのボタン
      await draftsButton(page).click();
      await expect(leaveDialog(page)).toBeVisible();
      await leaveDialog(page).getByRole('button', { name: 'やめる' }).click();
      // アカウントメニュー → 利用規約
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: '利用規約' }).click();
      await expect(leaveDialog(page)).toBeVisible();
      await leaveDialog(page).getByRole('button', { name: 'やめる' }).click();
      await expect(page).toHaveURL('/new');
      // ブラウザの戻る（履歴に一覧がある）
      await page.goBack().catch(() => undefined);
      await page.goto('/');
      await page.getByRole('link', { name: /Post/ }).first().click();
      await setPlayers(page, 4);
      await page.goBack();
      await expect(leaveDialog(page)).toBeVisible();
      await expect(page).toHaveURL('/new');
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await expect(page).toHaveURL('/');
      // 保存されている
      expect(await stored(page)).toHaveLength(1);
    });

    test(`保存する → 保存内容（設定・Hand・Action・Board・Spot・タイトル）が localStorage に入り、開くと全部戻る。続きから投稿できる${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/new');
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, '完成した下書き');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await expect(page).toHaveURL('/');
      const list = await stored(page);
      expect(list).toHaveLength(1);
      expect(list[0]?.draft).toMatchObject({ fmt: 'cash', players: 6, hero: 'BTN', spotIndex: 10, title: '完成した下書き' });
      expect(list[0]?.draft['actions']).toHaveLength(12);
      // 個人情報のキーは無い
      expect(JSON.stringify(list)).not.toMatch(/email|mail|name"/i);

      await draftsButton(page).click();
      await expect(page.getByText('1 / 3')).toBeVisible();
      const card = page.locator('.spot-card').first();
      await expect(card).toContainText('たった今に保存');
      await expect(card).toContainText('6 人 · Hero BTN A♦K♦ · Turn · 12 Action');
      await page.getByRole('link', { name: '完成した下書き' }).click();
      await expect(page).toHaveURL('/new');
      await step(page, S_ACTION);
      await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
      await toSpot(page);
      await expect(page.getByRole('radio', { name: 'Turn / BTN Bet 3' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByPlaceholder(/タイトル/)).toHaveValue('完成した下書き');
      // 変えずに離れれば聞かない。下書きは残る
      await goList(page);
      await expect(page).toHaveURL('/');
      await expect(leaveDialog(page)).toHaveCount(0);
      expect(await stored(page)).toHaveLength(1);
      expect(errors).toEqual([]);
    });

    test(`開いた下書きから投稿すると、その下書きだけが消える${v}`, async ({ page }) => {
      const saved = ['一', '二'].map((t, i) => ({ id: `d${i}`, savedAt: `2026-09-29T0${i}:00:00.000Z`, draft: { title: `別の下書き${t}`, players: 6 } }));
      await page.addInitScript(([k, val]) => localStorage.getItem(k as string) === null && localStorage.setItem(k as string, val as string), [KEY, JSON.stringify(saved)]);
      await page.goto('/new');
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, '投稿する下書き');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      expect(await stored(page)).toHaveLength(3);
      await draftsButton(page).click();
      await page.getByRole('link', { name: '投稿する下書き' }).click();
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      const rest = await stored(page);
      expect(rest.map((e) => e.draft['title'] as string).sort()).toEqual(['別の下書き一', '別の下書き二']);
      await expect(draftsButton(page)).toHaveAccessibleName('下書き（2件）');
    });

    test(`3 件いっぱい: 一覧から 1 件消して保存。確認で「やめる」なら一覧に戻る。開いた下書きの上書きは 3 件でも通る${v}`, async ({ page }) => {
      const saved = ['一', '二', '三'].map((t, i) => ({
        id: `d${i}`,
        savedAt: `2026-09-29T0${i}:00:00.000Z`,
        draft: { title: `古い${t}`, players: 6, hands: { BTN: 'AdKd' }, stacks: {} },
      }));
      await page.addInitScript(([k, val]) => localStorage.getItem(k as string) === null && localStorage.setItem(k as string, val as string), [KEY, JSON.stringify(saved)]);
      await startPost(page, '四つ目');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      const full = page.getByRole('alertdialog', { name: '下書きがいっぱいです' });
      await expect(full).toContainText('保存するには、下書きを 1 件削除してください。');
      await expect(full.getByRole('listitem')).toHaveCount(3);
      await expect(full.getByRole('listitem').first()).toContainText('古い三'); // 新しい順
      // 「やめる」→ 「下書きに保存しますか」に戻る。そこで「やめる」→ 投稿の画面（入力は残る）
      await full.getByRole('button', { name: 'やめる' }).click();
      await expect(full).toHaveCount(0);
      await expect(leaveDialog(page)).toBeVisible();
      await leaveDialog(page).getByRole('button', { name: 'やめる' }).click();
      await expect(page).toHaveURL('/new');
      // もう一度: 削除 → 確認の「やめる」→ 一覧に戻る
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await full.getByRole('listitem').filter({ hasText: '古い一' }).getByRole('button', { name: '削除' }).click();
      const conf = page.getByRole('alertdialog', { name: 'この下書きを削除しますか' });
      await expect(conf).toContainText('「古い一」を削除して、今の入力を保存します。');
      await conf.getByRole('button', { name: 'やめる' }).click();
      await expect(full).toBeVisible();
      expect(await stored(page)).toHaveLength(3);
      await full.getByRole('listitem').filter({ hasText: '古い一' }).getByRole('button', { name: '削除' }).click();
      await conf.getByRole('button', { name: '削除して保存' }).click();
      await expect(page).toHaveURL('/');
      const now = await stored(page);
      expect(now.map((e) => e.draft['title'] as string).sort()).toEqual(['古い三', '古い二', '四つ目']);
      // 3 件ある状態で、開いた下書きの続きを保存すると上書き（いっぱいにならない）
      await draftsButton(page).click();
      await page.getByRole('link', { name: '古い二' }).click();
      await toSpot(page);
      await page.getByPlaceholder(/タイトル/).fill('古い二 改');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await expect(page).toHaveURL('/');
      const after = await stored(page);
      expect(after).toHaveLength(3);
      expect(after.map((e) => e.draft['title'] as string).sort()).toEqual(['古い三', '古い二 改', '四つ目']);
    });

    test(`下書きの画面: 新しい順・n / 3・削除は確認（やめる / 削除する）・空は「下書きなし」＋ Post${v}`, async ({ page }) => {
      const saved = [
        { id: 'a', savedAt: '2026-09-29T00:00:00.000Z', draft: { title: '最も古い', players: 2 } },
        { id: 'b', savedAt: '2026-09-29T02:00:00.000Z', draft: { title: '',  players: 3 } },
        { id: 'c', savedAt: '2026-09-29T01:00:00.000Z', draft: { title: '中間', players: 4 } },
      ];
      await page.addInitScript(([k, val]) => localStorage.setItem(k as string, val as string), [KEY, JSON.stringify(saved)]);
      await page.goto('/drafts');
      await expect(page.getByText('3 / 3')).toBeVisible();
      await expect(page.locator('.spot-link')).toHaveText(['タイトルなし', '中間', '最も古い']);
      await expect(page.locator('.spot-card').first()).toContainText('3 人 · Hero BTN');
      await page.locator('.spot-card').nth(1).getByRole('button', { name: '削除' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('この下書きを削除しますか');
      await page.getByRole('alertdialog').getByRole('button', { name: 'やめる' }).click();
      await expect(page.locator('.spot-card')).toHaveCount(3);
      await page.locator('.spot-card').nth(1).getByRole('button', { name: '削除' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('.spot-link')).toHaveText(['タイトルなし', '最も古い']);
      await expect(page.getByText('2 / 3')).toBeVisible();
      await expect(draftsButton(page)).toHaveAccessibleName('下書き（2件）');
      // 全部消す → 空
      for (let i = 0; i < 2; i++) {
        await page.locator('.spot-card').first().getByRole('button', { name: '削除' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      }
      await expect(page.getByText('下書きなし')).toBeVisible();
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
      await page.locator('main').getByRole('link', { name: 'Post' }).click();
      await expect(page).toHaveURL('/new');
    });

    test(`壊れた保存データ（JSON でない・配列でない・要素が壊れている・4 件以上）でも落ちず、読める分だけ出す${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      for (const raw of ['{not json', '{"a":1}', 'null', '"x"', '[1,null,"a",{"id":1},{"id":"x"}]']) {
        await page.addInitScript(([k, val]) => localStorage.setItem(k as string, val as string), [KEY, raw]);
        await page.goto('/drafts');
        await expect(page.getByText('下書きなし'), raw).toBeVisible();
      }
      const many = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, savedAt: `2026-09-29T0${i}:00:00.000Z`, draft: { title: `多い${i}` } }));
      await page.addInitScript(([k, val]) => localStorage.setItem(k as string, val as string), [KEY, JSON.stringify(many)]);
      await page.goto('/drafts');
      await expect(page.locator('.spot-link')).toHaveText(['多い4', '多い3', '多い2']);
      expect(errors).toEqual([]);
    });

    test(`型の違う・古い形の下書きを開く: 再生できない Action は捨て、そのほかは残す。開いても落ちない${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      const bad = {
        id: 'x',
        savedAt: '2026-09-29T00:00:00.000Z',
        draft: {
          fmt: 'zzz',
          sb: 5,
          players: 6,
          hero: 'XX',
          hands: { BTN: 'AdKd', SB: 123 },
          actions: [{ street: 'flop', pos: 'BTN', type: 'bet' }], // 最初の手が Flop の Bet: 再生できない
          board: ['Kh', 5, null],
          spotIndex: 99,
          title: 'い'.repeat(60),
        },
      };
      await page.addInitScript(([k, val]) => localStorage.setItem(k as string, val as string), [KEY, JSON.stringify([bad])]);
      await page.goto('/drafts');
      await page.locator('.spot-link').click();
      await expect(page).toHaveURL('/new');
      await step(page, S_PLAYER);
      await expect(page.getByRole('button', { name: 'BTN の Hand' })).toContainText('A');
      await step(page, S_ACTION);
      await expect(acting(page)).toContainText('UTG');
      await expect(page.locator('.hlog')).toHaveCount(0);
      // 投稿しようとしても落ちない（画面のエラーを出す）
      await setTitle(page, 'ふつうのタイトル');
      await submit(page);
      await expect(errorsBox(page)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`40 文字を超えるタイトルの下書き（古い形・改ざん）を開くと、欄は 60 / 40 と出て、投稿は「入力内容を確認してください」で止まる${v}`, async ({ page }) => {
      await page.goto('/new');
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, 'いち');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await page.evaluate((k) => {
        const l = JSON.parse(localStorage.getItem(k) ?? '[]');
        l[0].draft.title = 'い'.repeat(60);
        localStorage.setItem(k, JSON.stringify(l));
      }, KEY);
      await page.goto('/drafts');
      await page.locator('.spot-link').click();
      await toSpot(page);
      await expect(page.getByText('60 / 40')).toBeVisible();
      await submit(page);
      await expect(errorsBox(page)).toContainText('入力内容を確認してください');
    });

    test(`保存できないブラウザ（localStorage の書き込みが失敗）→ トースト「下書きを保存できませんでした」で留まる${v}`, async ({ page }) => {
      await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k: string, val: string) {
          if (k.startsWith('wwyd.drafts')) throw new DOMException('quota', 'QuotaExceededError');
          return orig.call(this, k, val);
        };
      });
      await startPost(page, '保存できない');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await expect(page.locator('.toast')).toHaveText('下書きを保存できませんでした');
      await expect(page).toHaveURL('/new');
      await expect(leaveDialog(page)).toBeVisible();
      // 「保存しない」なら離れられる
      await leaveDialog(page).getByRole('button', { name: '保存しない' }).click();
      await expect(page).toHaveURL('/');
    });

    test(`localStorage が使えない（getItem が例外）でもアプリは動く${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.addInitScript(() => {
        Storage.prototype.getItem = function () {
          throw new DOMException('denied', 'SecurityError');
        };
      });
      await page.goto('/drafts');
      await expect(page.getByText('下書きなし')).toBeVisible();
      await page.goto('/');
      await expect(draftsButton(page)).toHaveAccessibleName('下書き（0件）');
      expect(errors.filter((e) => !/SecurityError|denied/.test(e))).toEqual([]);
    });

    test(`保存していない入力があるままタブを閉じる・再読み込みすると離脱確認（beforeunload）。保存後は出ない${v}`, async ({ page }) => {
      await startPost(page, '閉じる');
      const dialog = page.waitForEvent('dialog');
      void page.evaluate(() => location.reload());
      const d = await dialog;
      expect(d.type()).toBe('beforeunload');
      await d.dismiss();
      // 保存したあとは出ない
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      await expect(page).toHaveURL('/');
      let fired = false;
      page.on('dialog', (dd) => {
        fired = true;
        void dd.accept();
      });
      await page.reload();
      expect(fired).toBe(false);
    });

    test(`アカウントを削除すると、その利用者の下書きも消える${v}`, async ({ page }) => {
      await startPost(page, '消える下書き');
      await goList(page);
      await leaveDialog(page).getByRole('button', { name: '保存する' }).click();
      expect(await stored(page)).toHaveLength(1);
      await page.getByRole('button', { name: 'アカウント' }).click();
      await page.getByRole('menuitem', { name: 'アカウントを削除' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
    });

    test(`別の利用者の下書きは見えない（キーは利用者ごと）${v}`, async ({ page }) => {
      const other = [{ id: 'o', savedAt: '2026-09-29T00:00:00.000Z', draft: { title: '他人の下書き' } }];
      await page.addInitScript(([k, val]) => localStorage.setItem(k as string, val as string), ['wwyd.drafts.v1.22222222-2222-4222-8222-222222222222', JSON.stringify(other)]);
      await page.goto('/drafts');
      await expect(page.getByText('下書きなし')).toBeVisible();
      await expect(draftsButton(page)).toHaveAccessibleName('下書き（0件）');
    });
  });
}

/**
 * T-A A-03: 手入力の投稿（06 章 §3.3〜§3.8、13 章、16 章）。2〜6 人、Fold to・Check to、よく使う額、All-in、Board のピッカー、
 * 1つ戻す・1つ進む・すべて消す、ログから入れ直す、Board の札から入れ直す、Spot の選択、タイトル 40 文字、投稿、エラー一覧と create-post のエラー。
 * PC はそのまま、スマホは @sp。create-post は ./taKit.ts の偽の応答（本文と Authorization を記録）。
 */
import { expect, test } from '@playwright/test';
import {
  acting,
  BET_BTN,
  pickSpot,
  dock,
  errorsBox,
  isMobile,
  openNew,
  playSrpTurn,
  S_ACTION,
  S_PLAYER,
  S_SETTINGS,
  setHand,
  setPlayers,
  setTitle,
  spotLabels,
  step,
  submit,
  table,
  toSpot,
} from './taPost.ts';
import { fakeBackend, fakeCreatePost, fulfillJson, FN, POST_ID, watchErrors } from './taKit.ts';

const VARIANTS = ['', ' @sp'] as const;

for (const v of VARIANTS) {
  test.describe(`A-03 手入力の投稿${v}`, () => {
    test(`SRP を最後まで入れて Spot（Turn の Bet）を選び、投稿 → 本文・Authorization・遷移・下書きの消去${v}`, async ({ page }) => {
      const errors = watchErrors(page);
      const { cp } = await openNew(page);
      await playSrpTurn(page);
      // 候補は Flop 以降の Hero の手番だけ（Preflop の Open は出ない）。自動では選ばない
      expect(await spotLabels(page)).toEqual(['Flop / BTN Bet 1.8', 'Turn / BTN Bet 3']);
      await expect(page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio', { checked: true })).toHaveCount(0);
      // 未選択のまま押すとエラー（タイトルも）
      await submit(page);
      await expect(errorsBox(page)).toContainText('Spot を選択してください');
      await expect(errorsBox(page)).toContainText('タイトルを入力してください');
      expect(cp.calls).toHaveLength(0);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, '  SRP の Turn c-bet  ');
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      expect(cp.calls).toHaveLength(1);
      const c = cp.calls[0]!;
      expect(c.auth).toMatch(/^Bearer .+/);
      const b = c.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(b['title']).toBe('SRP の Turn c-bet'); // 前後の空白は落とす
      expect(b).toMatchObject({ fmt: 'cash', sb: 0.5, bb: 1, ante: 0, rake: null, hero: 'BTN', hero_cards: ['Ad', 'Kd'], known_cards: { BB: ['Qs', 'Jc'] } });
      expect(b['stacks']).toEqual({ UTG: 100, HJ: 100, CO: 100, BTN: 100, SB: 100, BB: 100 });
      expect(b['board']).toEqual(['Kh', '8d', '3c', '2s']);
      expect(b['actions']).toHaveLength(12);
      expect(b['actions'][3]).toEqual({ street: 'pf', pos: 'BTN', type: 'raise', to: 2.5 });
      expect(b['actions'][7]).toMatchObject({ street: 'flop', pos: 'BTN', type: 'bet', to: 1.8 });
      expect(b['actions'][10]).toMatchObject({ street: 'turn', pos: 'BTN', type: 'bet', to: 3 });
      expect(b['spot_index']).toBe(10);
      expect(b['derived']).toMatchObject({ street: 'turn', keys: ['check', 's1'], stop_index: 10 });
      // 名前・メール等の個人情報の項目が本文に無い（不変条件 6）
      expect(Object.keys(b).sort()).toEqual(
        ['actions', 'ante', 'bb', 'board', 'derived', 'fmt', 'hero', 'hero_cards', 'known_cards', 'rake', 'sb', 'spot_index', 'stacks', 'title'].sort(),
      );
      // 一覧の「自分の投稿」タブへ。戻ると入力は空（下書きは消える）
      await expect(page.getByRole('link', { name: /^下書き/ })).toHaveAccessibleName('下書き（0件）');
      await page.goto('/new');
      await step(page, S_PLAYER);
      await expect(page.getByRole('group', { name: '人数' }).getByRole('button', { pressed: true })).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test(`人数を選ぶまでの検査: 投稿を押すと「Player の人数を選択してください」。Hero の Hand・Spot・タイトルも${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await submit(page);
      const e = errorsBox(page);
      await expect(e).toContainText('Player の人数を選択してください');
      await expect(e).toContainText('Hero（BTN）の Hand を入力してください');
      await expect(e).toContainText('Spot を選択してください');
      await expect(e).toContainText('タイトルを入力してください');
      // 人数が未選択のときは「Hand を最後まで入力してください」は出さない
      await expect(e).not.toContainText('Hand を最後まで入力してください');
      // Action の節は「Player の人数を選択してください」
      await step(page, S_ACTION);
      await expect(page.locator('.pf-actsec')).toContainText('Player の人数を選択してください');
      expect(cp.calls).toHaveLength(0);
    });

    test(`エラー一覧の各文言（06 章 §3.8）: 途中の Hand・不正な設定値・最後まで入力していない${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await setPlayers(page, 3);
      await setHand(page, 'BTN', 'adkd');
      await setHand(page, 'SB', 'q'); // 途中（ランクだけ）
      await submit(page);
      const e = errorsBox(page);
      await expect(e).toContainText('SB の Hand が途中です');
      await expect(e).toContainText('Hand を最後まで入力してください');
      // 設定値が不正
      await step(page, S_SETTINGS);
      await page.getByLabel('SB（bb）').fill('abc');
      await page.getByLabel('Ante（bb）').fill('-1');
      await step(page, S_PLAYER);
      await page.getByRole('textbox', { name: 'BB の Stack（bb）' }).fill('0');
      await submit(page);
      await expect(e).toContainText('SB の値が正しくありません');
      await expect(e).toContainText('Ante の値が正しくありません');
      await expect(e).toContainText('BB の Stack の値が正しくありません');
      // Hand を最後まで入力してください は設定が不正な間は出さない（Action の節は「基本設定の値が正しくありません」）
      await step(page, S_ACTION);
      await expect(page.locator('.pf-actsec')).toContainText('基本設定の値が正しくありません');
      expect(cp.calls).toHaveLength(0);
      // 赤い枠
      await step(page, S_SETTINGS);
      await expect(page.getByLabel('SB（bb）')).toHaveAttribute('aria-invalid', 'true');
    });

    test(`Stack・SB・Ante・Rake の境界: Stack は 1000 まで（F-037）、小数第 4 位・数でない値・Rake 100 超は不正${v}`, async ({ page }) => {
      await openNew(page);
      await setPlayers(page, 2);
      await step(page, S_PLAYER);
      const stack = page.getByRole('textbox', { name: 'BTN の Stack（bb）' });
      for (const [val, bad] of [['1000', false], ['1000.001', true], ['9999.999', true], ['10000', true], ['100.0004', true], ['1e3', true], ['-5', true], ['0.001', false], ['', true], ['１００', true]] as const) {
        await stack.fill(val);
        if (bad) await expect(stack, val).toHaveAttribute('aria-invalid', 'true');
        else await expect(stack, val).not.toHaveAttribute('aria-invalid', 'true');
      }
      await stack.fill('100');
      await step(page, S_SETTINGS);
      const sb = page.getByLabel('SB（bb）');
      for (const [val, bad] of [['1', false], ['1.001', true], ['0', true], ['0.001', false], ['0.5', false]] as const) {
        await sb.fill(val);
        if (bad) await expect(sb, val).toHaveAttribute('aria-invalid', 'true');
        else await expect(sb, val).not.toHaveAttribute('aria-invalid', 'true');
      }
      const rake = page.getByLabel('Rake（%）');
      for (const [val, bad] of [['5', false], ['100', false], ['100.01', true], ['5.123', true], ['', false], ['a', true]] as const) {
        await rake.fill(val);
        if (bad) await expect(rake, val).toHaveAttribute('aria-invalid', 'true');
        else await expect(rake, val).not.toHaveAttribute('aria-invalid', 'true');
      }
      // MTT にすると Rake は空・非活性
      await rake.fill('5');
      await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'MTT' }).click();
      await expect(rake).toBeDisabled();
      await expect(rake).toHaveValue('');
      await page.getByRole('group', { name: 'Game 形式' }).getByRole('button', { name: 'Cash' }).click();
      await expect(rake).toBeEnabled();
      await expect(rake).toHaveValue('');
    });

    test(`タイトルは 40 文字（コードポイント）まで。空白だけはエラー${v}`, async ({ page }) => {
      await openNew(page);
      await toSpot(page);
      const t = page.getByPlaceholder('タイトル（40文字まで）');
      await t.fill('あ'.repeat(50));
      await expect(t).toHaveValue('あ'.repeat(40));
      await expect(page.getByText('40 / 40')).toBeVisible();
      // 絵文字（サロゲートペア）・結合文字もコードポイントで数える
      await t.fill('😀'.repeat(45));
      await expect(t).toHaveValue('😀'.repeat(40));
      await expect(page.getByText('40 / 40')).toBeVisible();
      await t.fill('é'.repeat(30)); // 60 コードポイント
      await expect(page.getByText('40 / 40')).toBeVisible();
      await t.fill('   ');
      await expect(page.getByText('3 / 40')).toBeVisible();
      await submit(page);
      await expect(errorsBox(page)).toContainText('タイトルを入力してください');
      await t.fill('<script>alert(1)</script>');
      await expect(t).toHaveValue('<script>alert(1)</script>');
    });

    test(`Fold to / Check to・よく使う額・All-in の額・範囲外の額はトーストで止める${v}`, async ({ page }) => {
      await openNew(page);
      await setPlayers(page, 6);
      await step(page, S_ACTION);
      const d = dock(page);
      // UTG の番: Fold to は HJ〜BTN・SB・BB？（2 手以上のものだけ）
      const fto = d.getByRole('group', { name: 'Fold to' });
      await expect(fto.getByRole('button')).toHaveText(['CO', 'BTN', 'SB']);
      // Open の額の候補
      const chips = d.getByRole('group', { name: 'Raise の額' });
      await expect(chips.getByRole('button').first()).toContainText('2');
      await expect(chips.getByRole('button', { name: /All-in/ })).toBeVisible();
      // All-in を選ぶと Preflop の All-in は入力できない（トースト）
      await chips.getByRole('button', { name: /All-in/ }).click();
      await d.getByRole('button', { name: /^Open/ }).click();
      await expect(page.locator('.toast')).toHaveText('Preflop で All-in になった Hand は投稿できません');
      await expect(acting(page)).toContainText('UTG');
      if (!isMobile(page)) {
        // PC は額を打てる。範囲外・小数第 4 位以上はトースト「{min}〜{max}bb」で入れない
        const size = d.getByRole('textbox', { name: 'Raise の額（to。bb）' });
        await size.fill('1.5');
        await d.getByRole('button', { name: /^(Open|Raise)/ }).click();
        await expect(page.locator('.toast')).toContainText('bb');
        await expect(acting(page)).toContainText('UTG');
        await size.fill('2.5001');
        await size.press('Enter');
        await expect(page.locator('.toast')).toContainText('〜');
        await expect(acting(page)).toContainText('UTG');
        await size.fill('3');
        await size.press('Enter'); // Enter でも打てる
        await expect(acting(page)).toContainText('HJ');
      }
    });

    test(`Board のカードを押すと、そのカード以降のボードとアクションを消す。使用済みの札は押せない${v}`, async ({ page }) => {
      await openNew(page);
      await playSrpTurn(page);
      const tbl = table(page);
      // 卓の Flop の 2 枚目（8♦）を押す → Flop の 2 枚目以降と、Flop 以降のアクションを消す
      await tbl.getByRole('button', { name: /^8♦/ }).click();
      // 8♦ 以降が消え、Flop のカードの入力（ピッカー）が開く
      const picker = page.getByRole('dialog').filter({ has: page.getByRole('grid', { name: 'Card' }) });
      await expect(picker).toBeVisible();
      // 使用済みの札（K♥・Hero の A♦ K♦）は非活性
      await expect(picker.getByRole('gridcell', { name: 'K♥' })).toBeDisabled();
      await expect(picker.getByRole('gridcell', { name: 'A♦' })).toBeDisabled();
      await expect(picker.getByRole('gridcell', { name: 'Q♠' })).toBeDisabled(); // BB の Hand
      await expect(picker.getByRole('gridcell', { name: '8♦' })).toBeEnabled();
      await picker.getByRole('gridcell', { name: '9♠' }).click();
      await picker.getByRole('gridcell', { name: '4♠' }).click();
      // 揃うと閉じ、Flop の手番（BB）に戻っている
      await expect(picker).toHaveCount(0);
      await expect(acting(page)).toContainText('BB');
    });

    test(`ログの 1 手から入れ直し・1つ戻す・1つ進む・すべて消す（確認あり）${v}`, async ({ page }) => {
      await openNew(page);
      await playSrpTurn(page);
      const d = dock(page);
      // 終わったあとは台が無く、道具（1つ戻す・すべて消す）が出る
      await expect(page.getByRole('button', { name: '1つ戻す' })).toBeEnabled();
      await page.getByRole('button', { name: '1つ戻す' }).click(); // BB の Fold を取り消す
      await expect(acting(page)).toContainText('BB');
      await expect(d.getByRole('button', { name: 'Fold' })).toBeVisible();
      await page.getByRole('button', { name: '1つ進む' }).click(); // BB の Fold を入れ直す
      await expect(page.getByText('BTN Pot 獲得')).toBeVisible();
      // ログの Flop の BTN Bet から入れ直す
      if (isMobile(page)) await page.getByRole('button', { name: 'History' }).click();
      await page.getByRole('button', { name: 'BTN Bet 1.8' }).click();
      const dlg = page.getByRole('alertdialog');
      await expect(dlg).toContainText('BTN Bet 1.8 から入れ直しますか');
      await expect(dlg).toContainText('この手から後の Action を消します。');
      await dlg.getByRole('button', { name: '入れ直す' }).click();
      await expect(acting(page)).toContainText('BTN');
      // ボードは残る（Turn の 2♠ が薄く残り、再到達時にボードを求めない）
      await expect(table(page).getByRole('button', { name: /^2♠/ })).toBeVisible();
      await d.getByRole('button', { name: BET_BTN }).click();
      await d.getByRole('button', { name: /^Call/ }).click();
      await expect(acting(page)).toContainText('BB'); // Turn の BB（ピッカーは開かない）
      await expect(page.getByRole('dialog')).toHaveCount(0);
      // すべて消す: やめる → 何も消えない。消す → Action もボードも空
      await page.getByRole('button', { name: 'すべて消す' }).click();
      const all = page.getByRole('alertdialog');
      await expect(all).toContainText('Action と Board をすべて消しますか');
      await all.getByRole('button', { name: 'やめる' }).click();
      await expect(acting(page)).toContainText('BB');
      await page.getByRole('button', { name: 'すべて消す' }).click();
      await all.getByRole('button', { name: 'すべて消す' }).click();
      await expect(acting(page)).toContainText('UTG');
      await expect(table(page).getByRole('button', { name: /この Card 以降を消す/ })).toHaveCount(0);
    });

    test(`Spot: Flop 以降の Hero の手番だけ。Hero の Fold も候補。Hero を変えると候補が変わり選択を外す${v}`, async ({ page }) => {
      await openNew(page);
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await expect(page.getByRole('radio', { name: 'Turn / BTN Bet 3' })).toHaveAttribute('aria-checked', 'true');
      // Hero を BB に → 候補は BB の手番（Flop の Check・Call、Turn の Check・Fold）。選んでいた Spot は消える
      await setPlayers(page, 6);
      await step(page, S_PLAYER);
      await setHand(page, 'BTN', ''); // 何もしない（Esc）
      await page.getByRole('radio', { name: 'Hero を BB にする' }).click();
      expect(await spotLabels(page)).toEqual(['Flop / BB Check', 'Flop / BB Call', 'Turn / BB Check', 'Turn / BB Fold']);
      await expect(page.getByRole('radiogroup', { name: 'Hero の Action' }).getByRole('radio', { checked: true })).toHaveCount(0);
      await submit(page);
      await expect(errorsBox(page)).toContainText('Spot を選択してください');
    });

    test(`Hero が Preflop で Fold して終わると「候補なし」。投稿するとエラー（Flop 以降に Hero の Action が無い）${v}`, async ({ page }) => {
      const { cp } = await openNew(page);
      await setPlayers(page, 6);
      await setHand(page, 'UTG', 'as' + 'ah');
      await page.getByRole('radio', { name: 'Hero を UTG にする' }).click();
      await step(page, S_ACTION);
      const d = dock(page);
      await d.getByRole('button', { name: 'Fold' }).click(); // Hero の UTG が Fold
      await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'SB' }).click(); // HJ〜BTN も Fold（SB の番）
      await d.getByRole('button', { name: 'Fold' }).click(); // SB も Fold → BB が Pot 獲得
      await expect(page.getByText(/Pot 獲得/)).toBeVisible();
      await toSpot(page);
      await expect(page.getByText('候補なし')).toBeVisible();
      await setTitle(page, 'Preflop で終わる');
      await submit(page);
      await expect(errorsBox(page)).toContainText('Flop 以降に Hero の Action が無い Hand は投稿できません');
      expect(cp.calls).toHaveLength(0);
    });

    test(`create-post のエラーコード → 画面の文言（06 章 §7）。入力を変えると消える${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      const codes: Record<string, string> = {
        daily_limit: '本日の投稿上限（5件）に達しました',
        invalid_title: '入力内容を確認してください',
        malformed: '入力内容を確認してください',
        invalid_spot: 'Spot を選び直してください',
        preflop_allin: 'Preflop で All-in になった Hand は投稿できません',
        no_spot: 'Flop 以降に Hero の Action が無い Hand は投稿できません',
        derived_mismatch: '投稿できませんでした。再読み込みしてやり直してください',
        not_authenticated: 'ログインし直してください',
        not_allowed: 'このアカウントは利用できません',
        internal: 'エラーが発生しました',
        not_admin: 'エラーが発生しました',
        zzz_unknown: 'エラーが発生しました',
      };
      let code = 'daily_limit';
      await fakeCreatePost(page, () => ({ status: code === 'internal' ? 500 : code === 'not_authenticated' ? 401 : 422, body: { error: code } }));
      await page.goto('/new');
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, 'エラーの試験');
      for (const [c, msg] of Object.entries(codes)) {
        code = c;
        await submit(page);
        await expect(errorsBox(page), c).toContainText(msg);
        // 入力を変えると（タイトルを打ち直すと）サーバーのエラーは消える
        await page.getByPlaceholder(/タイトル/).fill(`エラーの試験 ${c}`);
        await expect(errorsBox(page), c).toHaveCount(0);
      }
    });

    test(`Action のエラーコードは「Action の内容を確認してください（n手目）」。通信失敗・JSON でない応答${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      let mode: 'action' | 'abort' | 'html502' | 'noid' = 'action';
      await page.route(`${FN}/**`, async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
        if (mode === 'abort') return route.abort('connectionrefused');
        if (mode === 'html502') return route.fulfill({ status: 502, headers: { 'access-control-allow-origin': '*' }, contentType: 'text/html', body: '<html>Bad Gateway</html>' });
        if (mode === 'noid') return fulfillJson(route, 201, {});
        return fulfillJson(route, 422, { error: 'illegal_action', detail: { index: 4 } });
      });
      await page.goto('/new');
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, 'エラーの試験 2');
      await submit(page);
      await expect(errorsBox(page)).toContainText('Action の内容を確認してください（5手目）');
      for (const [m, msg] of [['abort', '通信に失敗しました'], ['html502', 'エラーが発生しました'], ['noid', '通信に失敗しました']] as const) {
        mode = m;
        await page.getByPlaceholder(/タイトル/).fill(`エラーの試験 2 ${m}`);
        await submit(page);
        await expect(errorsBox(page), m).toContainText(msg);
      }
    });

    test(`二重に押しても 1 回だけ送る。送信中は「投稿中…」で押せない。失敗したら押し直せる${v}`, async ({ page }) => {
      await fakeBackend(page, null);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      const calls: number[] = [];
      let first = true;
      await page.route(`${FN}/**`, async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
        calls.push(Date.now());
        if (first) {
          first = false;
          await gate;
          return fulfillJson(route, 500, { error: 'internal' });
        }
        return fulfillJson(route, 201, { id: POST_ID });
      });
      await page.goto('/new');
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, '二重送信');
      const btn = page.getByRole('button', { name: '投稿する' });
      await btn.dblclick();
      await expect(page.getByRole('button', { name: '投稿中…' })).toBeDisabled();
      expect(calls).toHaveLength(1);
      release();
      await expect(errorsBox(page)).toContainText('エラーが発生しました');
      await expect(page.getByRole('button', { name: '投稿する' })).toBeEnabled();
      await page.getByRole('button', { name: '投稿する' }).click();
      await expect(page).toHaveURL('/?tab=mine');
      expect(calls).toHaveLength(2);
    });

    test(`投稿に成功したら開いていた下書きも消える。離れるときの確認は出ない${v}`, async ({ page }) => {
      await openNew(page);
      await playSrpTurn(page);
      await pickSpot(page, 'Turn / BTN Bet 3');
      await setTitle(page, '投稿して下書きを消す');
      await submit(page);
      await expect(page).toHaveURL('/?tab=mine');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    });
  });
}

test('PC: 1 画面に収まり、ページがスクロールしない。キー操作 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z（17 章）', async ({ page }) => {
  await openNew(page);
  await setPlayers(page, 6);
  const d = dock(page);
  await d.getByRole('group', { name: 'Fold to' }).getByRole('button', { name: 'BTN' }).click();
  await d.getByRole('button', { name: /^Open/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(acting(page)).toContainText('SB');
  await page.keyboard.press('Control+z');
  await expect(acting(page)).toContainText('BTN');
  await page.keyboard.press('Control+y');
  await expect(acting(page)).toContainText('SB');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(acting(page)).toContainText('SB');
  // 入力欄の中では効かない（額の入力欄）
  await page.getByRole('textbox', { name: 'SB の Stack（bb）' }).click();
  await page.keyboard.press('Control+z');
  await expect(acting(page)).toContainText('SB');
});

import type { AppState } from '../appState.ts';
import type { RouteName } from '../router.ts';

/**
 * インフォメーションモーダルの文言（詳細仕様 09 章の確定稿をそのまま写す）。
 * 画面に出さない説明・操作方法・記号の意味は、すべてここに集約する（CLAUDE.md 不変条件 1）。
 * 文言を変えるときは 09 章を先に直す。
 */

export type InfoItem = { term: string; desc: string };
export type InfoSection = { id: InfoSectionId; title: string; items: readonly InfoItem[] };
export type InfoSectionId = 'login' | 'list' | 'answer' | 'result' | 'new' | 'account';

export const INFO_SECTIONS: Record<InfoSectionId, InfoSection> = {
  login: {
    id: 'login',
    title: 'ログイン',
    items: [
      {
        term: 'WWYD',
        desc: 'ハンドの 1 場面（スポット）で、Villain ならどんなレンジでどう行動するかを、プレイヤーの回答から集合知として見るアプリ。',
      },
      {
        term: 'ログイン',
        desc: 'Google アカウントでログインする。表示名とメールアドレスは他のユーザーに表示されず、投稿や回答と一緒には保存されない。',
      },
    ],
  },
  list: {
    id: 'list',
    title: 'スポット一覧',
    items: [
      { term: 'タブ', desc: '「すべて」と「自分の投稿」。' },
      { term: 'フィルタ', desc: 'スポットのストリート（プリフロップ〜リバー）で絞り込み、新着順または回答数順に並び替え。' },
      {
        term: '遷移',
        desc: '未回答のスポットは回答画面へ、回答済みと自分の投稿は集計画面へ。他人の投稿の集計は回答するまで見られない。',
      },
    ],
  },
  answer: {
    id: 'answer',
    title: 'レンジ入力',
    items: [
      { term: '視点', desc: 'Villain（あなた）の席から、Hero のアクションに対する Villain のレンジを入力する。' },
      { term: 'リプレイ', desc: 'スポットまでのアクションを再生する。Hero のハンドは回答後に公開される。' },
      {
        term: 'ブラシ',
        desc: '上部のアクションを押すとそのアクション 100% のブラシになる。バーの境界をドラッグすると混合戦略（5% 刻み）を作れる。マスをタップ、またはなぞるとブラシの頻度で塗られる。',
      },
      {
        term: '色',
        desc: '赤はフォールド、シアンはチェックとコール、黄はベットとレイズ。マスの中では左からフォールド、チェック、コール、ベット・レイズの順に並ぶ。',
      },
      { term: 'スポイト', desc: 'マスを長押しすると、そのマスの頻度をブラシに読み込む。' },
      {
        term: 'レンジ外',
        desc: '塗らないマスはレンジ外（このスポットに到達しないハンド）。消しゴムで塗ったマスをレンジ外に戻せる。ブラシと同じ頻度のマスをもう一度押しても消える。',
      },
      {
        term: '元に戻す・やり直す・クリア',
        desc: '塗る操作を 1 回ずつ戻せる。なぞった操作は 1 回分として扱う。クリアで全マスをレンジ外に戻す。',
      },
      {
        term: 'サイズ',
        desc: '33%・50%・75%・125% はコール後のポットに対する割合。レイズの場合は現在のベット額にその分を足した額が to になる。入力欄とゲージで任意のサイズに調整できる。',
      },
      { term: '下部のバー', desc: '1326 combos に対する各アクションとレンジ外の比率。' },
      {
        term: '送信',
        desc: '回答は 1 スポットにつき 1 回で、送信後は変更できない。自分の投稿への入力は Hero の想定レンジとして保存され、全体の集計には含まれない。Hero の想定レンジは何度でも変更できる。',
      },
    ],
  },
  result: {
    id: 'result',
    title: '集計',
    items: [
      {
        term: '色',
        desc: 'マス内の色の割合がアクション頻度を表す（そのハンドをレンジ内とした回答者の平均）。赤はフォールド、シアンはチェックとコール、黄はベットとレイズ。',
      },
      { term: '濃さ', desc: 'そのハンドをレンジ内に含めた回答者の割合。薄いほどレンジ外とした回答者が多い。' },
      { term: '白枠', desc: 'Villain の実際のハンド。ショーダウンがない、またはマックの場合は表示されない。' },
      {
        term: '上部のバー',
        desc: '1326 combos に対する各アクションとレンジ外の比率。レンジ内とした回答者の割合で重み付けしている。',
      },
      { term: 'タブ', desc: '全体・自分・Hero の想定レンジを切り替えられる。マスを選ぶと内訳が表示される。' },
      { term: 'ハンドヒストリー', desc: 'ハンドを最後まで再生し、ショーダウンのハンドを確認できる。' },
    ],
  },
  new: {
    id: 'new',
    title: 'スポット投稿',
    items: [
      {
        term: '画像読み込み',
        desc: 'T4 のハンドヒストリー画像を端末内で OCR する。画像は読み取り後に削除され、保存も送信もされない。',
      },
      {
        term: '基本設定',
        desc: 'キャッシュゲームではアンティとレーキを任意で入力する。MTT ではレーキは入力できない。アクション入力後は変更できない。',
      },
      {
        term: 'プレイヤーとハンド',
        desc: '分かっているハンドのみ入力する。Hero のハンドは必須。フォールドした席でも判明していれば入力できる。ハンド欄を押すとカードキーボードが表示される。',
      },
      {
        term: 'カードキーボード',
        desc: 'A キーはタップで A、押したまま上で K・右で Q・下で J・左で T。♠ キーはタップで ♠、上で ♥・右で ♦・下で ♣。1 → 0 で T。C で席のハンドをクリア、⌫ で 1 文字削除。使用済みのカードは入力できない。',
      },
      { term: 'ショーダウン', desc: 'ハンドが入力されていない席はマックとして扱う。' },
      {
        term: 'アクション入力',
        desc: 'そのスポットで取れないアクションは非活性になる。ストリートが終わるとボード入力に進む。「1つ戻す」はアクションだけを戻し、ボードは残る。',
      },
      {
        term: 'スポット',
        desc: 'Hero のアクションを 1 つと Villain を 1 つ選ぶ。回答対象はその後の Villain の最初のアクション。フォールドした席も Villain に選べる。',
      },
    ],
  },
  account: {
    id: 'account',
    title: 'アカウント',
    items: [
      {
        term: 'アカウント',
        desc: '利用規約、プライバシーポリシー、ログアウト、アカウント削除（投稿・回答をすべて消す。元に戻せない）。',
      },
    ],
  },
};

/**
 * 表示中の画面に対応する節（09 章「表示する画面との対応」）。
 * アカウントメニューを開いている間と規約ページはアカウントの節。
 * 画面が決まらない状態（利用不可・メンテナンス中・オフライン・404）はアプリの説明（ログインの節）を出す。
 */
export function infoSectionFor(state: AppState, route: RouteName, accountMenuOpen: boolean): InfoSectionId {
  if (accountMenuOpen) return 'account';
  if (route === 'terms' || route === 'privacy') return 'account';
  if (state !== 'ready') return 'login';
  switch (route) {
    case 'list':
      return 'list';
    case 'new':
      return 'new';
    case 'answer':
      return 'answer';
    case 'result':
      return 'result';
    default:
      return 'login';
  }
}

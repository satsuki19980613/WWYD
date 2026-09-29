import type { AppState } from '../appState.ts';
import type { RouteName } from '../router.ts';

/**
 * インフォメーションモーダルの文言（詳細仕様 09 章の確定稿をそのまま写す）。画面を見て分からないことだけを 1 行で書く（2026-09-29 さつき）。
 * 画面に出さない説明・操作方法・記号の意味は、すべてここに集約する（CLAUDE.md 不変条件 1）。
 * 文言を変えるときは 09 章を先に直す。
 */

export type InfoItem = { term: string; desc: string };
export type InfoSection = { id: InfoSectionId; title: string; items: readonly InfoItem[] };
export type InfoSectionId = 'login' | 'list' | 'answer' | 'result' | 'new' | 'drafts' | 'account';

export const INFO_SECTIONS: Record<InfoSectionId, InfoSection> = {
  login: {
    id: 'login',
    title: 'ログイン',
    items: [
      { term: 'WWYD', desc: 'Hand の Spot（Hero の手番）で、ほかの Player ならどんな Range で打つかを、回答を集めて見る。' },
      { term: 'ログイン', desc: 'Google でログインする。表示名とメールアドレスは保存しない。' },
    ],
  },
  list: {
    id: 'list',
    title: 'List',
    items: [
      { term: '開く', desc: '未回答は回答へ、回答済みは集計へ。集計は回答するまで見られない。' },
      { term: '削除', desc: 'ごみ箱で自分の投稿を削除する（回答も消える。元に戻せない）。' },
      { term: 'キー（PC）', desc: '↑ ↓（j k）で行を移り、Enter で開く。' },
    ],
  },
  answer: {
    id: 'answer',
    title: 'Range 入力',
    items: [
      { term: '回答', desc: 'Hero の席で、この Spot の Range を塗る。塗らないマスは Range 外。' },
      { term: 'SPOT', desc: '卓の SPOT とバーの黄の目盛りが出題の局面。Hero の Hand は回答後に見られる。' },
      { term: '色', desc: '赤は Fold、シアンは Check・Call、黄は Bet・Raise。' },
      { term: 'ブラシ', desc: 'バーの境界をドラッグすると混合（5% 刻み）。同じ頻度のマスを押すと消える。長押しでそのマスの頻度を読み込む。' },
      { term: 'Size', desc: '% は Call した後の Pot に対する割合。' },
      { term: '送信', desc: '1 Spot に 1 回。送信後は変えられない。' },
      { term: 'キー（PC）', desc: '← → で 1 手、Home で最初、End で Spot。Ctrl+Z・Ctrl+Y で戻す・やり直す。B でブラシ、E で消しゴム。' },
    ],
  },
  result: {
    id: 'result',
    title: '集計',
    items: [
      { term: '色', desc: 'マスの色の割合が回答者の平均の頻度。赤は Fold、シアンは Check・Call、黄は Bet・Raise。' },
      { term: '濃さ', desc: 'その Hand を Range に入れた回答者の割合。薄いほど少ない。' },
      { term: '白枠', desc: 'Hero の実際の Hand。' },
      { term: '自分との差', desc: '全体との違い（黄が濃いほど違う）。正解・不正解ではない。' },
      { term: 'SPOT', desc: '卓の SPOT とバーの黄の目盛りが出題の局面。' },
      { term: 'キー（PC）', desc: '← → で 1 手、Home で最初、End で最後。マスにマウスを乗せると内訳（押すと固定）。' },
    ],
  },
  new: {
    id: 'new',
    title: 'Post',
    items: [
      { term: '画像読み込み', desc: 'T4 の Hand History の画像を端末の中で読み取る。画像は保存も送信もしない。' },
      { term: '投稿できない Hand', desc: 'Flop 以降に Hero の Action が無い Hand と、Preflop で All-in になった Hand。' },
      { term: 'Hand', desc: '分かっている Hand だけ入れる（Hero は必須）。入れていない席は Showdown で Muck。' },
      { term: 'Card キーボード', desc: 'Q を押したまま上で K・左で T・下で J。♠ を押したまま上で ♥・左で ♦・下で ♣。' },
      { term: '入れ直し', desc: 'ログの Action や卓の Board の Card を押すと、そこから入れ直す。' },
      { term: '設定の変更', desc: '設定・人数・Stack・Hero は Action の後も変えられる。合わなくなった Action は外れる。' },
      { term: 'キー（PC）', desc: 'Card はキーでも打てる（A → s）。Ctrl+Z・Ctrl+Y で Action を戻す・進める。' },
    ],
  },
  drafts: {
    id: 'drafts',
    title: '下書き',
    items: [{ term: '下書き', desc: '3 件まで、この端末のブラウザに保存する。投稿すると消える。' }],
  },
  account: {
    id: 'account',
    title: 'アカウント',
    items: [{ term: 'アカウント削除', desc: '投稿と回答をすべて消す（元に戻せない）。' }],
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
    case 'drafts':
      return 'drafts';
    case 'answer':
      return 'answer';
    case 'result':
      return 'result';
    default:
      return 'login';
  }
}

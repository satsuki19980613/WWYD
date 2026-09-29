import type { AppState } from '../appState.ts';
import type { RouteName } from '../router.ts';

/**
 * インフォメーションモーダルの文言（詳細仕様 09 章の確定稿をそのまま写す）。
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
      {
        term: 'WWYD',
        desc: 'Hand の Hero の手番（Spot）で、ほかの Player ならどんな Range でどう行動するかを、回答から集合知として見るアプリ。',
      },
      {
        term: 'ログイン',
        desc: 'Google アカウントでログインする。表示名とメールアドレスは他のユーザーに表示されず、投稿や回答と一緒には保存されない。',
      },
    ],
  },
  list: {
    id: 'list',
    title: 'List',
    items: [
      { term: 'タブ', desc: '「すべて」と「自分の投稿」。' },
      { term: 'フィルタ', desc: 'Spot の Street（Flop〜River）で絞り込み、新着順または回答数順に並び替え。PC は左の列で選ぶ。表の見出しの「回答」「投稿」を押しても並び替えられる。' },
      {
        term: '遷移',
        desc: 'Card（PC は行）を押すと、未回答の Spot は回答画面へ、回答済みの Spot は集計画面へ進む。自分の投稿にも回答でき、集計は回答するまで見られない。',
      },
      { term: '削除', desc: '自分の投稿は Card の右上（PC は行の右端）のごみ箱のマークから削除できる（回答もまとめて消える。元に戻せない）。' },
      { term: 'Board と Players', desc: 'Board はその Spot の Street までの Card。Players は Hand の人数。' },
      { term: 'キー操作（PC）', desc: '↑ ↓（または j k）で行を移り、Enter で開く。' },
    ],
  },
  answer: {
    id: 'answer',
    title: 'Range 入力',
    items: [
      { term: '視点', desc: 'Hero（あなた）の席に座り、この Spot での Hero の Range を入力する（Hand ごとに、どの Action をどの割合で取るか）。' },
      { term: 'Replay', desc: 'Spot までの Action を再生する。再生の操作は「|◀」で 1手戻る、「▶」で再生（再生中は「❚❚」で一時停止）、「▶|」で 1手進む。Hero の Hand は回答後に公開される。Spot の局面に来ると、卓の Hero の席が黄に光り「SPOT」が出る。進み具合のバーの黄の目盛りが Spot の位置。' },
      { term: 'Spot', desc: 'Spot（出題の局面）の Street・Board・Hero の席・Hero が向き合う Action（vs BB Bet 6.5 など。その Street の最初の Action なら to act）・Pot・to call。PC は Range の上の帯、スマホは Range のタブの上の行（押すと Replay に戻る）。' },
      {
        term: 'ブラシ',
        desc: '上部の Action を押すとその Action 100% のブラシになる。バーの境界をドラッグすると混合戦略（5% 刻み）を作れる。マスをタップ、またはなぞるとブラシの頻度で塗られる。',
      },
      {
        term: '色',
        desc: '赤は Fold、シアンは Check と Call、黄は Bet と Raise。マスの中では左から Fold、Check、Call、Bet・Raise の順に並ぶ。',
      },
      { term: 'スポイト', desc: 'マスを長押しすると、そのマスの頻度をブラシに読み込む。' },
      {
        term: 'Range 外',
        desc: '塗らないマスは Range 外（この Spot に到達しない Hand）。消しゴムで塗ったマスを Range 外に戻せる。ブラシと同じ頻度のマスをもう一度押しても消える。',
      },
      {
        term: '元に戻す・やり直す・クリア',
        desc: '塗る操作を 1 回ずつ戻せる。なぞった操作は 1 回分として扱う。クリアで全マスを Range 外に戻す。',
      },
      {
        term: 'Size',
        desc: '33%・50%・75%・125% は Call 後の Pot に対する割合。Raise の場合は現在の Bet 額にその分を足した額が to になる。入力欄とゲージで任意の Size に調整できる。',
      },
      { term: '下部のバー', desc: 'Range の大きさ（combos と 1326 combos に対する %）と、Range の中の各 Action の割合。' },
      {
        term: '送信',
        desc: '回答は 1 Spot につき 1 回で、送信後は変更できない。自分の投稿への回答も、他の回答者と同じく全体の集計に含まれる。',
      },
      {
        term: 'キー操作（PC）',
        desc: '← → で 1手戻る・進む、Home で最初、End で Spot。Hand History の Action を押すとその時点へ。Ctrl+Z で元に戻す、Ctrl+Y でやり直す。B でブラシ、E で消しゴム。',
      },
    ],
  },
  result: {
    id: 'result',
    title: '集計',
    items: [
      {
        term: '色',
        desc: 'マス内の色の割合が Action 頻度を表す（その Hand を Range 内とした回答者の平均）。赤は Fold、シアンは Check と Call、黄は Bet と Raise。',
      },
      { term: '濃さ', desc: 'その Hand を Range 内に含めた回答者の割合を 20% ごとの 5 段階で表す。薄いほど Range 外とした回答者が多い。' },
      { term: '白枠', desc: 'Hero の実際の Hand。' },
      {
        term: '上部のバー',
        desc: '全体と自分の Range の大きさ（combos と 1326 combos に対する %）と、Range の中の各 Action の割合。全体は Range 内とした回答者の割合で重み付けしている。',
      },
      { term: 'タブ', desc: '全体・自分・自分との差を切り替えられる。マスを選ぶと内訳（全体と自分のバー）が表示される。' },
      {
        term: '自分との差',
        desc: '自分と全体の頻度（Range 外を含む）の違いの大きさを黄の濃さで表す。0% は全体と同じ、100% はまったく違う。正解・不正解ではない。',
      },
      { term: '次の Spot', desc: '未回答の Spot のうち最も新しいものへ進む。' },
      { term: 'Hand History', desc: 'Hand を最後まで再生し、Showdown の Hand を確認できる。再生の操作は「|◀」で 1手戻る、「▶」で再生（再生中は「❚❚」で一時停止）、「▶|」で 1手進む。Spot の局面に来ると、卓の Hero の席が黄に光り「SPOT」が出る。進み具合のバーの黄の目盛りが Spot の位置。' },
      {
        term: 'キー操作（PC）',
        desc: '← → で 1手戻る・進む、Home で最初、End で最後。Hand History の Action を押すとその時点へ。表のマスにマウスを乗せると内訳がそのマスになる（押すと固定）。',
      },
    ],
  },
  new: {
    id: 'new',
    title: 'Post',
    items: [
      {
        term: '画像読み込み',
        desc: 'T4 の Hand History 画像を端末内で OCR する。読み取り結果は画像と見比べて直してから反映する。Flop 以降に Hero の Action がない Hand は読み込めない。画像は読み取り後に削除され、保存も送信もされない。',
      },
      {
        term: '基本設定',
        desc: 'Cash Game では Ante と Rake を任意で入力する。MTT では Rake は入力できない。Action 入力後は変更できない。',
      },
      {
        term: 'Player と Hand',
        desc: '最初に人数（2〜6 人）を選ぶ。人数を減らすと早い席から空く（2 人は BTN と BB で、BTN が SB を払う）。分かっている Hand のみ入力する。Hero の Hand は必須。Fold した席でも判明していれば入力できる。Hand 欄を押すと Card キーボード（PC は Card の選択ボード）が表示される。',
      },
      {
        term: 'Card キーボード',
        desc: 'Q キーはタップで Q、押したまま上で K・左で T・下で J。♠ キーはタップで ♠、上で ♥・左で ♦・下で ♣。C で席の Hand をクリア、⌫ で 1 文字削除。← → で前後の席へ移る。使用済みの Card は入力できない。',
      },
      {
        term: 'Card の選択ボード（PC）',
        desc: '押した Card が入り、2 枚そろうと次の Hand が空の席へ進む。選んだ Card をもう一度押すと外れる。キーでも打てる（例 A → s）。← → で前後の席、Enter で閉じる。使用済みの Card は押せない。',
      },
      { term: 'Showdown', desc: 'Hand が入力されていない席は Muck として扱う。' },
      {
        term: 'Action 入力',
        desc: '額はよく使う額のボタン（Open は bb、3bet・Raise は直前の額の倍率、Flop 以降の Bet は % pot）か、額の欄（スマホは押すと縦のスライダー。なぞって選び、▲▼ で 0.1bb ずつ）で選び、Bet・Raise のボタンで入れる。Fold to・Check to の席を押すと、その席の手番までの Fold・Check をまとめて入れる。その Spot で取れない Action は非活性になる。ボタンの名前は Open・3bet・4bet・Limp など局面に合わせて変わる。Street が終わると Board 入力に進む。↶（1つ戻す）は Action だけを戻し、Board は残る。',
      },
      {
        term: '卓とログ',
        desc: '入力中の Hand を卓に表示する（Hero が手前、手番の席が光る）。卓の Board の Card を押すとその Card 以降を、ログの Action を押すとその Action 以降を入れ直せる。スマホのログは「History」で開く。台の ↶ で 1 つ戻し、↷ で戻した Action を入れ直す。ごみ箱ですべて消す。PC は Ctrl+Z で 1 つ戻し、Ctrl+Y で入れ直す。',
      },
      {
        term: 'Spot',
        desc: 'Hero の Flop 以降の手番を 1 つ選ぶ（Preflop は出題できない）。回答者はその手番で Hero の席から Range を答え、回答後に Hero が実際に取った Action と Hand が表示される。',
      },
      {
        term: '下書き',
        desc: '投稿の画面を離れるときに、入力を下書きに保存するか聞く（3 件まで。いっぱいのときはどれかを削除してから保存）。保存した下書きはヘッダーの下書きのボタンから開く。',
      },
    ],
  },
  drafts: {
    id: 'drafts',
    title: '下書き',
    items: [
      {
        term: '下書き',
        desc: '投稿の入力を 3 件まで、この端末のブラウザに保存できる（ほかの端末とは共有されない）。選ぶと続きから入力できる。下書きから投稿すると、その下書きは消える。',
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

import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { InfoModal } from '../components/InfoModal.tsx';
import { Link } from '../components/Link.tsx';
import { Select } from '../components/Select.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { useToast } from '../components/Toast.tsx';
import { INFO_SECTIONS, type InfoSectionId } from '../info/infoSections.ts';
import { useIsMobile } from '../useMediaQuery.ts';
import './dev.css';

/**
 * 部品一覧（開発時だけ。`/_dev/ui`）。T-104 の表示確認と自己レビューに使う。
 * 本番ビルドには含まれない（App が `import.meta.env.DEV` のときだけ lazy で読み込む）。
 * 開発者向けのページなので、画面上の説明文の禁止（不変条件 1）の対象外。
 */
export default function DevUiScreen(): JSX.Element {
  const toast = useToast();
  const mobile = useIsMobile();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [street, setStreet] = useState<'all' | 'pf' | 'flop' | 'turn' | 'river'>('all');
  const [sort, setSort] = useState<'new' | 'many'>('new');
  const [confirm, setConfirm] = useState<null | 'normal' | 'danger'>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<InfoSectionId | null>(null);

  return (
    <section className="screen dev">
      <h1 className="sec-h">部品一覧（開発用）</h1>
      <p className="mono-lbl">layout: {mobile ? 'mobile (<700px)' : 'pc (>=700px)'}</p>

      <h2 className="sec-h">ボタン</h2>
      <div className="dev-grid">
        <button type="button" className="btn">投稿する</button>
        <button type="button" className="btn" disabled>
          投稿中…
        </button>
        <button type="button" className="btn ghost">再読み込み</button>
        <button type="button" className="btn red">削除</button>
      </div>

      <h2 className="sec-h">タブ</h2>
      <Tabs
        label="一覧のタブ"
        items={[
          { value: 'all', label: 'すべて' },
          { value: 'mine', label: '自分の投稿' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <h2 className="sec-h">カスタムセレクト</h2>
      <div className="dev-grid">
        <Select
          label="ストリート"
          options={[
            { value: 'all', label: 'すべてのストリート' },
            { value: 'pf', label: 'プリフロップ' },
            { value: 'flop', label: 'フロップ' },
            { value: 'turn', label: 'ターン' },
            { value: 'river', label: 'リバー' },
          ]}
          value={street}
          onChange={setStreet}
        />
        <Select
          label="並び替え"
          options={[
            { value: 'new', label: '新着順' },
            { value: 'many', label: '回答数順' },
          ]}
          value={sort}
          onChange={setSort}
        />
      </div>

      <h2 className="sec-h">入力</h2>
      <div className="dev-grid">
        <input className="inp" placeholder="タイトル" />
        <div>
          <input className="inp" aria-invalid="true" defaultValue="0.0001" />
          <p className="form-err">小数第 3 位まで</p>
        </div>
      </div>

      <h2 className="sec-h">面取りプレート / ブラケット</h2>
      <div className="dev-grid">
        <div className="plate">
          <p className="mono-lbl">pot</p>
          <p className="num dev-big">22.1bb</p>
        </div>
        <div className="bracket-hero">
          <span className="brk tl" aria-hidden="true" />
          <span className="brk br" aria-hidden="true" />
          <p className="mono-lbl">villain</p>
          <p className="dev-word">RAISE</p>
        </div>
      </div>

      <h2 className="sec-h">アクション色</h2>
      <div className="dev-swatches">
        {(['fold', 'check', 'call', 's1', 'off'] as const).map((k) => (
          <span key={k} className="dev-swatch">
            <span className={`act-swatch ${k}`} />
            <span className="mono-lbl">{k}</span>
          </span>
        ))}
      </div>

      <h2 className="sec-h">ダイアログ / トースト</h2>
      <div className="dev-grid">
        <button type="button" className="btn ghost" onClick={() => setConfirm('normal')}>
          確認ダイアログ
        </button>
        <button type="button" className="btn ghost" onClick={() => setConfirm('danger')}>
          削除の確認
        </button>
        <button type="button" className="btn ghost" onClick={() => toast('通信に失敗しました')}>
          トースト（エラー）
        </button>
        <button type="button" className="btn ghost" onClick={() => toast('レンジ外', 'notice')}>
          トースト（スポイト）
        </button>
      </div>

      <h2 className="sec-h">インフォメーション</h2>
      <div className="dev-grid">
        {(Object.keys(INFO_SECTIONS) as InfoSectionId[]).map((id) => (
          <button key={id} type="button" className="btn ghost" onClick={() => setInfo(id)}>
            {INFO_SECTIONS[id].title}
          </button>
        ))}
      </div>

      <h2 className="sec-h">アプリの状態</h2>
      <div className="dev-links">
        {['booting', 'signedOut', 'unavailable', 'maintenance', 'offline'].map((s) => (
          <a key={s} href={`/?devstate=${s}`}>
            {s}
          </a>
        ))}
        <Link to="/s/demo/answer">/s/demo/answer</Link>
        <Link to="/nope">404</Link>
      </div>

      {confirm === 'normal' && (
        <ConfirmDialog
          title="送信しますか"
          body="回答は送信後に変更できません。"
          confirmLabel="送信する"
          busy={busy}
          onConfirm={() => {
            setBusy(true);
            window.setTimeout(() => {
              setBusy(false);
              setConfirm(null);
            }, 1200);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'danger' && (
        <ConfirmDialog
          title="アカウントを削除しますか"
          body="投稿と回答がすべて削除されます。元には戻せません。"
          confirmLabel="削除する"
          destructive
          onConfirm={() => setConfirm(null)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {info && <InfoModal section={INFO_SECTIONS[info]} onClose={() => setInfo(null)} />}
    </section>
  );
}

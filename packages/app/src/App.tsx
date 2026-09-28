import { lazy, Suspense, useState, type ReactNode } from 'react';
import { APP_STATES, type AppState } from './appState.ts';
import { useAuth } from './auth/useAuth.ts';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { Header, type HeaderTitle } from './components/Header.tsx';
import { InfoModal } from './components/InfoModal.tsx';
import { useToast } from './components/Toast.tsx';
import { LegalScreen } from './legal/LegalScreen.tsx';
import { useLeaveGuard } from './post/draftStore.ts';
import { INFO_SECTIONS, infoSectionFor, type InfoSectionId } from './info/infoSections.ts';
import { useLocation, useRoute, useScrollTopOnNavigate, type Route } from './router.ts';
import { BootScreen } from './screens/BootScreen.tsx';
import { ListScreen } from './screens/ListScreen.tsx';
import { NewPostScreen } from './screens/NewPostScreen.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';
import { SpotScreen } from './screens/SpotScreen.tsx';
import { StatusScreen } from './screens/StatusScreen.tsx';

// 部品一覧は開発時だけ読み込む（本番ビルドには含めない）
const DevUiScreen = import.meta.env.DEV ? lazy(() => import('./dev/DevUiScreen.tsx')) : null;

/**
 * 開発時だけ、クエリ `?devstate=maintenance` などで全画面の状態を強制して表示を確かめられるようにする。
 * 本番ビルドでは `import.meta.env.DEV` が false になり、この分岐ごと消える。
 */
function devStateFrom(search: string): AppState | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(search).get('devstate');
  return APP_STATES.find((s) => s === v) ?? null;
}

const reload = (): void => window.location.reload();

/**
 * ヘッダーに出す画面名（06 章 §0.2）。回答・結果は投稿のタイトルを、規約は文書の題を本文の h1 にするので、
 * 画面名は見出しにしない。
 */
const SCREEN_TITLE: Partial<Record<Route['name'], HeaderTitle>> = {
  list: { text: 'スポット一覧', heading: true },
  new: { text: 'スポット投稿', heading: true },
  answer: { text: '回答', heading: false },
  result: { text: '結果', heading: false },
  terms: { text: '利用規約', heading: false },
  privacy: { text: 'プライバシーポリシー', heading: false },
};

export function App(): JSX.Element {
  const route = useRoute();
  const { pathname, search } = useLocation();
  useScrollTopOnNavigate(pathname);

  const auth = useAuth();
  const state = devStateFrom(search) ?? auth.state;

  const [info, setInfo] = useState<InfoSectionId | null>(null);
  const [deleting, setDeleting] = useState<{ busy: boolean } | null>(null);
  const toast = useToast();

  const confirmDeleteAccount = (): void => {
    setDeleting({ busy: true });
    void auth.deleteAccount().then((ok) => {
      setDeleting(null);
      if (!ok) toast('削除できませんでした');
    });
  };

  if (state === 'booting') return <BootScreen />;

  const isLegal = route.name === 'terms' || route.name === 'privacy';
  const showBack = isLegal || (state === 'ready' && route.name !== 'list' && route.name !== 'notFound');

  let body: ReactNode;
  if (isLegal) body = <RouteScreen route={route} />;
  else if (state === 'signedOut')
    body = <LoginScreen onLogin={auth.signIn} busy={auth.signingIn} failed={auth.loginFailed} />;
  else if (state === 'unavailable')
    body = (
      <StatusScreen title="このアカウントは利用できません" actionLabel="ログアウト" tone="error" onAction={() => void auth.signOut()} />
    );
  else if (state === 'maintenance')
    body = <StatusScreen title="メンテナンス中" actionLabel="再読み込み" tone="warn" onAction={reload} />;
  else if (state === 'offline')
    body = <StatusScreen title="オフラインです" actionLabel="再読み込み" tone="warn" onAction={reload} />;
  else body = <RouteScreen route={route} />;

  const infoTitle = info === 'login' && state !== 'signedOut' ? 'WWYD' : undefined;

  return (
    <>
      <Header
        title={state === 'ready' || isLegal ? SCREEN_TITLE[route.name] : undefined}
        back={showBack}
        showAccount={state === 'ready'}
        onInfo={(menuOpen) => setInfo(infoSectionFor(state, route.name, menuOpen))}
        onLogout={() => void auth.signOut()}
        onDeleteAccount={() => setDeleting({ busy: false })}
      />
      <DraftLeaveGuard />
      <main className="app-main">
        {body}
      </main>
      {deleting && state === 'ready' && (
        <ConfirmDialog
          title="アカウントを削除しますか"
          body="投稿と回答がすべて削除されます。元には戻せません。"
          confirmLabel="削除する"
          busyLabel="削除中…"
          destructive
          busy={deleting.busy}
          onConfirm={confirmDeleteAccount}
          onCancel={() => setDeleting(null)}
        />
      )}
      {info && <InfoModal section={INFO_SECTIONS[info]} title={infoTitle} onClose={() => setInfo(null)} />}
    </>
  );
}

function RouteScreen(props: { route: Route }): JSX.Element {
  const { route } = props;
  switch (route.name) {
    case 'list':
      return <ListScreen />;
    case 'new':
      return <NewPostScreen />;
    case 'spot':
    case 'answer':
    case 'result':
      // 同じ位置・同じ部品にして、振り分けの置き換え遷移で読み込み直さない
      return <SpotScreen key={route.id} id={route.id} view={route.name} />;
    case 'terms':
      return <LegalScreen doc="terms" />;
    case 'privacy':
      return <LegalScreen doc="privacy" />;
    case 'devUi':
      return DevUiScreen ? (
        <Suspense fallback={null}>
          <DevUiScreen />
        </Suspense>
      ) : (
        <NotFoundScreen />
      );
    case 'notFound':
      return <NotFoundScreen />;
  }
}

/** 投稿の下書きがあるうちは、タブを閉じる・再読み込みの前に離脱確認を出す（06 章 §3.2。どの画面にいても） */
function DraftLeaveGuard(): null {
  useLeaveGuard();
  return null;
}

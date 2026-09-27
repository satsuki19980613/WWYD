import { lazy, Suspense, useState, type ReactNode } from 'react';
import { APP_STATES, type AppState } from './appState.ts';
import { useAuth } from './auth/useAuth.ts';
import { BackLink } from './components/BackLink.tsx';
import { Header } from './components/Header.tsx';
import { InfoModal } from './components/InfoModal.tsx';
import { INFO_SECTIONS, infoSectionFor, type InfoSectionId } from './info/infoSections.ts';
import { useLocation, useRoute, useScrollTopOnNavigate, type Route } from './router.ts';
import { BootScreen } from './screens/BootScreen.tsx';
import { ListScreen } from './screens/ListScreen.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';
import { ScreenStub } from './screens/ScreenStub.tsx';
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

export function App(): JSX.Element {
  const route = useRoute();
  const { pathname, search } = useLocation();
  useScrollTopOnNavigate(pathname);

  const auth = useAuth();
  const state = devStateFrom(search) ?? auth.state;

  const [info, setInfo] = useState<InfoSectionId | null>(null);

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
        showAccount={state === 'ready'}
        onInfo={(menuOpen) => setInfo(infoSectionFor(state, route.name, menuOpen))}
        onLogout={() => void auth.signOut()}
      />
      <main className="app-main">
        {showBack && <BackLink />}
        {body}
      </main>
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
      return <ScreenStub title="スポット投稿" />;
    case 'spot':
      // P6（T-601）で get_post_detail の viewer により answer / result へ置き換え遷移する
      return <BootScreen />;
    case 'answer':
      return <ScreenStub title="回答" />;
    case 'result':
      return <ScreenStub title="集計" />;
    case 'terms':
      return <ScreenStub title="利用規約" />;
    case 'privacy':
      return <ScreenStub title="プライバシーポリシー" />;
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

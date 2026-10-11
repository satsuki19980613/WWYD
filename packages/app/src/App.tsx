import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { APP_STATES, type AppState } from './appState.ts';
import { useAuth, type Auth } from './auth/useAuth.ts';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Header, type HeaderTitle, type NavItem } from './components/Header.tsx';
import { useHeaderTitle } from './components/headerTitle.ts';
import { InfoModal } from './components/InfoModal.tsx';
import { useToast } from './components/Toast.tsx';
import { LegalScreen } from './legal/LegalScreen.tsx';
import { LeaveDraftDialog } from './post/DraftDialogs.tsx';
import { useLeaveGuard } from './post/draftStore.ts';
import { clearDrafts, setActiveUser, useSavedDrafts } from './post/savedDrafts.ts';
import { clearPresets } from './reads/readPresets.ts';
import { DraftsScreen } from './screens/DraftsScreen.tsx';
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
  list: { text: 'List', heading: true },
  new: { text: 'Post', heading: true },
  drafts: { text: '下書き', heading: true },
  answer: { text: '回答', heading: false },
  result: { text: '結果', heading: false },
  terms: { text: '利用規約', heading: false },
  privacy: { text: 'プライバシーポリシー', heading: false },
};

/** 回答・結果の画面か（ヘッダーとタブの名前を投稿のタイトルにする） */
const isSpotRoute = (name: Route['name']): boolean => name === 'answer' || name === 'result';
const isLegalRoute = (name: Route['name']): boolean => name === 'terms' || name === 'privacy';

/** ヘッダーのナビで今いる項目（ログイン前などはナビを出さない） */
function navOf(state: AppState, name: Route['name']): NavItem | undefined {
  if (state !== 'ready') return undefined;
  return name === 'list' || name === 'new' ? name : null;
}

/** 使える状態でないときの画面（ready・booting は null。booting は先に起動中の画面を出す） */
function statusBody(state: AppState, auth: Auth): ReactNode {
  switch (state) {
    case 'signedOut':
      return <LoginScreen onLogin={auth.signIn} busy={auth.signingIn} failed={auth.loginFailed} expired={auth.sessionExpired} />;
    case 'unavailable':
      return <StatusScreen title="このアカウントは利用できません" actionLabel="ログアウト" tone="error" onAction={() => void auth.signOut()} />;
    case 'maintenance':
      return <StatusScreen title="メンテナンス中" actionLabel="再読み込み" tone="warn" onAction={reload} />;
    case 'offline':
      return <StatusScreen title="オフラインです" actionLabel="再読み込み" tone="warn" onAction={reload} />;
    default:
      return null;
  }
}

export function App(): JSX.Element {
  const route = useRoute();
  const { pathname, search } = useLocation();
  useScrollTopOnNavigate(pathname);

  const auth = useAuth();
  const state = devStateFrom(search) ?? auth.state;
  // 下書きはログインしている利用者ごと（14 章 §3.5）
  const draftUser = state === 'ready' ? auth.userId : null;
  useEffect(() => setActiveUser(draftUser), [draftUser]);
  const drafts = useSavedDrafts();
  const postTitle = useHeaderTitle();
  // ブラウザのタブ・履歴の名前を画面ごとに（F-035）。回答・結果は投稿のタイトル。ログイン前などは WWYD だけ
  const screenName = state === 'ready' || isLegalRoute(route.name) ? SCREEN_TITLE[route.name]?.text : undefined;
  const tabTitle = isSpotRoute(route.name) && postTitle ? postTitle : screenName;
  useEffect(() => {
    document.title = tabTitle ? `${tabTitle} · WWYD` : 'WWYD';
  }, [tabTitle]);

  const [info, setInfo] = useState<InfoSectionId | null>(null);
  const [deleting, setDeleting] = useState<{ busy: boolean } | null>(null);
  const toast = useToast();

  const confirmDeleteAccount = (): void => {
    setDeleting({ busy: true });
    const uid = auth.userId;
    void auth.deleteAccount().then((ok) => {
      setDeleting(null);
      if (!ok) toast('削除できませんでした');
      else if (uid) {
        clearDrafts(uid);
        clearPresets(uid);
      }
    });
  };

  if (state === 'booting') return <BootScreen />;

  const isLegal = isLegalRoute(route.name);
  const showBack = isLegal || (state === 'ready' && route.name !== 'list' && route.name !== 'notFound');

  // 規約はログインの状態によらず読める
  const body: ReactNode = (isLegal ? null : statusBody(state, auth)) ?? <RouteScreen route={route} />;

  const infoTitle = info === 'login' && state !== 'signedOut' ? 'WWYD' : undefined;

  return (
    <>
      <Header
        title={state === 'ready' || isLegal ? SCREEN_TITLE[route.name] : undefined}
        postTitle={state === 'ready' && isSpotRoute(route.name) ? postTitle : null}
        back={showBack}
        nav={navOf(state, route.name)}
        showAccount={state === 'ready'}
        drafts={state === 'ready' ? drafts.length : undefined}
        onInfo={(menuOpen) => setInfo(infoSectionFor(state, route.name, menuOpen))}
        onLogout={() => void auth.signOut()}
        onDeleteAccount={() => setDeleting({ busy: false })}
      />
      <DraftLeaveGuard />
      <LeaveDraftDialog active={state === 'ready' && route.name === 'new'} />
      <main className="app-main">
        {/* 画面の中身が落ちてもヘッダーは残し、別の画面へ移れば元に戻す（F-004） */}
        <ErrorBoundary resetKey={`${pathname}${search}`}>{body}</ErrorBoundary>
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

function RouteScreen(props: Readonly<{ route: Route }>): JSX.Element {
  const { route } = props;
  switch (route.name) {
    case 'list':
      return <ListScreen />;
    case 'new':
      return <NewPostScreen />;
    case 'drafts':
      return <DraftsScreen />;
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

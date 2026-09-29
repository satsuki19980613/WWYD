import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { ChevronIcon, TrashIcon } from '../components/Icons.tsx';
import { Link } from '../components/Link.tsx';
import { formatAgo } from '../list/spotList.ts';
import { openDraft } from '../post/draftStore.ts';
import { activeUser, deleteDraft, draftSummary, MAX_DRAFTS, useSavedDrafts, type SavedDraft } from '../post/savedDrafts.ts';
import { navigate } from '../router.ts';

/**
 * 下書き（14 章 §3.5）。ヘッダーの右の下書きのボタンから開く。保存した下書き（3 件まで。新しい順）を選ぶと、
 * 投稿の画面で続きから入力する。削除は確認してから。
 */
export function DraftsScreen(): JSX.Element {
  const drafts = useSavedDrafts();
  const [deleting, setDeleting] = useState<SavedDraft | null>(null);
  const now = Date.now();

  if (drafts.length === 0) {
    return (
      <section className="screen drafts">
        <div className="list-empty">
          <p className="list-empty-label">下書きなし</p>
          <Link to="/new" className="btn auto">
            Post
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="screen drafts">
      <p className="drafts-count num">
        {drafts.length} / {MAX_DRAFTS}
      </p>
      <div className="spot-grid">
        {drafts.map((e) => {
          const s = draftSummary(e.draft);
          return (
            <article key={e.id} className="spot-card">
              <div className="spot-top">
                <span className="spot-fmt num">{formatAgo(e.savedAt, now)}に保存</span>
                {/* 削除は一覧のカードと同じく右上（2026-09-29） */}
                <button type="button" className="spot-del" aria-label="削除" onClick={() => setDeleting(e)}>
                  <TrashIcon />
                </button>
              </div>
              <h2 className="spot-title">
                <a
                  href="/new"
                  className="spot-link"
                  onClick={(ev) => {
                    ev.preventDefault();
                    openDraft(e.draft, e.id);
                    navigate('/new');
                  }}
                >
                  {s.title}
                </a>
              </h2>
              <p className="spot-seats num">{s.meta}</p>
              <div className="spot-foot">
                <span />
                <span className="spot-go primary" aria-hidden="true">
                  開く
                  <ChevronIcon />
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {deleting && (
        <ConfirmDialog
          title="この下書きを削除しますか"
          body="元には戻せません。"
          confirmLabel="削除する"
          destructive
          onConfirm={() => {
            const uid = activeUser();
            if (uid) deleteDraft(uid, deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

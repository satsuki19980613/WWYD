import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Modal } from '../components/Modal.tsx';
import { useToast } from '../components/Toast.tsx';
import { formatAgo } from '../list/spotList.ts';
import { navigate, setNavigationBlocker } from '../router.ts';
import { draftSlot, getDraft, markSaved, needsSave, resetDraft } from './draftStore.ts';
import { activeUser, deleteDraft, draftSummary, MAX_DRAFTS, saveDraft, useSavedDrafts, type SavedDraft } from './savedDrafts.ts';

/**
 * 投稿の画面を離れるときの確認（14 章 §3.5）。`active` は投稿の画面を開いている間。
 * 保存していない入力があれば遷移を止めて「下書きに保存しますか」を出す（保存する / 保存しない / やめる）。
 * 下書きが 3 件あって新しく保存できなければ、どれかを消すダイアログを出し、消したら保存して進む。
 * 入力が無い・保存済みから変わっていなければ聞かずに、入力を空に戻して進む。
 */
export function LeaveDraftDialog(props: { active: boolean }): JSX.Element | null {
  const [pending, setPending] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!props.active) return;
    setNavigationBlocker((to) => {
      if (!needsSave()) {
        resetDraft();
        return false;
      }
      setPending(to);
      return true;
    });
    return () => setNavigationBlocker(null);
  }, [props.active]);

  if (pending === null) return null;

  const proceed = (): void => {
    const to = pending;
    setPending(null);
    setFull(false);
    resetDraft();
    navigate(to, { force: true });
  };
  const save = (): void => {
    const uid = activeUser();
    const r = uid ? saveDraft(uid, getDraft(), draftSlot()) : ({ ok: false, reason: 'unavailable' } as const);
    if (r.ok) {
      markSaved(r.id);
      proceed();
    } else if (r.reason === 'full') {
      setFull(true);
    } else {
      toast('下書きを保存できませんでした');
    }
  };

  if (full) {
    return (
      <DraftsFullDialog
        onDelete={(id) => {
          const uid = activeUser();
          if (uid) deleteDraft(uid, id);
          save();
        }}
        onCancel={() => setFull(false)}
      />
    );
  }
  return <SaveDialog onSave={save} onDiscard={proceed} onCancel={() => setPending(null)} />;
}

function SaveDialog(props: { onSave: () => void; onDiscard: () => void; onCancel: () => void }): JSX.Element {
  const saveRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title="下書きに保存しますか"
      tone="confirm"
      role="alertdialog"
      onClose={props.onCancel}
      initialFocus={saveRef}
      footer={
        <div className="draft-dlg-btns">
          <button ref={saveRef} type="button" className="btn" onClick={props.onSave}>
            保存する
          </button>
          <button type="button" className="btn ghost red-text" onClick={props.onDiscard}>
            保存しない
          </button>
          <button type="button" className="btn ghost" onClick={props.onCancel}>
            やめる
          </button>
        </div>
      }
    >
      <p className="confirm-body">下書きは {MAX_DRAFTS} 件まで、この端末に保存できます。</p>
    </Modal>
  );
}

/** 下書きがいっぱい（3 件）: どれかを消すと、消したあとに保存して進む */
function DraftsFullDialog(props: { onDelete: (id: string) => void; onCancel: () => void }): JSX.Element {
  const drafts = useSavedDrafts();
  const [target, setTarget] = useState<SavedDraft | null>(null);
  const now = Date.now();
  if (target) {
    return (
      <ConfirmDialog
        title="この下書きを削除しますか"
        body={`「${draftSummary(target.draft).title}」を削除して、今の入力を保存します。`}
        confirmLabel="削除して保存"
        destructive
        onConfirm={() => props.onDelete(target.id)}
        onCancel={() => setTarget(null)}
      />
    );
  }
  return (
    <Modal
      title="下書きがいっぱいです"
      tone="danger"
      role="alertdialog"
      onClose={props.onCancel}
      footer={
        <button type="button" className="btn ghost" onClick={props.onCancel}>
          やめる
        </button>
      }
    >
      <p className="confirm-body">保存するには、下書きを 1 件削除してください。</p>
      <ul className="draft-pick">
        {drafts.map((e) => {
          const s = draftSummary(e.draft);
          return (
            <li key={e.id}>
              <div className="draft-pick-text">
                <b>{s.title}</b>
                <span className="num">
                  {s.meta} · {formatAgo(e.savedAt, now)}
                </span>
              </div>
              <button type="button" className="btn red auto sm" onClick={() => setTarget(e)}>
                削除
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

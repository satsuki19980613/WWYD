import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../components/Modal.tsx';
import { isDirty, PREFLOP_ALLIN } from './draft.ts';
import { getDraft, setDraft } from './draftStore.ts';
import { NO_SPOT_MESSAGE, ocrPostability, reviewFromOcr, type Review } from './ocrDraft.ts';
import { OcrReview } from './OcrReview.tsx';
import { ErrorList } from './SpotSection.tsx';
import { T4_GAME_ORDER, T4_GAMES, type T4Game } from './t4Games.ts';

/**
 * 「T4ハンドヒストリー画像を読み込む」（06 章 §3.9）。
 * ゲームの種類（通常 / エキスパート）を選ぶ → ファイル選択 → 「読み取り中…」（キャンセルできる）
 * → 確認画面（OcrReview。画像と見比べて直す）→ 反映。
 * 入力中の内容があれば、ゲームを選ぶダイアログで置き換わることを示す。
 * 投稿できないハンド（Hero のフロップ以降のアクションが無い、Preflop でだれかが All-in になった）は、確認画面を開かずにエラーを出す。
 * 読めなかった所はエラーとして並べ、読めたところまでフォームに入れる。
 * OCR の本体（tesseract.js）はここで初めて読み込む。画像はメモリの中だけで扱う（runOcr.ts）。
 */
export function OcrImport(props: { button?: boolean; slot?: HTMLElement | null; onApplied?: () => void }): JSX.Element {
  const showButton = props.button ?? true;
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const game = useRef<T4Game>('normal');
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [review, setReview] = useState<{ initial: Review; imageUrl: string } | null>(null);
  const imageUrl = useRef<string | null>(null);
  const mounted = useRef(true);

  // 確認画面を閉じたら画像の Object URL を破棄する（画像の参照を残さない）
  const closeReview = (): void => {
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = null;
    setReview(null);
  };

  // 読み取り中や確認画面のまま画面を離れたら、読み取りを止めて画像の Object URL も破棄する（不変条件 5。リリース前レビュー R3-2）
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      abort.current = null;
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = null;
    };
  }, []);

  const pick = (g: T4Game): void => {
    game.current = g;
    setChoosing(false);
    input.current?.click();
  };

  const onFile = (file: File | undefined): void => {
    if (input.current) input.current.value = ''; // 同じ画像をもう一度選べるように、参照も残さない
    if (!file) return;
    const controller = new AbortController();
    abort.current = controller;
    const chosen = game.current;
    setBusy(true);
    setErrors([]);
    void (async () => {
      try {
        const { runOcr } = await import('../ocr/runOcr.ts');
        const result = await runOcr(file, controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        const postable = result.problems.some((p) => p.code === 'not_six_players')
          ? 'unreadable'
          : ocrPostability(result, getDraft(), chosen);
        if (postable === 'unreadable') setErrors(['読み取れませんでした']);
        else if (postable === 'preflop_allin') setErrors([PREFLOP_ALLIN]);
        else if (postable === 'no_spot') setErrors([NO_SPOT_MESSAGE]);
        else {
          imageUrl.current = URL.createObjectURL(file);
          setReview({ initial: reviewFromOcr(result, chosen, getDraft().hero), imageUrl: imageUrl.current });
        }
      } catch {
        if (!controller.signal.aborted) setErrors(['読み取れませんでした']);
      } finally {
        // 取り消した後に次の読み取りを始めていたら、そちらの表示を消さない
        if (abort.current === controller) {
          abort.current = null;
          setBusy(false);
        }
      }
    })();
  };

  const cancel = (): void => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  };

  const buttonRow = showButton && (
        <div className="pf-ocr">
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setChoosing(true)}>
            T4 Hand History 画像を読み込む
          </button>
          <ErrorList errors={errors} />
        </div>
  );

  return (
    <>
      {/* ボタンは画面の中の置き場所（slot）へ映す。部品そのものは画面の外側に置き、PC とスマホの切り替えでも状態を保つ */}
      {props.slot === undefined ? buttonRow : props.slot && buttonRow ? createPortal(buttonRow, props.slot) : null}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        data-testid="ocr-file"
        onChange={(e) => onFile(e.currentTarget.files?.[0])}
      />
      {choosing && (
        <Modal title="T4 の Game" tone="confirm" onClose={() => setChoosing(false)}>
          {isDirty(getDraft()) && <p className="confirm-body">入力中の内容は画像の内容に置き換わります。</p>}
          <div className="pf-ocr-games">
            {T4_GAME_ORDER.map((g) => (
              <button key={g} type="button" className="btn ghost pf-ocr-game" onClick={() => pick(g)}>
                <span>{T4_GAMES[g].label}</span>
                <span className="pf-ocr-rake">
                  Rake {T4_GAMES[g].rakePct}%（{T4_GAMES[g].capBb}bb cap）
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {review && (
        <OcrReview
          initial={review.initial}
          imageUrl={review.imageUrl}
          base={getDraft()}
          onApply={(draft) => {
            setDraft(draft);
            closeReview();
            props.onApplied?.();
          }}
          onCancel={closeReview}
        />
      )}
      {busy && (
        <Modal
          title="読み取り中…"
          tone="info"
          showClose={false}
          onClose={cancel}
          footer={
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={cancel}>
                キャンセル
              </button>
            </div>
          }
        >
          <div className="pf-ocr-progress" aria-hidden="true" />
        </Modal>
      )}
    </>
  );
}

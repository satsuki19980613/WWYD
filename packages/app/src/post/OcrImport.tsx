import { useRef, useState } from 'react';
import { Modal } from '../components/Modal.tsx';
import { isDirty } from './draft.ts';
import { getDraft, setDraft } from './draftStore.ts';
import { applyOcr } from './ocrDraft.ts';
import { ErrorList } from './SpotSection.tsx';
import { applyT4Game, T4_GAME_ORDER, T4_GAMES, type T4Game } from './t4Games.ts';

/**
 * 「T4ハンドヒストリー画像を読み込む」（06 章 §3.9）。
 * ゲームの種類（通常 / エキスパート）を選ぶ → ファイル選択 → 「読み取り中…」（キャンセルできる）→ 反映。
 * 入力中の内容があれば、ゲームを選ぶダイアログで置き換わることを示す。
 * 読めなかった所はエラーとして並べ、読めたところまでフォームに入れる。
 * OCR の本体（tesseract.js）はここで初めて読み込む。画像はメモリの中だけで扱う（runOcr.ts）。
 */
export function OcrImport(): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const game = useRef<T4Game>('normal');
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

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
        if (controller.signal.aborted) return;
        const applied = applyOcr(applyT4Game(getDraft(), chosen), result);
        if (!applied.ok) setErrors(['読み取れませんでした']);
        else {
          setDraft(applied.draft);
          setErrors(applied.issues);
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

  return (
    <div className="pf-ocr">
      <button type="button" className="btn ghost" disabled={busy} onClick={() => setChoosing(true)}>
        T4ハンドヒストリー画像を読み込む
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        data-testid="ocr-file"
        onChange={(e) => onFile(e.currentTarget.files?.[0])}
      />
      <ErrorList errors={errors} />
      {choosing && (
        <Modal title="T4 のゲーム" tone="confirm" onClose={() => setChoosing(false)}>
          {isDirty(getDraft()) && <p className="confirm-body">入力中の内容は画像の内容に置き換わります。</p>}
          <div className="pf-ocr-games">
            {T4_GAME_ORDER.map((g) => (
              <button key={g} type="button" className="btn ghost pf-ocr-game" onClick={() => pick(g)}>
                <span>{T4_GAMES[g].label}</span>
                <span className="pf-ocr-rake">
                  レーキ {T4_GAMES[g].rakePct}%（{T4_GAMES[g].capBb}bb cap）
                </span>
              </button>
            ))}
          </div>
        </Modal>
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
    </div>
  );
}

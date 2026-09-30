import type { Pos, VillainRead } from '@wwyd/core';
import { useId, useState } from 'react';
import { Modal } from '../components/Modal.tsx';
import { activeUser } from '../post/savedDrafts.ts';
import { deletePreset, PRESET_NAME_MAX, savePreset, usePresets, type PresetResult } from './readPresets.ts';
import { isEmptyRead, readSummary } from './readsModel.ts';

const SAVE_ERROR: Record<Exclude<PresetResult, { ok: true }>['reason'], string> = {
  name: `名前を ${PRESET_NAME_MAX} 文字以内で入力してください`,
  empty: '保存する情報がありません',
  full: 'Preset がいっぱいです。どれかを削除してください',
  unavailable: 'この端末には保存できません',
};

/**
 * Villain の情報の Preset（詳細仕様 18 章 §2.5）。今の席の情報に名前を付けて保存し、保存したものを呼び出す・削除する。
 * 端末（localStorage）だけに保存する。
 */
export function PresetDialog(props: { seat: Pos; read: VillainRead; onApply: (read: VillainRead) => void; onClose: () => void }): JSX.Element {
  const presets = usePresets();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const uid = activeUser();

  const save = (): void => {
    if (!uid) return;
    const r = savePreset(uid, name, props.read);
    if (r.ok) {
      setName('');
      setError(null);
    } else setError(SAVE_ERROR[r.reason]);
  };

  return (
    <Modal title={`Preset · ${props.seat}`} tone="info" onClose={props.onClose}>
      <div className="pr-save">
        <label className="mono-lbl" htmlFor={nameId}>
          Name
        </label>
        <div className="pr-save-row">
          <input
            id={nameId}
            className="inp"
            autoComplete="off"
            value={name}
            placeholder="Preset の名前"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
          />
          <button type="button" className="btn ghost auto" disabled={isEmptyRead(props.read) || name.trim() === ''} onClick={save}>
            保存
          </button>
        </div>
        {error && (
          <p className="form-err" role="alert">
            {error}
          </p>
        )}
      </div>
      {presets.length > 0 && (
        <ul className="pr-list" aria-label="保存した Preset">
          {presets.map((p) => (
            <li key={p.id} className="pr-item">
              <span className="pr-text">
                <b className="pr-name">{p.name}</b>
                <span className="pr-sum">{readSummary(p.read) || '—'}</span>
              </span>
              <button type="button" className="btn ghost auto sm" aria-label={`${p.name} を呼び出す`} onClick={() => props.onApply(p.read)}>
                呼び出す
              </button>
              <button
                type="button"
                className="icon-btn pr-del"
                aria-label={`${p.name} を削除`}
                onClick={() => uid && deletePreset(uid, p.id)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

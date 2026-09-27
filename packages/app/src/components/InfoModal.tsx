import { useRef } from 'react';
import type { InfoSection } from '../info/infoSections.ts';
import { Modal } from './Modal.tsx';

/** ⓘ のインフォメーションモーダル（09 章）。見出し（dt）＋本文（dd）の定義リスト。閉じるボタンは「閉じる」。 */
export function InfoModal(props: { section: InfoSection; title?: string; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={props.title ?? props.section.title}
      tone="info"
      onClose={props.onClose}
      initialFocus={closeRef}
      showClose={false}
      footer={
        <button ref={closeRef} type="button" className="btn ghost" onClick={props.onClose}>
          閉じる
        </button>
      }
    >
      <dl className="info-list">
        {props.section.items.map((item) => (
          <div key={item.term} className="info-item">
            <dt>{item.term}</dt>
            <dd>{item.desc}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

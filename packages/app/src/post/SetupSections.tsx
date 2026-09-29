import { PLAYER_COUNTS, type PlayerCount, type Pos } from '@wwyd/core';
import { useId } from 'react';
import { ChipGroup } from '../components/ChipGroup.tsx';
import { PlayingCard } from '../components/PlayingCard.tsx';
import { POS_VAR } from '../components/posColor.ts';
import { handSlots } from './cardInput.ts';
import { isLocked, seatsOf, type Draft, type SettingField } from './draft.ts';

const FMT_ITEMS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mtt', label: 'MTT' },
] as const;

/** 数値の入力欄（ラベル付き）。不正な値は赤い枠。 */
function NumField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}): JSX.Element {
  const id = useId();
  return (
    <div className="pf-field">
      <label className="mono-lbl" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="inp num"
        inputMode="decimal"
        autoComplete="off"
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={props.invalid || undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

/** 基本設定（06 章 §3.3）。アクションを入れるとロック。 */
export function SettingsSection(props: {
  draft: Draft;
  invalid: readonly SettingField[];
  onChange: (patch: Partial<Draft>) => void;
}): JSX.Element {
  const { draft: d } = props;
  const locked = isLocked(d);
  const bad = (f: SettingField): boolean => props.invalid.includes(f);
  return (
    <section className="pf-sec" aria-labelledby="pf-settings">
      <h2 id="pf-settings" className="sec-h">
        基本設定
      </h2>
      <fieldset className="pf-fieldset" disabled={locked}>
        {/* 見出しは他の欄と同じく上に置く（横に置くと欄の左端が揃わない） */}
        <div className="pf-field">
          <span className="mono-lbl" aria-hidden="true">
            Game 形式
          </span>
          <ChipGroup
            label="Game 形式"
            variant="segment"
            items={FMT_ITEMS}
            value={d.fmt}
            onChange={(fmt) => props.onChange(fmt === 'mtt' ? { fmt, rake: '' } : { fmt })}
          />
        </div>
        <div className="pf-fields">
          <NumField label="SB（bb）" value={d.sb} invalid={bad('sb')} onChange={(sb) => props.onChange({ sb })} />
          <div className="pf-field">
            <span className="mono-lbl">BB（bb）</span>
            <span className="pf-static num">1</span>
          </div>
          <NumField label="Ante（bb）" value={d.ante} invalid={bad('ante')} onChange={(ante) => props.onChange({ ante })} />
          <NumField
            label="Rake（%）"
            value={d.fmt === 'mtt' ? '' : d.rake}
            disabled={d.fmt === 'mtt'}
            invalid={bad('rake')}
            onChange={(rake) => props.onChange({ rake })}
          />
        </div>
      </fieldset>
    </section>
  );
}

const COUNT_ITEMS = PLAYER_COUNTS.map((n) => ({ value: String(n) as `${PlayerCount}`, label: String(n) }));

/**
 * プレイヤーとハンド（06 章 §3.4）。人数（2〜6）を選ぶまで席の表は出さない（必須）。
 * 人数・スタック・Hero はロック対象、ハンドはいつでも入力できる。
 */
export function PlayersSection(props: {
  draft: Draft;
  invalid: readonly SettingField[];
  activeSeat: Pos | null;
  onChange: (patch: Partial<Draft>) => void;
  onPlayers: (n: PlayerCount) => void;
  onOpenHand: (seat: Pos) => void;
}): JSX.Element {
  const { draft: d } = props;
  const locked = isLocked(d);
  const seats = seatsOf(d);
  return (
    <section className="pf-sec" aria-labelledby="pf-players">
      <h2 id="pf-players" className="sec-h">
        Player と Hand
      </h2>
      <fieldset className="pf-fieldset" disabled={locked}>
        <div className="pf-field">
          <span className="mono-lbl" aria-hidden="true">
            人数
          </span>
          <ChipGroup
            label="人数"
            variant="segment"
            items={COUNT_ITEMS}
            value={(d.players === null ? '' : String(d.players)) as `${PlayerCount}`}
            onChange={(v) => props.onPlayers(Number(v) as PlayerCount)}
          />
        </div>
      </fieldset>
      {seats.length > 0 && (
      <div className="pf-players" role="table" aria-label="Player と Hand">
        <div className="pf-prow head" role="row">
          <span className="mono-lbl" role="columnheader">
            席
          </span>
          <span className="mono-lbl" role="columnheader">
            Stack（bb）
          </span>
          <span className="mono-lbl pf-ch" role="columnheader">
            Hand
          </span>
          <span className="mono-lbl pf-ch" role="columnheader">
            Hero
          </span>
        </div>
        {seats.map((p) => {
          const hero = d.hero === p;
          return (
            <div key={p} className={`pf-prow ${hero ? 'hero' : ''}`} role="row">
              <b className="pf-pos" role="cell" style={{ color: POS_VAR[p] }}>
                {p}
              </b>
              <span role="cell">
                <input
                  className="inp num pf-stack"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`${p} の Stack（bb）`}
                  value={d.stacks[p]}
                  disabled={locked}
                  aria-invalid={props.invalid.includes(p) || undefined}
                  onChange={(e) => props.onChange({ stacks: { ...d.stacks, [p]: e.target.value } })}
                />
              </span>
              <span role="cell">
                <HandButton seat={p} hand={d.hands[p]} active={props.activeSeat === p} onOpen={() => props.onOpenHand(p)} />
              </span>
              <span role="cell">
                <button
                  type="button"
                  role="radio"
                  aria-checked={hero}
                  aria-label={`Hero を ${p} にする`}
                  className="pf-radio"
                  disabled={locked}
                  onClick={() => props.onChange({ hero: p })}
                >
                  <span className="pf-radio-dot" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

/** ハンド欄（2 枠）。押すとカードキーボードを開く。入力中はシアンの枠。 */
export function HandButton(props: { seat: Pos; hand: string; active: boolean; onOpen: () => void }): JSX.Element {
  const slots = handSlots(props.hand);
  return (
    <button
      type="button"
      className={`pf-hand ${props.active ? 'active' : ''}`}
      data-seat={props.seat}
      data-keep-open
      aria-label={`${props.seat} の Hand`}
      aria-expanded={props.active}
      onClick={props.onOpen}
    >
      {slots.map((s, i) =>
        s.kind === 'card' ? (
          <PlayingCard key={i} card={s.card} size="sm" />
        ) : s.kind === 'rank' ? (
          <PlayingCard key={i} rank={s.rank} size="sm" />
        ) : (
          <span key={i} className="pcard-empty" />
        ),
      )}
    </button>
  );
}

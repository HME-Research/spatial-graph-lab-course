import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { bandIndex } from '@app/document';
import { bandStep, bandTrackRange, formatNumber, wholeNumbers, withAddedDivider, type StyleAttribute } from './designerModel';

/** At most this many dividers (the format allows 20). */
const MAX_DIVIDERS = 20;

export interface BandsEditorProps {
  readonly idBase: string;
  readonly attribute: Pick<StyleAttribute, 'label' | 'unit' | 'level'>;
  /** Stored dividers, ascending. */
  readonly dividers: readonly number[];
  /** Every room's value (rooms without one are left out). */
  readonly numbers: readonly number[];
  /** One committed change (release, Enter, ×, + Add divider) = one undo step. */
  readonly onCommit: (dividers: readonly number[]) => void;
  readonly onInvalid: (message: string) => void;
}

/**
 * Number bands (S3, 2026-11-19): a track with the rooms' values as dots and a draggable handle per
 * divider (pointer; ←/→ keys move by a round step), a number box per divider for exact values, ×
 * to remove one and "+ Add divider" to split the widest band. Room counts per band follow the
 * handles while dragging; the document changes only when a drag or key press ends.
 */
export function BandsEditor({ idBase, attribute, dividers, numbers, onCommit, onInvalid }: BandsEditorProps) {
  const [draft, setDraft] = useState<number[] | null>(null);
  const shown = draft ?? dividers;
  // The track's range follows the stored dividers, so it does not shift under the pointer while dragging.
  const range = useMemo(() => bandTrackRange(numbers, dividers), [numbers, dividers]);
  // Level and whole-number values (Degree, counts) move in whole steps.
  const whole = wholeNumbers(attribute, numbers);
  const step = bandStep(range, whole);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const span = range.max - range.min;
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - range.min) / span) * 100))}%`;
  const unit = attribute.unit ? ` ${attribute.unit}` : '';
  const text = (v: number) => (attribute.level ? `level ${formatNumber(v)}` : `${formatNumber(v)}${unit}`);

  const counts = useMemo(() => {
    const out = new Array<number>(shown.length + 1).fill(0);
    for (const n of numbers) out[bandIndex(shown, n)]!++;
    return out;
  }, [numbers, shown]);

  /**
   * `list` with divider `i` at `value` (snapped to the step unless `exact`; Level: whole storeys),
   * or null when it would reach a neighbour.
   */
  const moved = (list: readonly number[], i: number, value: number, exact = false): number[] | null => {
    const v = attribute.level ? Math.round(value) : exact ? value : Math.round(value / step) * step;
    const tidy = Number(v.toPrecision(12));
    const lo = list[i - 1];
    const hi = list[i + 1];
    if ((lo !== undefined && !(tidy > lo)) || (hi !== undefined && !(tidy < hi))) return null;
    return list.map((d, j) => (j === i ? tidy : d));
  };
  const commit = (next: readonly number[] | null) => {
    setDraft(null);
    if (next && next.some((d, i) => d !== dividers[i])) onCommit(next);
  };

  const valueAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return range.min;
    return range.min + ((clientX - rect.left) / rect.width) * span;
  };
  const onPointerDown = (i: number) => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    dragging.current = i;
    setDraft([...dividers]);
  };
  const onPointerMove = (i: number) => (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== i) return;
    setDraft((list) => moved(list ?? dividers, i, valueAt(e.clientX)) ?? list);
  };
  const onPointerUp = (i: number) => () => {
    if (dragging.current !== i) return;
    dragging.current = null;
    commit(draft);
  };
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
    if (delta === 0) return;
    e.preventDefault();
    setDraft((list) => {
      const base = list ?? dividers;
      return moved(base, i, base[i]! + delta) ?? base.slice();
    });
  };
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) commit(draft);
  };

  const added = withAddedDivider(numbers, dividers, whole);
  const edges = [range.min, ...shown, range.max];
  return (
    <section className="sgl-bands" aria-label={`${attribute.label} bands`}>
      <div className="sgl-bands-track" ref={track}>
        {edges.slice(1).map((hi, i) => (
          <span
            key={`seg-${i}`}
            className={`sgl-bands-segment sgl-bands-segment--${i % 2 === 0 ? 'even' : 'odd'}`}
            style={{ left: pct(edges[i]!), width: `calc(${pct(hi)} - ${pct(edges[i]!)})` }}
            title={`${counts[i]} ${counts[i] === 1 ? 'node' : 'nodes'}`}
          >
            <span className="sgl-bands-count">{counts[i]}</span>
          </span>
        ))}
        {numbers.map((n, i) => (
          <span key={`dot-${i}`} className="sgl-bands-dot" style={{ left: pct(n) }} aria-hidden="true" />
        ))}
        {shown.map((d, i) => (
          <div
            key={`handle-${i}`}
            className="sgl-bands-handle"
            role="slider"
            tabIndex={0}
            aria-label={`${attribute.label} divider ${i + 1}`}
            aria-valuemin={shown[i - 1] ?? range.min}
            aria-valuemax={shown[i + 1] ?? range.max}
            aria-valuenow={d}
            aria-valuetext={text(d)}
            style={{ left: pct(d) }}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove(i)}
            onPointerUp={onPointerUp(i)}
            onPointerCancel={onPointerUp(i)}
            onKeyDown={onKeyDown(i)}
            onKeyUp={onKeyUp}
            onBlur={() => draft && commit(draft)}
          />
        ))}
      </div>
      <p className="sgl-designer-source">
        Drag a divider (or use ← →); each dot is a node. Nodes exactly on a divider go in the band above it.
      </p>
      {shown.length > 0 && (
        <ol className="sgl-bands-list">
          {shown.map((d, i) => (
            <li key={`row-${i}-${dividers.length}`}>
              <DividerBox
                id={`${idBase}-divider-${i}`}
                label={`Divider ${i + 1}`}
                value={d}
                unit={attribute.level ? '' : attribute.unit ?? ''}
                onValue={(value) => {
                  const next = moved(dividers, i, value, true);
                  if (!next) onInvalid(`Divider ${i + 1} must stay between the dividers next to it.`);
                  else commit(next);
                }}
                onInvalid={onInvalid}
              />
              <button type="button" className="sgl-bands-remove" aria-label={`Remove divider ${i + 1} (${text(d)})`} title="Remove this divider: the band below it grows" onClick={() => commit(dividers.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="sgl-bands-add"
        disabled={!added || dividers.length >= MAX_DIVIDERS}
        title={added ? 'Split the widest band in two' : 'No band can be split further'}
        onClick={() => added && commit(added)}
      >
        + Add divider
      </button>
    </section>
  );
}

/** Exact value of one divider: committed on Enter or when leaving the box; Escape restores it. */
function DividerBox({ id, label, value, unit, onValue, onInvalid }: { readonly id: string; readonly label: string; readonly value: number; readonly unit: string; readonly onValue: (value: number) => void; readonly onInvalid: (message: string) => void }) {
  const shown = formatNumber(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (text.trim() === shown) return;
    const parsed = Number(text.trim().replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      onInvalid(`${label} must be a number.`);
      setText(shown);
      return;
    }
    onValue(parsed);
  };
  return (
    <span className="sgl-bands-box">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setText(shown);
        }}
        onBlur={commit}
      />
      {unit && <span className="sgl-bands-unit">{unit}</span>}
    </span>
  );
}

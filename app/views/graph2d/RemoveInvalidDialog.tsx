import { useEffect, useRef } from 'react';
import { checkedEdgeIds, removeSummary, type InvalidConnectionRow } from './invalidConnections';

/**
 * Review list for "Remove invalid connections" (wave 2, D): every unresolved relationship with
 * its rooms and reason, CHECKED by default; the student unchecks the ones to keep, sees the
 * preview (checked edges are marked in the diagram) and confirms. The host sends one
 * `remove-edges` command. Escape or Cancel closes it without any change.
 */
export function RemoveInvalidDialog({
  rows,
  unchecked,
  onToggle,
  onConfirm,
  onCancel,
}: {
  readonly rows: readonly InvalidConnectionRow[];
  readonly unchecked: ReadonlySet<number>;
  readonly onToggle: (edgeId: number, checked: boolean) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, []);
  const checked = checkedEdgeIds(rows, unchecked).length;
  return (
    <div
      ref={ref}
      className="sgl-invalid-dialog nodrag nopan nowheel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="sgl-invalid-title"
      data-invalid-rows={rows.length}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <h3 id="sgl-invalid-title">Remove invalid connections</h3>
      <p className="sgl-muted">
        These relationships cannot be built in the current design. Uncheck the ones you want to keep; the checked ones are
        marked in the diagram.
      </p>
      <ul className="sgl-invalid-list">
        {rows.map((r) => (
          <li key={r.edgeId}>
            <label data-edge-id={r.edgeId}>
              <input type="checkbox" checked={!unchecked.has(r.edgeId)} onChange={(e) => onToggle(r.edgeId, e.currentTarget.checked)} />
              <span>
                <strong>{r.label}</strong> · {r.kindLabel}
                <span className="sgl-invalid-reason">{r.reasonText}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="sgl-invalid-summary" aria-live="polite">
        {removeSummary(rows.length, checked)}
      </p>
      <div className="sgl-invalid-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="sgl-danger" onClick={onConfirm} disabled={checked === 0}>
          Remove {checked} selected
        </button>
      </div>
    </div>
  );
}

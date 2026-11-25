import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GraphIssue } from '@app/document';
import type { DesignCommand } from '@app/spatial';
import { IssueFeedback, RouteConfirm } from '@app/ui';
import type { CellEditorProps, CellMove } from '@app/views/data/cellEditing';
import { messageContextFor } from './panelSupport';
import { planGeometryEdit, type Triple } from './propertiesModel';
import { cellCommit, cellEditorSpec, type CellInput } from './tableCellModel';

/**
 * The editor of one Data-view table cell (Programme P4, worktree G), provided to the view through
 * `DataCellEditorContext` (wired in `Workspace`). Same models and command paths as Properties
 * (`tableCellModel.ts`): every edit is one validated command, so one undo step; a refused value
 * shows the readable reason and the cell returns to the stored value. A move/resize that would take
 * corridor cells asks for confirmation, like Properties.
 *
 * Keys: Enter applies, Tab applies and moves to the next editable cell (Shift+Tab: previous), Esc
 * cancels. Leaving the field (a click elsewhere) applies a typed value; a choice applies when picked.
 */

const OTHER = '\u0000other';
const toCoord = (t: Triple): [number, number, number] => [t[0], t[1], t[2]];

export function TableCellEditor({ design, project, collection, itemId, columnId, label, initialText, onClose, onFeedback }: CellEditorProps) {
  // Fixed when editing starts: the field never jumps while the student types.
  const [spec] = useState(() => cellEditorSpec(design.doc, project, collection, itemId, columnId));
  const [draft, setDraft] = useState(() => (spec?.kind === 'input' ? (initialText ?? spec.draft) : ''));
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);
  const closed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const select = useRef<HTMLSelectElement>(null);

  const close = (move: CellMove) => {
    if (closed.current) return;
    closed.current = true;
    onClose(move);
  };

  useEffect(() => {
    if (!spec) return close('stay');
    if (input.current && initialText === undefined) input.current.select();
    // Open the list at once (click or Enter started editing); ignored where unsupported.
    try {
      (select.current as (HTMLSelectElement & { showPicker?: () => void }) | null)?.showPicker?.();
    } catch {
      /* not allowed here: the list opens with Space / Alt+Down instead */
    }
    // Mount only: the editor lives for one edit.
  }, []);

  if (!spec) return null;

  const context = messageContextFor({ design, project, onSelect: () => undefined }, collection === 'nodes' ? itemId : undefined);
  const refuse = (issues: readonly GraphIssue[]) => onFeedback(<IssueFeedback issues={issues} context={context} onDismiss={() => onFeedback(null)} />);
  const run = (command: DesignCommand) => {
    const outcome = design.onCommand(command);
    if (outcome.ok) onFeedback(null);
    else refuse(outcome.issues);
  };

  const submit = (value: CellInput, move: CellMove) => {
    if (closed.current) return;
    const decision = cellCommit(design.doc, project, collection, itemId, columnId, value);
    // Editing ends whatever happens: the cell shows the stored value (refused values are never kept).
    close(move);
    switch (decision.kind) {
      case 'unchanged':
        return;
      case 'invalid':
        return refuse([decision.issue]);
      case 'command':
        return run(decision.command);
      case 'geometry': {
        const { nodeId, request, action } = decision;
        const geometry = { ...(request.position && { position: toCoord(request.position) }), ...(request.size && { size: toCoord(request.size) }) };
        const plan = planGeometryEdit(design.proposeEdit({ nodeId, ...geometry }), design.doc, nodeId);
        if (plan.kind === 'reject') return refuse(plan.issues);
        if (plan.kind === 'confirm')
          return onFeedback(
            <RouteConfirm
              relationships={plan.relationships}
              action={action}
              onCancel={() => onFeedback(null)}
              onConfirm={() => run({ type: 'set-node-geometry', nodeId, ...geometry, confirmRouteDisplacement: true })}
            />,
          );
        return run({ type: 'set-node-geometry', nodeId, ...geometry });
      }
    }
  };

  /** Keys every editor handles; none reach the table's navigation or the app's shortcuts. */
  const keys = (event: KeyboardEvent<HTMLElement>, apply: ((move: CellMove) => void) | null) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close('stay');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (apply) apply('stay');
      else close('stay');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const move = event.shiftKey ? 'previous' : 'next';
      if (apply) apply(move);
      else close(move);
    }
  };

  if (spec.kind === 'input' || typing) {
    const numeric = spec.kind === 'input' && spec.type === 'number';
    const range = spec.kind === 'input' && (spec.min !== undefined || spec.max !== undefined) ? ` (${spec.min ?? '…'} to ${spec.max ?? '…'})` : '';
    const apply = (move: CellMove) => submit({ kind: 'draft', text: draft }, move);
    return (
      <span className="sgl-dataview-editor">
        <input
          ref={input}
          autoFocus
          type="text"
          inputMode={numeric ? 'decimal' : 'text'}
          spellCheck={false}
          aria-label={`${label}${range}`}
          title={`Enter applies · Tab applies and moves on · Esc cancels${spec.kind === 'input' && spec.reset ? ' · empty uses the default' : ''}`}
          value={draft}
          placeholder={spec.kind === 'input' ? spec.placeholder : 'new-function-id'}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => keys(e, apply)}
          onBlur={() => apply('none')}
        />
        {spec.kind === 'input' && spec.reset && (
          <button
            type="button"
            className="sgl-dataview-reset"
            title={spec.reset.title}
            aria-label={`Use the default for ${label}`}
            // Keep the focus in the field so leaving it does not apply the draft first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => submit({ kind: 'reset' }, 'stay')}
          >
            ↺
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="sgl-dataview-editor">
      <select
        ref={select}
        autoFocus
        aria-label={label}
        value={spec.current}
        onChange={(e) => {
          const value = e.currentTarget.value;
          if (value === OTHER) {
            typingRef.current = true;
            return setTyping(true);
          }
          submit({ kind: 'choice', value }, 'stay');
        }}
        onKeyDown={(e) => {
          // A closed list would change the value (and apply it) on every arrow key: open it instead.
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            try {
              (e.currentTarget as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              /* unsupported */
            }
            return;
          }
          keys(e, null);
        }}
        onBlur={() => {
          if (!typingRef.current) close('none');
        }}
      >
        {spec.options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled === true && o.value !== spec.current}>
            {o.label}
          </option>
        ))}
        {spec.other && <option value={OTHER}>Other function…</option>}
      </select>
    </span>
  );
}

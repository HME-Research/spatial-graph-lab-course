import { Feedback } from './Feedback';

/**
 * Inline confirmation shown when a move or resize would take cells of generated corridors
 * (`needs-confirmation` from the spatial engine). It is not a modal: it sits in Properties next
 * to the edited fields, so the views stay visible.
 *
 * - Cancel: nothing is sent; the document is unchanged.
 * - Move anyway and recalculate: the host sends `set-node-geometry` with
 *   `confirmRouteDisplacement: true` (one history step). Relationships are kept; their corridors
 *   are recalculated and may become "Unresolved".
 */
export function RouteConfirm({
  relationships,
  action = 'move',
  onCancel,
  onConfirm,
}: {
  /** Readable labels of the relationships whose corridors are in the way, e.g. "01 ↔ 03". */
  readonly relationships: readonly string[];
  readonly action?: 'move' | 'resize';
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const verb = action === 'move' ? 'Moving' : 'Resizing';
  const list = relationships.join(', ');
  return (
    <Feedback
      tone="warning"
      title={`${verb} this node would block the generated corridor of ${relationships.length === 1 ? 'edge' : 'edges'} ${list}.`}
      messages={[
        {
          text: 'If you continue, the edges are kept and their corridors are recalculated. Some may become “Unresolved”.',
          technical: '',
        },
      ]}
    >
      <div className="sgl-feedback-actions">
        <button type="button" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="sgl-primary" onClick={onConfirm}>
          {action === 'move' ? 'Move anyway and recalculate' : 'Resize anyway and recalculate'}
        </button>
      </div>
    </Feedback>
  );
}

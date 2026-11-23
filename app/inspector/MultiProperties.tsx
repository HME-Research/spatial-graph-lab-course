import { useMemo } from 'react';
import { nodeLabel } from '@app/document';
import { IssueFeedback, UNDO_HINT } from '@app/ui';
import { useFunctionName } from '@app/views/functionColour';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { messageContextFor, useCommands, type PanelProps } from './panelSupport';
import { relationshipLabelIn, typeMenu } from './propertiesModel';

const MIXED = '';

/**
 * Properties of several selected items (2026-11-23: box selection / Ctrl-click in Graph 2D): what is
 * selected, one Function for all selected rooms, and Delete. Each action is ONE command (one Undo step).
 */
export function MultiProperties(props: PanelProps & { readonly nodeIds: readonly number[]; readonly edgeIds: readonly number[] }) {
  const { design, project, onSelect, nodeIds, edgeIds } = props;
  const { issues, clearIssues, runV2 } = useCommands(props);
  const functionName = useFunctionName();
  const nodes = useMemo(() => design.doc.nodes.filter((n) => nodeIds.includes(n.id)), [design, nodeIds]);
  const edgeLabel = relationshipLabelIn(design.doc);
  const functions = [...new Set(nodes.map((n) => n.function))];
  const common = functions.length === 1 ? functions[0]! : null;
  const typesInDesign = useMemo(() => design.doc.nodes.map((n) => n.function), [design]);
  const menu = typeMenu(project?.project ?? null, typesInDesign, common ?? functions[0] ?? 'room');
  // Rooms whose relationships go too, beyond the ones selected.
  const alsoRemoved = design.doc.edges.filter(
    (e) => !edgeIds.includes(e.id) && (nodeIds.includes(e.source) || nodeIds.includes(e.target)),
  ).length;

  const rooms = nodeIds.length;
  const links = edgeIds.length;
  const count = [rooms ? `${rooms} room${rooms === 1 ? '' : 's'}` : '', links ? `${links} relationship${links === 1 ? '' : 's'}` : '']
    .filter(Boolean)
    .join(' and ');

  return (
    <div className="sgl-panel">
      <section className="sgl-section">
        <h4>{count} selected</h4>
        <p className="sgl-help">Ctrl/⌘-click adds or removes an item; Esc clears the selection.</p>
        {rooms > 0 && (
          <p className="sgl-help">
            Rooms:{' '}
            {nodes.map((n, i) => (
              <span key={n.id}>
                {i > 0 && ', '}
                <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(n.id))} title="Select only this room">
                  {nodeLabel(n)}
                </button>
              </span>
            ))}
          </p>
        )}
        {links > 0 && (
          <p className="sgl-help">
            Relationships:{' '}
            {edgeIds.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <button type="button" className="sgl-link" onClick={() => onSelect(selectEdge(id))} title="Select only this relationship">
                  {edgeLabel(id)}
                </button>
              </span>
            ))}
          </p>
        )}
      </section>

      <IssueFeedback issues={issues} context={messageContextFor(props)} onDismiss={clearIssues} />

      {rooms > 0 && (
        <section className="sgl-section">
          <label className="sgl-type-select">
            <span>Function of the {rooms} selected room{rooms === 1 ? '' : 's'}</span>
            <select
              value={common ?? MIXED}
              onChange={(e) => {
                const functionId = e.target.value;
                if (functionId !== MIXED && functionId !== common) runV2({ type: 'set-nodes-type', nodeIds, function: functionId });
              }}
              title={`Gives every selected room this Function. ${UNDO_HINT}`}
            >
              {common === null && (
                <option value={MIXED} disabled>
                  Mixed ({functions.map((f) => functionName(f)).join(', ')})
                </option>
              )}
              {menu.options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="sgl-section sgl-panel-actions">
        <button
          type="button"
          className="sgl-danger"
          onClick={() => {
            if (runV2({ type: 'remove-items', nodeIds, edgeIds })) onSelect(NO_SELECTION);
          }}
          title={`Deletes everything selected${alsoRemoved ? `, and the ${alsoRemoved} other relationship(s) of the selected rooms` : ''}. ${UNDO_HINT}`}
        >
          Delete {count}
        </button>
      </section>
    </div>
  );
}

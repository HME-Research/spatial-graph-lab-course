import type { InspectorProps } from '../../viewer/contracts';

/**
 * Workstream A replaces this read-only placeholder with the editing inspector
 * (type, physical grid via 'move-node', attributes, edge kind). Keep the export name and props.
 */
export function Inspector({ doc, selection }: InspectorProps) {
  const item =
    selection.kind === 'node'
      ? doc.nodes.find((n) => n.id === selection.id)
      : selection.kind === 'edge'
        ? doc.edges.find((e) => e.id === selection.id)
        : undefined;
  return (
    <aside className="inspector">
      <h3>Inspector</h3>
      {item ? <pre>{JSON.stringify(item, null, 2)}</pre> : <p className="meta">Nothing selected.</p>}
    </aside>
  );
}

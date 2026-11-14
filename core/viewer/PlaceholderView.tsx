import type { ViewProps } from './contracts';

/** Temporary stand-in rendered until a workstream replaces its view file. */
export function PlaceholderView({
  title,
  workstream,
  doc,
  selection,
}: ViewProps & { readonly title: string; readonly workstream: string }) {
  return (
    <div className="placeholder-view">
      <strong>{title}</strong>
      <p>Not implemented yet (workstream {workstream}).</p>
      <p className="meta">
        {doc.nodes.length} nodes · {doc.edges.length} edges · selection:{' '}
        {selection.kind === 'none' ? 'none' : `${selection.kind} "${selection.id}"`}
      </p>
    </div>
  );
}

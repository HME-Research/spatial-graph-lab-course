import type { ViewProps } from '../contracts';

/**
 * Plan view placeholder (Gate F, owned by workstream C). Draws nothing from the design yet: it says
 * honestly what this view will show. The Plan workstream replaces this component's body, never the
 * registry entry in `app/views/registry.ts`.
 */
export function PlanView(_props: ViewProps) {
  return (
    <div className="view-placeholder" data-placeholder="plan">
      <p>
        <strong>Plan view — coming in this programme.</strong>
      </p>
      <p className="meta">
        It will show one storey of the building as an architectural floor plan: walls, doors and openings, room labels and the
        current selection, with a Level selector in the corner. Nothing is drawn here yet.
      </p>
    </div>
  );
}

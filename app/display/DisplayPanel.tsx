import { useWorkspaceServices } from '@app/workspace/services';

/**
 * Display destination — placeholder (Gate F slot, owned by workstream E). E replaces this body;
 * the slot in `app/workspace/panelSlots.ts` stays.
 */
export function DisplayPanel() {
  const { design } = useWorkspaceServices();
  return (
    <div className="sgl-slot-placeholder" data-placeholder="display">
      <p>Display settings are not available yet.</p>
      <p className="meta">
        This is where you will choose how each view looks — labels, legend, roofs, colour preset and lighting. Display changes
        appearance only, never what is generated.
      </p>
      {!design && <p className="meta">No design is open.</p>}
    </div>
  );
}

import { VIEW_LABELS } from '@app/ui';
import { useWorkspaceServices } from '@app/workspace/services';

/**
 * Camera destination — placeholder (Gate F slot, owned by workstream E). E replaces this body;
 * the slot in `app/workspace/panelSlots.ts` stays. Lists the real 3D viewports from the shared
 * services; it does not save or move any camera yet.
 */
export function CameraPanel() {
  const { viewports } = useWorkspaceServices();
  const shown3D = viewports.filter((v) => v.visible && v.is3D);
  return (
    <div className="sgl-slot-placeholder" data-placeholder="camera">
      <p>Saved cameras are not available yet.</p>
      <p className="meta">This is where you will choose a 3D viewport and save, name and restore its camera views.</p>
      <p className="meta">
        {shown3D.length === 0
          ? 'No 3D viewport is shown right now.'
          : `3D viewports shown now: ${shown3D.map((v) => `${v.index + 1} (${VIEW_LABELS[v.mode]})`).join(', ')}.`}
      </p>
    </div>
  );
}

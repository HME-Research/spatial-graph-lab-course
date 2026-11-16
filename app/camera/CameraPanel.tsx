import { useEffect, useState } from 'react';
import { cameraTargetLabel, cameraTargets, cameraTargetStatus } from '@app/workspace/cameraTargets';
import { useWorkspaceServices } from '@app/workspace/services';

/**
 * Camera destination — placeholder (Gate F slot, owned by workstream E). E replaces this body;
 * the slot in `app/workspace/panelSlots.ts` stays.
 *
 * Proves the camera contract minimally: an explicit target viewport chosen from the visible 3D
 * viewports, and the bus registration state of that target. When the chosen viewport disappears
 * the choice is kept and reported as not available — never switched. No camera is saved or moved.
 */
export function CameraPanel() {
  const { viewports, cameraBus } = useWorkspaceServices();
  const [chosen, setChosen] = useState<string | null>(null);
  const [registered, setRegistered] = useState<readonly string[]>(() => cameraBus.registered());
  useEffect(() => {
    setRegistered(cameraBus.registered());
    return cameraBus.subscribe((event) => {
      if (event.type !== 'applied') setRegistered(cameraBus.registered());
    });
  }, [cameraBus]);

  const targets = cameraTargets(viewports);
  const status = cameraTargetStatus(viewports, chosen, registered);

  return (
    <div className="sgl-slot-placeholder" data-placeholder="camera">
      <p>Saved cameras are not available yet.</p>
      <p className="meta">This is where you will save, name and restore the camera views of a 3D viewport.</p>
      {targets.length === 0 && status.kind === 'none' ? (
        <p className="meta">No 3D viewport is shown right now.</p>
      ) : (
        <label>
          Target viewport{' '}
          <select value={chosen ?? ''} onChange={(e) => setChosen(e.currentTarget.value || null)} aria-label="Camera target viewport">
            <option value="">Choose a 3D viewport…</option>
            {targets.map((v) => (
              <option key={v.id} value={v.id}>
                {cameraTargetLabel(v)}
              </option>
            ))}
            {status.kind === 'unavailable' && (
              <option value={status.id} disabled>
                {status.message}
              </option>
            )}
          </select>
        </label>
      )}
      {status.kind !== 'none' && (
        <p className={status.kind === 'unavailable' ? 'meta warning' : 'meta'} role="status" data-camera-target={status.kind}>
          {status.message}.
        </p>
      )}
    </div>
  );
}

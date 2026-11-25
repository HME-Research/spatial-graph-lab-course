import { useEffect, useState } from 'react';
import { VIEW_LABELS } from '@app/ui';
import { cameraTargetLabel, cameraTargets, cameraTargetStatus } from '@app/workspace/cameraTargets';
import { browserPaneStorage } from '@app/workspace/panes';
import { useWorkspaceServices } from '@app/workspace/services';
import type { CameraViewMode } from './savedCamera';
import { nextCameraName, recallPlan, useSavedCameras } from './savedCameras';
import './camera.css';

type Message = { readonly kind: 'ok' | 'warning'; readonly text: string } | null;

/**
 * The explicit target viewport is a per-browser UI choice (like the pane widths): remembered in
 * localStorage so it survives a scenario switch and a reload. Every access is guarded; only a
 * viewport id (`viewport-1…4`) is accepted.
 */
const TARGET_KEY = 'sgl:ui:camera-target';
const TARGET_ID = /^viewport-[1-4]$/;
function readTarget(): string | null {
  try {
    const raw = browserPaneStorage()?.getItem(TARGET_KEY) ?? null;
    return raw !== null && TARGET_ID.test(raw) ? raw : null;
  } catch {
    return null;
  }
}
function writeTarget(id: string | null): void {
  try {
    const storage = browserPaneStorage();
    if (storage) storage.setItem(TARGET_KEY, id ?? '');
  } catch {
    // Not remembered; the choice still applies in this page.
  }
}

/**
 * Camera destination (workstream E): an explicit target viewport, then Save current view, and the
 * scenario's saved cameras with Recall, Rename and Delete.
 *
 * - The target is chosen explicitly from the visible 3D viewports. When it disappears (hidden by a
 *   maximise, outside the layout or switched to a 2D view) the choice is kept and reported as not
 *   available; it is never switched to another viewport, and Save/Recall stay disabled.
 * - Recall applies through the camera bus to exactly that viewport. A camera saved in another 3D
 *   view may be recalled (all 3D views share one Y-up space; the panel says so); orthographic
 *   cameras need Building or Voxels.
 */
export function CameraPanel() {
  const { viewports, cameraBus } = useWorkspaceServices();
  const saved = useSavedCameras();
  const [chosen, setChosenState] = useState<string | null>(readTarget);
  const setChosen = (id: string | null) => {
    setChosenState(id);
    writeTarget(id);
  };
  const [registered, setRegistered] = useState<readonly string[]>(() => cameraBus.registered());
  const [name, setName] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useEffect(() => {
    setRegistered(cameraBus.registered());
    return cameraBus.subscribe((event) => {
      if (event.type !== 'applied') setRegistered(cameraBus.registered());
    });
  }, [cameraBus]);

  const targets = cameraTargets(viewports);
  const status = cameraTargetStatus(viewports, chosen, registered);
  const ready = status.kind === 'ready' ? status.viewport : null;

  const save = () => {
    if (!ready) return;
    const pose = cameraBus.capture(ready.id);
    if (!pose) return setMessage({ kind: 'warning', text: `${cameraTargetLabel(ready)} is not available; nothing was saved.` });
    const result = saved.save({ name, viewMode: ready.mode as CameraViewMode, pose });
    if (!result.ok) return setMessage({ kind: 'warning', text: result.message });
    const camera = result.cameras[result.cameras.length - 1]!;
    setName('');
    setMessage({ kind: 'ok', text: `Saved “${camera.name}” from ${cameraTargetLabel(ready)}.` });
  };

  const recall = (id: string) => {
    const camera = saved.cameras.find((c) => c.id === id);
    if (!camera || !ready) return;
    const plan = recallPlan(camera, ready.mode, ready.is3D);
    if (!plan.ok) return setMessage({ kind: 'warning', text: plan.message });
    const outcome = cameraBus.apply(ready.id, camera.pose);
    if (outcome !== 'applied')
      return setMessage({ kind: 'warning', text: `${cameraTargetLabel(ready)} could not apply “${camera.name}”; nothing changed.` });
    setMessage({ kind: 'ok', text: `Recalled “${camera.name}” in ${cameraTargetLabel(ready)}.${plan.note ? ` ${plan.note}` : ''}` });
  };

  const commitRename = () => {
    if (!renaming) return;
    const result = saved.rename(renaming.id, renaming.name);
    if (!result.ok) return setMessage({ kind: 'warning', text: result.message });
    setRenaming(null);
    setMessage(null);
  };

  const remove = (id: string) => {
    const camera = saved.cameras.find((c) => c.id === id);
    const result = saved.remove(id);
    setConfirmDelete(null);
    setMessage(result.ok ? { kind: 'ok', text: `Deleted “${camera?.name ?? id}”.` } : { kind: 'warning', text: result.message });
  };

  return (
    <div className="sgl-camera" aria-label="Camera">
      <section className="sgl-camera-section" aria-label="Target viewport">
        <h3>Target viewport</h3>
        {targets.length === 0 && status.kind === 'none' ? (
          <p className="meta">No 3D viewport is shown right now. Show Graph 3D, Voxels or Building in a viewport to save or recall cameras.</p>
        ) : (
          <label className="sgl-camera-field">
            <span>Viewport</span>
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
            {status.message}
            {status.kind === 'unavailable' ? '. Choose another 3D viewport; the camera is never moved elsewhere.' : '.'}
          </p>
        )}
      </section>

      <section className="sgl-camera-section" aria-label="Save current view">
        <h3>Save current view</h3>
        <div className="sgl-camera-row">
          <input
            type="text"
            value={name}
            placeholder={nextCameraName(saved.cameras)}
            aria-label="Name for the saved camera"
            maxLength={60}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <button type="button" onClick={save} disabled={!ready} title={ready ? `Save the camera of ${cameraTargetLabel(ready)}` : 'Choose a ready 3D viewport first'}>
            Save view
          </button>
        </div>
      </section>

      {message && (
        <p className={message.kind === 'warning' ? 'meta warning sgl-camera-message' : 'meta sgl-camera-message'} role="status" data-camera-message={message.kind}>
          {message.text}
        </p>
      )}

      <section className="sgl-camera-section" aria-label="Saved cameras">
        <h3>Saved cameras</h3>
        <p className="meta">Saved with this scenario. Recall applies to the target viewport only.</p>
        {saved.cameras.length === 0 ? (
          <p className="meta" data-saved-cameras="0">
            No saved cameras in this scenario yet.
          </p>
        ) : (
          <ul className="sgl-camera-list" data-saved-cameras={saved.cameras.length}>
            {saved.cameras.map((camera) => {
              const plan = ready ? recallPlan(camera, ready.mode, ready.is3D) : null;
              const editing = renaming?.id === camera.id;
              return (
                <li key={camera.id} className="sgl-camera-item" data-camera-id={camera.id}>
                  {editing ? (
                    <input
                      type="text"
                      value={renaming.name}
                      aria-label={`New name for ${camera.name}`}
                      maxLength={60}
                      autoFocus
                      onChange={(e) => setRenaming({ id: camera.id, name: e.currentTarget.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <div className="sgl-camera-name">
                      <strong>{camera.name}</strong>
                      <span className="meta">
                        {VIEW_LABELS[camera.viewMode]} · {camera.pose.projection}
                      </span>
                    </div>
                  )}
                  <div className="sgl-camera-actions">
                    {editing ? (
                      <>
                        <button type="button" onClick={commitRename}>
                          Save name
                        </button>
                        <button type="button" onClick={() => setRenaming(null)}>
                          Cancel
                        </button>
                      </>
                    ) : confirmDelete === camera.id ? (
                      <>
                        <button type="button" className="danger" onClick={() => remove(camera.id)}>
                          Confirm delete
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => recall(camera.id)}
                          disabled={!ready || (plan !== null && !plan.ok)}
                          title={!ready ? 'Choose a ready 3D viewport first' : plan && !plan.ok ? plan.message : (plan?.note ?? `Apply to ${cameraTargetLabel(ready)}`)}
                        >
                          Recall
                        </button>
                        <button type="button" onClick={() => setRenaming({ id: camera.id, name: camera.name })}>
                          Rename
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(camera.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  {plan && plan.ok && plan.note && <span className="meta">{plan.note}</span>}
                  {plan && !plan.ok && <span className="meta warning">{plan.message}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

import { z } from 'zod';

/**
 * Camera contract (Gate F, F-D; root-owned). Pure: no React, no Three.js.
 *
 * A `CameraPose` is plain data in the Three.js **Y-up world** (the frame `spatialToThree` maps
 * into). It can be captured from a live viewport, saved (`SavedCamera`, persisted in the project
 * file) and applied to a viewport again through a `CameraBus`.
 *
 * The bus addresses viewports by id only. A viewport that is not registered (unmounted) or that
 * reports itself unavailable (e.g. hidden) answers `null` / `'unavailable'`; the bus never
 * re-targets a request to another viewport.
 */

export const CAMERA_PROJECTIONS = ['perspective', 'orthographic'] as const;
export type CameraProjection = (typeof CAMERA_PROJECTIONS)[number];

export type CameraVector = readonly [x: number, y: number, z: number];

export interface CameraPose {
  readonly projection: CameraProjection;
  readonly position: CameraVector;
  readonly target: CameraVector;
  readonly up: CameraVector;
  /** Perspective: vertical field of view in degrees. */
  readonly fov?: number | undefined;
  /** Orthographic: visible world height in metres. */
  readonly orthoHeight?: number | undefined;
}

/** A named pose. `viewMode` is a plain string here; the application narrows it to its 3D view modes. */
export interface SavedCamera {
  readonly id: string;
  readonly name: string;
  readonly viewMode: string;
  readonly pose: CameraPose;
}

const finite = z.number().refine(Number.isFinite, { error: 'must be a finite number' });
const vectorSchema = z.tuple([finite, finite, finite]);

export const cameraPoseSchema = z
  .strictObject({
    projection: z.enum(CAMERA_PROJECTIONS),
    position: vectorSchema,
    target: vectorSchema,
    up: vectorSchema,
    fov: finite.gt(0).lt(180).optional(),
    orthoHeight: finite.gt(0).optional(),
  })
  .refine((p) => p.up.some((c) => c !== 0), { error: 'up must not be the zero vector', path: ['up'] })
  .refine((p) => p.position.some((c, i) => c !== p.target[i]), {
    error: 'position and target must differ',
    path: ['target'],
  });

export const savedCameraSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  viewMode: z.string().min(1),
  pose: cameraPoseSchema,
});

/** What a live viewport offers the bus. */
export interface CameraHandle {
  capture(): CameraPose;
  apply(pose: CameraPose): void;
  /**
   * Optional (additive to the F-D shape): false while the viewport cannot serve requests, e.g.
   * hidden. Omitted = always available while registered.
   */
  available?(): boolean;
  /**
   * Optional (additive): false when this viewport cannot apply the pose (e.g. an orthographic
   * pose on a perspective-only canvas). Omitted = accepts every pose.
   */
  accepts?(pose: CameraPose): boolean;
}

export type CameraApplyResult = 'applied' | 'unavailable';

export type CameraBusEvent =
  | { readonly type: 'registered'; readonly viewportId: string }
  | { readonly type: 'unregistered'; readonly viewportId: string }
  | { readonly type: 'applied'; readonly viewportId: string };

export interface CameraBus {
  /** Registers a viewport; a later registration under the same id replaces it. Returns the unregister function. */
  register(viewportId: string, handle: CameraHandle): () => void;
  /** The live pose of that viewport, or null when it is unregistered or unavailable. */
  capture(viewportId: string): CameraPose | null;
  /** Applies a pose to exactly that viewport; never to another one. */
  apply(viewportId: string, pose: CameraPose): CameraApplyResult;
  /** Ids of the currently registered viewports, sorted. */
  registered(): readonly string[];
  subscribe(listener: (event: CameraBusEvent) => void): () => void;
}

export function createCameraBus(): CameraBus {
  const handles = new Map<string, CameraHandle>();
  const listeners = new Set<(event: CameraBusEvent) => void>();
  const emit = (event: CameraBusEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  const live = (viewportId: string): CameraHandle | null => {
    const handle = handles.get(viewportId);
    if (!handle) return null;
    return handle.available && !handle.available() ? null : handle;
  };

  return {
    register(viewportId, handle) {
      handles.set(viewportId, handle);
      emit({ type: 'registered', viewportId });
      let done = false;
      return () => {
        if (done) return;
        done = true;
        // A stale unregister (after a replacement registration) must not remove the newer handle.
        if (handles.get(viewportId) !== handle) return;
        handles.delete(viewportId);
        emit({ type: 'unregistered', viewportId });
      };
    },
    capture(viewportId) {
      return live(viewportId)?.capture() ?? null;
    },
    apply(viewportId, pose) {
      const handle = live(viewportId);
      if (!handle || (handle.accepts && !handle.accepts(pose))) return 'unavailable';
      handle.apply(pose);
      emit({ type: 'applied', viewportId });
      return 'applied';
    },
    registered() {
      return [...handles.keys()].sort();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

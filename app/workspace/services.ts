import { createContext, useContext } from 'react';
import type { DesignPort } from '@app/spatial';
import type { Selection, SelectionHandler } from '@core/viewer/selection';
import type { CameraBus } from '@core/viewer/three/camera';
import type { ViewportInfo } from './viewports';

/**
 * Shared services for destination panels (Gate F, F-A): the stable way a left-pane destination
 * (Scenarios, Camera, Display, …) reads the open design, the selection and the viewports, instead
 * of reaching into the shell. Provided once by `App`.
 *
 * Root-owned type, extended ADDITIVELY only: new members are added as new optional or required
 * fields (the camera bus in F-D, display and project at integration); existing fields keep their
 * meaning. Panels must ignore fields they do not use.
 */
export interface WorkspaceServices {
  /** The live design port, or null when no design is open. */
  readonly design: DesignPort | null;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
  /** The four viewports in order (`VIEWPORT_IDS`), with their mode and visibility. */
  readonly viewports: readonly ViewportInfo[];
  /**
   * The workspace camera bus (F-D), one per App instance. Each mounted 3D viewport registers its
   * camera under its viewport id; a hidden or unmounted viewport answers `null` / `'unavailable'`
   * and is never re-targeted. Choose targets with `app/workspace/cameraTargets.ts`.
   */
  readonly cameraBus: CameraBus;
}

export const WorkspaceServicesContext = createContext<WorkspaceServices | null>(null);

/** The workspace services. Throws outside a `WorkspaceServicesContext` provider (a wiring error). */
export function useWorkspaceServices(): WorkspaceServices {
  const services = useContext(WorkspaceServicesContext);
  if (!services) throw new Error('useWorkspaceServices() needs a WorkspaceServicesContext provider (provided by App).');
  return services;
}

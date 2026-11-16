import type { ComponentType } from 'react';
import { CameraPanel } from '@app/camera/CameraPanel';
import { DisplayPanel } from '@app/display/DisplayPanel';
import { ScenariosPanel } from '@app/scenarios/ScenariosPanel';
import type { SidebarSection } from '@app/ui';

/**
 * Panel slots (Gate F, F-A): destinations whose content is a self-contained component owned by a
 * workstream folder. Each component takes no props and reads shared state through
 * `useWorkspaceServices()`. Workstreams replace the component bodies, never this map.
 */
export const SLOT_DESTINATIONS = ['scenarios', 'camera', 'display'] as const satisfies readonly SidebarSection[];
export type SlotDestination = (typeof SLOT_DESTINATIONS)[number];

export const DESTINATION_PANELS: Readonly<Record<SlotDestination, ComponentType>> = {
  scenarios: ScenariosPanel,
  camera: CameraPanel,
  display: DisplayPanel,
};

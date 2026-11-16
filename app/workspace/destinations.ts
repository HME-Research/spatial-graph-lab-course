import type { ComponentType } from 'react';
import {
  AlgorithmsIcon,
  AttributesIcon,
  CameraIcon,
  DesignerIcon,
  DisplayIcon,
  ProjectIcon,
  ScenariosIcon,
  SIDEBAR_DESCRIPTIONS,
  SIDEBAR_LABELS,
  SIDEBAR_SECTIONS,
  type SidebarSection,
} from '@app/ui';

/**
 * The left-rail destinations (Gate F, F-A): seven, in this order, each with an icon and an
 * always-visible label. Vocabulary lives in `app/ui/labels.ts`; this registry adds the icon.
 * There is no eighth top-level destination.
 */
export interface Destination {
  readonly id: SidebarSection;
  readonly label: string;
  /** Tooltip and accessible description. */
  readonly description: string;
  /** Decorative icon component. */
  readonly icon: ComponentType;
}

const ICONS: Readonly<Record<SidebarSection, ComponentType>> = {
  project: ProjectIcon,
  attributes: AttributesIcon,
  designer: DesignerIcon,
  algorithms: AlgorithmsIcon,
  scenarios: ScenariosIcon,
  camera: CameraIcon,
  display: DisplayIcon,
};

export const DESTINATIONS: readonly Destination[] = SIDEBAR_SECTIONS.map((id) => ({
  id,
  label: SIDEBAR_LABELS[id],
  description: SIDEBAR_DESCRIPTIONS[id],
  icon: ICONS[id],
}));

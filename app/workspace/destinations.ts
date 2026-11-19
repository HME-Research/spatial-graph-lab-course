import type { ComponentType } from 'react';
import {
  AnalyseIcon,
  AttributesIcon,
  CameraIcon,
  DesignerIcon,
  DisplayIcon,
  ProjectIcon,
  ScenariosIcon,
  TransformIcon,
  SIDEBAR_DESCRIPTIONS,
  SIDEBAR_LABELS,
  SIDEBAR_SECTIONS,
  type SidebarSection,
} from '@app/ui';

/**
 * The left-rail destinations (Gate F, F-A; P4: Analyse and Transform replace Algorithms): eight, in this order, each with an icon and an
 * always-visible label. Vocabulary lives in `app/ui/labels.ts`; this registry adds the icon.
 * There is no ninth top-level destination.
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
  analyse: AnalyseIcon,
  transform: TransformIcon,
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

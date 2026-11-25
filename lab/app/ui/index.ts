/**
 * Stage 05 application-shell components (owner: 05-app-ui). Presentational only: no document
 * state, history or project activation lives here. The integration owner wires them into
 * `App.tsx` / `Workspace.tsx` (see app/ui/INTEGRATION.md).
 */
export { DesignerPlaceholder } from './DesignerPlaceholder';
export { Feedback, IssueFeedback, type FeedbackTone } from './Feedback';
export * from './labels';
export { LoadFailureNotice } from './LoadFailureNotice';
export * from './messages';
export * from './concepts';
export { FOCUSABLE_SELECTOR, nextTabIndex, trappedFocusIndex } from './navigation';
export {
  CollapsibleSection,
  readSectionOpen,
  sectionStorageKey,
  toggleSection,
  useRememberedOpen,
  writeSectionOpen,
  type CollapsibleSectionProps,
  type SectionStorage,
} from './Section';
export { HorizontalTabs, tabKeyTarget, type TabItem } from './Tabs';
export { RouteConfirm } from './RouteConfirm';
export {
  AnalyseIcon,
  AttributesIcon,
  CameraIcon,
  ChevronIcon,
  DesignerIcon,
  DisplayIcon,
  ProjectIcon,
  PropertiesIcon,
  ScenariosIcon,
  SidebarNav,
  TransformIcon,
  type SidebarNavProps,
  type SidebarNavTab,
} from './SidebarNav';
export { ViewModeSelect } from './ViewModeSelect';

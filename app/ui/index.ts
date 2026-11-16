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
export { nextTabIndex } from './navigation';
export { RouteConfirm } from './RouteConfirm';
export {
  AlgorithmsIcon,
  AttributesIcon,
  DesignerIcon,
  PropertiesIcon,
  SidebarNav,
  type SidebarNavProps,
  type SidebarNavTab,
} from './SidebarNav';
export { ViewModeSelect } from './ViewModeSelect';

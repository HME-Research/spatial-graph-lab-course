/**
 * Designer (06-designer): per-design, per-node-type window coverage and roof rules.
 * Uses the frozen v2 settings (`settings.typeAppearance`, `effectiveTypeAppearance`) and the
 * `set-type-appearance` command; never rewrites project type definitions.
 */
export * from './designerModel';
export { DesignerPanel, type DesignerPanelProps } from './DesignerPanel';

/**
 * Designer (06-designer): per-design looks (windows, walls, roof, façade) per card of
 * "Style rooms by" (`settings.styleBy` / `settings.styles`, `effectiveLook`), changed through
 * `set-look` / `remove-style-group`; never rewrites project type definitions.
 */
export * from './designerModel';
export { DesignerPanel, type DesignerPanelProps } from './DesignerPanel';
export { FacadeImport, FacadeAssetDetails, FacadeLibraryFooter, FacadeLibrarySection, type DesignerFacades } from './FacadeLibraryPanel';

import type { ReactNode } from 'react';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { colorModeFromValue, colorModeToValue, type ColorMode, type Coloring, NUMERIC_HIGH, NUMERIC_LOW } from './colorBy';

/**
 * Application-specific HTML controls for the Graph 3D and Voxel views (colour-by, storey cut,
 * legend). Generic containers (ControlBar, InfoPanel) live in core/viewer/three/ViewControls.
 */

export function ColorBySelect({
  mode,
  attributeKeys,
  metrics = [],
  onChange,
}: {
  readonly mode: ColorMode;
  readonly attributeKeys: readonly string[];
  /** Calculated node values on offer (`useSpatialScene().metricOptions`). */
  readonly metrics?: readonly { readonly id: string; readonly label: string; readonly unit?: string | undefined }[];
  readonly onChange: (mode: ColorMode) => void;
}) {
  return (
    <label>
      Colour by{' '}
      <select value={colorModeToValue(mode)} onChange={(e) => onChange(colorModeFromValue(e.currentTarget.value))}>
        <option value="type">Type (function)</option>
        <option value="group">Access group</option>
        {attributeKeys.length > 0 && (
          <optgroup label="Attribute">
            {attributeKeys.map((k) => (
              <option key={k} value={colorModeToValue({ kind: 'attribute', key: k })}>
                {k}
              </option>
            ))}
          </optgroup>
        )}
        {metrics.length > 0 && (
          <optgroup label="Calculated">
            {metrics.map((m) => (
              <option key={m.id} value={colorModeToValue({ kind: 'metric', metricId: m.id })}>
                {m.unit ? `${m.label} (${m.unit})` : m.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/**
 * Colour legend of a 3D view. With `open`/`onOpenChange` it is a disclosure (title always visible)
 * so a narrow panel can keep it closed until wanted (programme phase 05, audit V05); open, it is
 * capped and scrolls.
 */
export function Legend({
  coloring,
  children,
  open,
  onOpenChange,
}: {
  readonly coloring: Coloring;
  readonly children?: ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const body = <LegendBody coloring={coloring}>{children}</LegendBody>;
  if (open !== undefined && onOpenChange) {
    return (
      <details className="viewer3d-panel viewer3d-legend viewer3d-legend-collapsible" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)}>
        <summary className="viewer3d-legend-title">{coloring.title}</summary>
        {body}
      </details>
    );
  }
  return (
    <div className="viewer3d-panel viewer3d-legend">
      <div className="viewer3d-legend-title">{coloring.title}</div>
      {body}
    </div>
  );
}

function LegendBody({ coloring, children }: { readonly coloring: Coloring; readonly children?: ReactNode }) {
  return (
    <>
      {coloring.scale && (
        <div className="viewer3d-scale">
          <span>{coloring.scale.min}</span>
          <span className="viewer3d-scale-bar" style={{ background: `linear-gradient(to right, ${NUMERIC_LOW}, ${NUMERIC_HIGH})` }} />
          <span>{coloring.scale.max}</span>
        </div>
      )}
      <ul>
        {coloring.legend.map((e) => (
          <li key={`${e.missing ? '!' : ''}${e.label}`} className={e.missing ? 'missing' : undefined}>
            <span className={e.missing ? 'viewer3d-swatch missing' : 'viewer3d-swatch'} style={{ background: e.color }} />
            {e.label} <span className="viewer3d-count">({e.count})</span>
          </li>
        ))}
        {coloring.legend.length === 0 && <li className="viewer3d-count">No nodes</li>}
      </ul>
      {coloring.note && <div className="viewer3d-count">{coloring.note}</div>}
      <div className="viewer3d-legend-row">
        <span className="viewer3d-swatch" style={{ background: SELECTION_COLOR }} /> selected
      </div>
      {children}
    </>
  );
}

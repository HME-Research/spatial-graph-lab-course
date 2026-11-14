import type { ReactNode } from 'react';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { colorModeFromValue, colorModeToValue, type ColorMode, type Coloring, NUMERIC_HIGH, NUMERIC_LOW } from './colorBy';
import { EDGE_LEGEND_ORDER, EDGE_STYLES } from './edgeStyle';

/**
 * Application-specific HTML controls for the Graph 3D and Voxel views (colour-by, storey cut,
 * legend). Generic containers (ControlBar, InfoPanel) live in core/viewer/three/ViewControls.
 */

export function ColorBySelect({
  mode,
  attributeKeys,
  onChange,
}: {
  readonly mode: ColorMode;
  readonly attributeKeys: readonly string[];
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
      </select>
    </label>
  );
}

/** `null` = all levels; otherwise levels above `maxLevel` are shown as faint ghosts and not pickable. */
export function LevelSelect({
  levels,
  maxLevel,
  onChange,
}: {
  readonly levels: readonly number[];
  readonly maxLevel: number | null;
  readonly onChange: (maxLevel: number | null) => void;
}) {
  if (levels.length < 2) return null;
  return (
    <label>
      Levels{' '}
      <select
        value={maxLevel === null ? 'all' : String(maxLevel)}
        onChange={(e) => onChange(e.currentTarget.value === 'all' ? null : Number(e.currentTarget.value))}
      >
        <option value="all">All</option>
        {levels.slice(0, -1).map((l) => (
          <option key={l} value={String(l)}>
            Up to L{l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Legend({ coloring, showEdges, children }: { readonly coloring: Coloring; readonly showEdges?: boolean; readonly children?: ReactNode }) {
  return (
    <div className="viewer3d-panel viewer3d-legend">
      <div className="viewer3d-legend-title">{coloring.title}</div>
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
      {showEdges && (
        <>
          <div className="viewer3d-legend-title">Edges (relationships, not stairs)</div>
          <ul>
            {EDGE_LEGEND_ORDER.map((k) => {
              const s = EDGE_STYLES[k];
              return (
                <li key={k}>
                  <span
                    className="viewer3d-edge-sample"
                    style={{ borderTop: `3px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` }}
                  />
                  {s.label}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="viewer3d-legend-row">
        <span className="viewer3d-swatch" style={{ background: SELECTION_COLOR }} /> selected
      </div>
      {children}
    </div>
  );
}

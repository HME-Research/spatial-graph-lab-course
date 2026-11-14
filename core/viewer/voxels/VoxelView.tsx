import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { SELECTION_COLOR } from '../appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, spatialToThree } from '../coordinates';
import { NO_SELECTION } from '../selection';
import { SceneCanvas } from '../three/SceneCanvas';
import { LevelLabels } from '@app/views/three/LevelLabels';
import { pickHandlers, type Hover } from '../three/picking';
import { useSpatialScene } from '@app/views/three/useSpatialScene';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '../three/ViewControls';
import { ColorBySelect, Legend, LevelSelect } from '@app/views/three/SpatialControls';

/**
 * Voxels: one semi-transparent box of size [horizontal, vertical, horizontal] per occupied cell,
 * placed with spatialToThree. Colour-by is view-local (type, access group or an attribute).
 * Read-only; selection only changes material colour/opacity and draws an always-on-top outline.
 */

/** Slight inset so neighbouring voxels stay visually separate. */
const INSET = 0.94;
const BASE_OPACITY = 0.38;

export function VoxelView({ doc, selection, onSelect }: ViewProps) {
  const s = useSpatialScene(doc, selection);
  const [opacity, setOpacity] = useState(BASE_OPACITY);
  const geo = useVoxelGeometry();

  return (
    <SceneCanvas
      ariaLabel="Voxel view"
      fit={s.fit}
      fitRequest={s.fitRequest}
      grid={s.grid}
      cursor={s.hovered ? 'pointer' : 'grab'}
      onBackgroundClick={() => onSelect(NO_SELECTION)}
      overlay={
        <>
          <ControlBar>
            <ColorBySelect mode={s.colorMode} attributeKeys={s.attributeKeys} onChange={s.setColorMode} />
            <LevelSelect levels={s.levels} maxLevel={s.maxLevel} onChange={s.setMaxLevel} />
            <label title="Voxel opacity">
              Opacity{' '}
              <input
                type="range"
                min={0.15}
                max={0.9}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.currentTarget.value))}
              />
            </label>
            <button type="button" onClick={s.refit}>
              Fit view
            </button>
          </ControlBar>
          <InfoPanel>
            <HoverInfo hovered={s.hovered} doc={doc} attributeKey={s.colorMode.kind === 'attribute' ? s.colorMode.key : null} />
            <div className="viewer3d-count">
              {doc.nodes.length} cells · {s.levels.length} level{s.levels.length === 1 ? '' : 's'} · {s.groups.count} access group
              {s.groups.count === 1 ? '' : 's'}
            </div>
          </InfoPanel>
          <Legend coloring={s.coloring}>
            {s.emphasis.secondaryNodes.size > 0 && <div className="viewer3d-count">Selected edge: endpoints outlined</div>}
          </Legend>
          {doc.nodes.length === 0 ? (
            <div className="viewer3d-empty">No nodes in this design.</div>
          ) : (
            <div className="viewer3d-hint">{NAVIGATION_HINT}</div>
          )}
        </>
      }
    >
      <LevelLabels
        levels={s.levels}
        bounds={s.bounds}
        levelCentreY={(l) => spatialToThree([0, 0, l])[1]}
        hidden={s.isLevelHidden}
      />
      {s.nodeItems.map((n) => {
        const ghost = s.isLevelHidden(n.level);
        const primary = s.emphasis.primaryNodes.has(n.id);
        const secondary = s.emphasis.secondaryNodes.has(n.id);
        const emphasised = primary || secondary;
        const hovered = s.hovered?.kind === 'node' && s.hovered.id === n.id;
        const missing = s.coloring.missing.has(n.id);
        const color = s.coloring.colorOf.get(n.id)!;
        const fill = ghost ? 0.04 : primary ? Math.max(opacity, 0.65) : missing ? opacity * 0.55 : opacity;
        return (
          <group key={n.id} position={[...n.position]}>
            <mesh
              geometry={geo.box}
              {...(ghost ? {} : pickHandlers('node', n.id, onSelect, s.setHovered))}
            >
              <meshLambertMaterial
                color={primary ? SELECTION_COLOR : color}
                transparent
                opacity={hovered && !primary ? Math.min(1, fill + 0.15) : fill}
                depthWrite={false}
              />
            </mesh>
            {missing && !ghost ? (
              <lineSegments geometry={geo.dashedEdges} onUpdate={(l) => l.computeLineDistances()}>
                <lineDashedMaterial color="#5c5c55" dashSize={0.25} gapSize={0.18} transparent opacity={0.8} depthWrite={false} />
              </lineSegments>
            ) : (
              <lineSegments geometry={geo.edges}>
                <lineBasicMaterial color={color} transparent opacity={ghost ? 0.12 : 0.85} depthWrite={false} />
              </lineSegments>
            )}
            {emphasised && !ghost && (
              // Drawn on top of everything so a selected cell inside a cluster stays visible.
              <lineSegments geometry={geo.edges} scale={1.02} renderOrder={10}>
                <lineBasicMaterial color={SELECTION_COLOR} depthTest={false} transparent opacity={primary ? 1 : 0.7} />
              </lineSegments>
            )}
          </group>
        );
      })}
    </SceneCanvas>
  );
}

function HoverInfo({
  hovered,
  doc,
  attributeKey,
}: {
  readonly hovered: Hover | null;
  readonly doc: ViewProps['doc'];
  readonly attributeKey: string | null;
}) {
  if (!hovered || hovered.kind !== 'node') return <div className="viewer3d-count">Hover a voxel</div>;
  const n = doc.nodes.find((x) => x.id === hovered.id);
  if (!n) return null;
  const value = attributeKey === null ? undefined : n.attributes[attributeKey];
  return (
    <div>
      <strong>{n.id}</strong> · {n.typeId} · grid [{n.grid.join(', ')}]
      {attributeKey !== null && (
        <>
          {' '}
          · {attributeKey}: {value === undefined || value === null ? <em>no value</em> : String(value)}
        </>
      )}
    </div>
  );
}

/** Voxel geometry shared by every cell; created once per view and disposed on unmount. */
function useVoxelGeometry() {
  const geo = useMemo(() => {
    const { horizontal: h, vertical: v } = DEFAULT_CELL_SIZE;
    const box = new BoxGeometry(h * INSET, v * INSET, h * INSET);
    return { box, edges: new EdgesGeometry(box), dashedEdges: new EdgesGeometry(box) };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return geo;
}

import { Html } from '@react-three/drei';
import type { WorldPoint } from '@core/viewer/coordinates';
import { useSceneOptions } from '@core/viewer/three/sceneOptions';
import type { Bounds } from '@core/viewer/three/viewport';

/** "L0", "L1", … labels beside the scene, one per occupied storey. Not pickable. Hidden when the Display turns labels off. */
export function LevelLabels({
  levels,
  bounds,
  levelCentreY,
}: {
  readonly levels: readonly number[];
  readonly bounds: Bounds | null;
  readonly levelCentreY: (level: number) => number;
}) {
  const { labels } = useSceneOptions();
  if (!labels || !bounds || levels.length === 0) return null;
  return (
    <>
      {levels.map((level) => {
        const p: WorldPoint = [bounds.min[0] - 0.6, levelCentreY(level), bounds.max[2]];
        return (
          <Html key={level} position={[...p]} center zIndexRange={[5, 0]} pointerEvents="none">
            <span className="viewer3d-level">L{level}</span>
          </Html>
        );
      })}
    </>
  );
}

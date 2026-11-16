import { useCallback, useMemo, useState } from 'react';
import { resolveBuildingFaces } from '@app/building';
import { NO_SELECTION, type Selection } from '@core/viewer/selection';
import type { ViewProps } from '../../contracts';
import { PlanView, type PlanWallEvent } from '../../plan/PlanView';
import { faceIndex, wallClickSelection } from './wallPanelModel';
import { WallActionPanel } from './WallActionPanel';

/**
 * Plan with shared-wall interaction (wave 2, D): workstream C's `PlanView` plus its `onWallTarget`
 * hook. Hovering an eligible shared wall highlights it (drawn by the Plan); clicking it opens the
 * same wall panel as the Building view. The open wall is view-local state (not a Selection kind):
 * any other click in the Plan (room, opening, background) closes it. Contains no Three.js, so the
 * Plan stays in the main chunk.
 */
export function PlanWallView(props: ViewProps) {
  const { design, onSelect } = props;
  const [activeWall, setActiveWall] = useState<string | null>(null);
  const faces = useMemo(() => (design ? faceIndex(resolveBuildingFaces(design.doc, design.spatial)) : null), [design]);

  const onPlanSelect = useCallback(
    (next: Selection) => {
      setActiveWall(null);
      onSelect(next);
    },
    [onSelect],
  );
  const onWallTarget = useCallback(
    (event: PlanWallEvent) => {
      if (event.type !== 'click') return;
      setActiveWall(event.target.faceId);
      // Same rule as the Building view (I2): an existing relationship is selected, any other shared wall selects its owner room.
      onSelect(faces ? wallClickSelection(event.target.faceId, faces, event.action) : NO_SELECTION);
    },
    [onSelect, faces],
  );

  return (
    <div className="sgl-plan-wall-host">
      <PlanView {...props} onSelect={onPlanSelect} {...(design && { onWallTarget })} activeWall={activeWall} />
      {design && faces && activeWall !== null && (
        <WallActionPanel
          className="in-plan"
          design={design}
          faceId={activeWall}
          faces={faces}
          onSelect={onSelect}
          onClose={() => setActiveWall(null)}
        />
      )}
    </div>
  );
}

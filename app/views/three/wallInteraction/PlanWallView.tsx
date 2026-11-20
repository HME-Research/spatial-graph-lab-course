import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { buildingFacesV2, exampleFacadeProvider } from '@app/building';
import { NO_SELECTION, type Selection } from '@core/viewer/selection';
import type { ViewProps } from '../../contracts';
import { PlanView, type PlanWallEvent } from '../../plan/PlanView';
import { useStyleValues } from '../../styleValues';
import { placeBeside } from './panelPlacement';
import { faceIndex, wallClickSelection } from './wallPanelModel';
import { WallActionPanel } from './WallActionPanel';

/**
 * Plan with shared-wall interaction (wave 2, D): workstream C's `PlanView` plus its `onWallTarget`
 * hook. Hovering an eligible shared wall highlights it (drawn by the Plan); clicking it opens the
 * same wall panel as the Building view, placed beside the point that was clicked (kept inside the
 * view). The open wall is view-local state (not a Selection kind): any other click in the Plan
 * (room, opening, background) closes it. Contains no Three.js, so the Plan stays in the main chunk.
 */
export function PlanWallView(props: ViewProps) {
  const { design, onSelect, project } = props;
  const [activeWall, setActiveWall] = useState<string | null>(null);
  // The SAME faces the Plan draws (`buildingFacesV2`, with the rooms' looks): a wall between an
  // enclosed and an open-walled room is authored by the enclosed room (2026-11-20), so its id matches.
  const styleValues = useStyleValues(design?.doc, design?.spatial, project?.attributes);
  const facade = project?.facade ?? exampleFacadeProvider;
  const faces = useMemo(
    () => (design ? faceIndex(buildingFacesV2(design.doc, design.spatial, facade, styleValues).faces) : null),
    [design, facade, styleValues],
  );
  const host = useRef<HTMLDivElement>(null);
  const anchorBox = useRef<HTMLDivElement>(null);
  /** Last pointer press inside the Plan, in host pixels: where a wall click happened. */
  const lastPress = useRef<{ x: number; y: number } | null>(null);
  const [clickPoint, setClickPoint] = useState<{ x: number; y: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

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
      setClickPoint(lastPress.current);
      // Same rule as the Building view (I2): an existing relationship is selected, any other shared wall selects its owner room.
      onSelect(faces ? wallClickSelection(event.target.faceId, faces, event.action) : NO_SELECTION);
    },
    [onSelect, faces],
  );
  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    const rect = host.current?.getBoundingClientRect();
    if (rect) lastPress.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Place the panel once it is rendered (its size is known), beside the click and inside the view.
  useLayoutEffect(() => {
    const panel = anchorBox.current?.firstElementChild as HTMLElement | null | undefined;
    const view = host.current;
    if (activeWall === null || !panel || !view || !clickPoint) {
      setPlace(null);
      return;
    }
    setPlace(placeBeside(clickPoint, { width: panel.offsetWidth, height: panel.offsetHeight }, { width: view.clientWidth, height: view.clientHeight }));
  }, [activeWall, clickPoint]);

  return (
    <div className="sgl-plan-wall-host" ref={host} onPointerDownCapture={onPointerDownCapture}>
      <PlanView {...props} onSelect={onPlanSelect} {...(design && { onWallTarget })} activeWall={activeWall} />
      {design && faces && activeWall !== null && (
        <div
          ref={anchorBox}
          className={place ? 'sgl-wall-plan-anchor' : 'sgl-wall-plan-anchor docked'}
          style={place ? { left: place.left, top: place.top } : undefined}
        >
          <WallActionPanel className="anchored" design={design} faceId={activeWall} faces={faces} onSelect={onSelect} onClose={() => setActiveWall(null)} />
        </div>
      )}
    </div>
  );
}

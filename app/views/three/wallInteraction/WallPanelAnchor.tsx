import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Vector3, type Camera, type Object3D } from 'three';
import { faceCentre, type BuildingFace } from '@app/building';
import { DEFAULT_CELL_SIZE, type CellSize } from '@core/viewer/coordinates';
import { placeBeside } from './panelPlacement';

/**
 * Pins the shared-wall panel next to the wall it describes in the 3D Building view (inside the
 * Canvas): the panel follows the wall when the camera orbits, pans or zooms. It sits to the right
 * of the wall's centre, flips to the left when there is no room, and is always kept inside the
 * view. Three.js only; the Plan places its panel without this (see `placeBeside`).
 */
export function WallPanelAnchor({
  face,
  cell = DEFAULT_CELL_SIZE,
  children,
}: {
  readonly face: Pick<BuildingFace, 'cell' | 'direction'>;
  readonly cell?: CellSize;
  readonly children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const position = useMemo(() => faceCentre(face.cell, face.direction, cell), [face.cell, face.direction, cell]);
  const point = useMemo(() => new Vector3(), []);
  const calculatePosition = useCallback(
    (el: Object3D, camera: Camera, size: { width: number; height: number }) => {
      point.setFromMatrixPosition(el.matrixWorld).project(camera);
      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      const panel = box.current?.firstElementChild as HTMLElement | null | undefined;
      const width = panel?.offsetWidth || 250;
      const height = panel?.offsetHeight || 160;
      const { left, top } = placeBeside({ x, y }, { width, height }, size);
      return [left, top];
    },
    [point],
  );
  // The view renders on demand: ask for one more frame once the panel is laid out (its real size).
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [invalidate, face.cell, face.direction]);
  return (
    <Html position={position} calculatePosition={calculatePosition} zIndexRange={[30, 20]} wrapperClass="sgl-wall-anchor">
      <div ref={box}>{children}</div>
    </Html>
  );
}

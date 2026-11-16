import { GizmoHelper } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, CanvasTexture, SRGBColorSpace } from 'three';
import type { CameraVector } from './camera';
import { isDeliberateObjectClick } from './interaction';
import { cubeDirection } from './navigation';

/**
 * Y-up navigation cube (workstream E), drawn in drei's `GizmoHelper` HUD (which keeps it turned
 * with the main camera). Faces follow the Three.js world and `BoxGeometry` face order: Right = +X,
 * Left = −X, Top = +Y, Bottom = −Y, Front = +Z, Back = −Z. Clicking a face, an edge or a corner
 * calls `onOrient` with the direction to look from; the caller moves the camera (drei's own tween
 * is not used: it measures the camera distance to the world origin instead of the orbit target).
 *
 * Own materials instead of drei's GizmoViewcube: sRGB-tagged label textures that are not
 * tone-mapped, so the labels stay legible in the tone-mapped Building view.
 */

export const FACE_LABELS = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'] as const;

/** Edge and corner blocks, in the cube's unit frame (like drei's view cube). */
const OFFSET = 0.38;
const EDGES: readonly CameraVector[] = [
  [1, 1, 0], [1, 0, 1], [1, 0, -1], [1, -1, 0], [0, 1, 1], [0, 1, -1],
  [0, -1, 1], [0, -1, -1], [-1, 1, 0], [-1, 0, 1], [-1, 0, -1], [-1, -1, 0],
];
const CORNERS: readonly CameraVector[] = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];

const COLOURS = { face: '#f7f7f4', hover: '#cfdcf2', text: '#2b2b27', stroke: '#7a7a72', block: '#8aa6d6' } as const;

function labelTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = COLOURS.stroke;
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.fillStyle = COLOURS.text;
    ctx.font = '600 27px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 64, 66);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Cube edge (px), distance of its centre from the right edge (px), and how far (px) it sits above the vertical centre (room for the projection toggle below it). */
export const VIEW_CUBE = { size: 46, margin: 46, lift: 14 } as const;

/**
 * `passive` (a room gizmo is shown): the cube fades and ignores the pointer, so it never covers a
 * gizmo handle that reaches the canvas edge.
 */
export function ViewCube({ onOrient, passive = false }: { readonly onOrient: (direction: CameraVector) => void; readonly passive?: boolean }) {
  const { size, margin, lift } = VIEW_CUBE;
  const textures = useMemo(() => FACE_LABELS.map(labelTexture), []);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(
    () => () => {
      textures.forEach((t) => t.dispose());
      geometry.dispose();
    },
    [textures, geometry],
  );
  const [hoverFace, setHoverFace] = useState<number | null>(null);
  const [hoverBlock, setHoverBlock] = useState<string | null>(null);

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!isDeliberateObjectClick(e.delta, e.nativeEvent)) return;
    const p = e.object.position;
    const n = e.face?.normal;
    const direction = cubeDirection([p.x, p.y, p.z], n ? [n.x, n.y, n.z] : null);
    if (direction) onOrient(direction);
  };

  const block = (key: string, v: CameraVector, dims: readonly [number, number, number]) => (
    <mesh
      key={key}
      position={[v[0] * OFFSET, v[1] * OFFSET, v[2] * OFFSET]}
      scale={[dims[0] * 1.01, dims[1] * 1.01, dims[2] * 1.01]}
      geometry={geometry}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoverBlock(key);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHoverBlock((k) => (k === key ? null : k));
      }}
    >
      <meshBasicMaterial color={COLOURS.block} transparent opacity={0.55} visible={hoverBlock === key} toneMapped={false} />
    </mesh>
  );

  return (
    <GizmoHelper alignment="center-right" margin={[margin, 0]}>
      <group position={[0, lift, 0]} scale={size} name="view-cube">
        {passive ? (
          // Faded and not pickable: presses reach the room gizmo underneath.
          <mesh geometry={geometry} raycast={() => null}>
            {textures.map((texture, index) => (
              <meshBasicMaterial key={index} attach={`material-${index}`} map={texture} color={COLOURS.face} transparent opacity={0.28} depthWrite={false} toneMapped={false} />
            ))}
          </mesh>
        ) : (
          <>
            <mesh
              geometry={geometry}
              onClick={click}
              onPointerMove={(e) => {
                e.stopPropagation();
                setHoverFace(typeof e.faceIndex === 'number' ? Math.floor(e.faceIndex / 2) : null);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoverFace(null);
              }}
            >
              {textures.map((texture, index) => (
                <meshBasicMaterial key={index} attach={`material-${index}`} map={texture} color={hoverFace === index ? COLOURS.hover : COLOURS.face} toneMapped={false} />
              ))}
            </mesh>
            {EDGES.map((v, i) => block(`e${i}`, v, [v[0] === 0 ? 0.5 : 0.25, v[1] === 0 ? 0.5 : 0.25, v[2] === 0 ? 0.5 : 0.25]))}
            {CORNERS.map((v, i) => block(`c${i}`, v, [0.25, 0.25, 0.25]))}
          </>
        )}
      </group>
    </GizmoHelper>
  );
}

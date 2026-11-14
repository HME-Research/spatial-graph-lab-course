import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PerspectiveCamera, type Vector3 } from 'three';
import type { WorldPoint } from '../coordinates';
import { isBackgroundClick } from './interaction';
import type { Bounds, CameraFit, GroundGrid } from './sceneModel';
import './viewer3d.css';

/** Vertical field of view used by both 3D views (fitCamera depends on it). */
export const CAMERA_FOV = 45;

const BACKGROUND = '#f3f3ef';

interface SceneCanvasProps {
  readonly fit: CameraFit;
  /** Changing this number re-frames the camera on `fit`. Nothing else moves the camera. */
  readonly fitRequest: number;
  readonly grid: GroundGrid;
  readonly onBackgroundClick: () => void;
  readonly cursor: string;
  /** HTML UI drawn above the canvas (controls, legend). */
  readonly overlay: ReactNode;
  readonly ariaLabel: string;
  readonly children: ReactNode;
}

/**
 * One R3F canvas with its own perspective camera and orbit controls (left-drag orbit,
 * right-drag / shift-drag pan, wheel zoom). Each view instance owns one, so split panels
 * have independent cameras. Background clicks with negligible movement call `onBackgroundClick`.
 */
export function SceneCanvas({
  fit,
  fitRequest,
  grid,
  onBackgroundClick,
  cursor,
  overlay,
  ariaLabel,
  children,
}: SceneCanvasProps) {
  // Stable camera options: R3F re-applies camera props whenever they change shallowly,
  // which would reset the user's view on every render.
  const [cameraOptions] = useState(() => ({
    fov: CAMERA_FOV,
    position: [...fit.position] as [number, number, number],
    near: fit.near,
    far: fit.far,
  }));
  return (
    <div className="viewer3d" style={{ cursor }}>
      <Canvas
        flat
        dpr={[1, 2]}
        camera={cameraOptions}
        aria-label={ariaLabel}
        onPointerMissed={(e) => {
          if (isBackgroundClick(e)) onBackgroundClick();
        }}
      >
        <color attach="background" args={[BACKGROUND]} />
        <hemisphereLight args={['#ffffff', '#cfcbbd', 1.7]} />
        <directionalLight position={[14, 26, 18]} intensity={1.5} />
        <gridHelper
          args={[grid.size, grid.divisions, '#bdbdb3', '#dcdcd3']}
          position={[...grid.center]}
          raycast={() => null}
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.15} screenSpacePanning minDistance={0.5} />
        <CameraRig fit={fit} request={fitRequest} />
        <AfterFirstFrame>{children}</AfterFirstFrame>
      </Canvas>
      <div className="viewer3d-overlay">{overlay}</div>
    </div>
  );
}

interface OrbitControlsLike {
  readonly target: Vector3;
  update(): void;
}

/** Applies `fit` when the controls first appear and whenever `request` changes. */
function CameraRig({ fit, request }: { readonly fit: CameraFit; readonly request: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const latestFit = useRef(fit);
  useEffect(() => {
    latestFit.current = fit;
  }, [fit]);
  useEffect(() => {
    if (!controls) return;
    const f = latestFit.current;
    camera.position.set(...f.position);
    if (camera instanceof PerspectiveCamera) {
      camera.near = f.near;
      camera.far = f.far;
      camera.updateProjectionMatrix();
    }
    controls.target.set(...f.target);
    controls.update();
    invalidate();
  }, [request, controls, camera, invalidate]);
  return null;
}

/**
 * Renders scene content once the canvas has drawn its first frame (one frame of delay).
 * Observed with drei 10.7.9 / R3F 9.8.2 in a browser: the first drei <Html> mounted during the
 * canvas's initial render was never attached to the DOM (the L0 label, or the first node label,
 * was missing). Mounting after the first frame avoids that.
 */
function AfterFirstFrame({ children }: { readonly children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useFrame(() => {
    if (!ready) setReady(true);
  });
  return ready ? <>{children}</> : null;
}

/** "L0", "L1", … labels beside the scene, one per occupied storey. Not pickable. */
export function LevelLabels({
  levels,
  bounds,
  levelCentreY,
  hidden,
}: {
  readonly levels: readonly number[];
  readonly bounds: Bounds | null;
  readonly levelCentreY: (level: number) => number;
  readonly hidden?: (level: number) => boolean;
}) {
  if (!bounds || levels.length === 0) return null;
  return (
    <>
      {levels.map((level) => {
        const p: WorldPoint = [bounds.min[0] - 0.6, levelCentreY(level), bounds.max[2]];
        return (
          <Html key={level} position={[...p]} center zIndexRange={[5, 0]} pointerEvents="none">
            <span className={hidden?.(level) ? 'viewer3d-level faded' : 'viewer3d-level'}>L{level}</span>
          </Html>
        );
      })}
    </>
  );
}

/** Small text label anchored in 3D. Not pickable. */
export function SceneLabel({ position, text, strong }: { readonly position: WorldPoint; readonly text: string; readonly strong?: boolean }) {
  return (
    <Html position={[...position]} center zIndexRange={[4, 0]} pointerEvents="none">
      <span className={strong ? 'viewer3d-label strong' : 'viewer3d-label'}>{text}</span>
    </Html>
  );
}

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PerspectiveCamera, type Camera, type Vector3 } from 'three';
import type { WorldPoint } from '../coordinates';
import { isBackgroundClick } from './interaction';
import { fitCameraToBounds, type CameraMemory, type CameraState, type Framing, type GroundGrid } from './viewport';
import './viewer3d.css';

/** Vertical field of view of the SceneCanvas camera (camera fitting depends on it). */
export const CAMERA_FOV = 45;

const BACKGROUND = '#f3f3ef';

function DefaultLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfcbbd', 1.7]} />
      <directionalLight position={[14, 26, 18]} intensity={1.5} />
    </>
  );
}

interface SceneCanvasProps {
  /** What the automatic fit frames. The fit also depends on the canvas aspect ratio. */
  readonly framing: Framing;
  /** Changing this number re-frames the camera on `framing` (a manual "Fit view"). */
  readonly fitRequest: number;
  readonly grid: GroundGrid;
  readonly onBackgroundClick: () => void;
  readonly cursor: string;
  /** HTML UI drawn above the canvas (controls, legend). */
  readonly overlay: ReactNode;
  readonly ariaLabel: string;
  readonly children: ReactNode;
  /** Keeps the camera pose across remounts (e.g. a split panel closed and reopened). */
  readonly cameraMemory?: CameraMemory | undefined;
  /** Replaces the default hemisphere + directional lights. */
  readonly lighting?: ReactNode;
  readonly background?: string;
  /** Disable tone mapping (default true: colours render as specified). */
  readonly flat?: boolean;
  /** 'demand' renders only when something changes (default 'always'). */
  readonly frameloop?: 'always' | 'demand';
  /** Orbit inertia (default true). */
  readonly damping?: boolean;
}

/**
 * One R3F canvas with its own perspective camera and orbit controls (left-drag orbit,
 * right-drag / shift-drag pan, wheel zoom). Each view instance owns one, so split panels
 * have independent cameras. Background clicks with negligible movement call `onBackgroundClick`.
 *
 * Camera behaviour: the camera starts fitted to `framing` for the canvas's aspect ratio (or at the
 * pose in `cameraMemory`). While it is still in that automatically fitted state, a resize refits it;
 * once the user orbits, pans or zooms it is never moved again except by a new `fitRequest`.
 * The canvas element carries `data-camera="fitted" | "user"` describing that state.
 */
export function SceneCanvas({
  framing,
  fitRequest,
  grid,
  onBackgroundClick,
  cursor,
  overlay,
  ariaLabel,
  children,
  cameraMemory,
  lighting,
  background = BACKGROUND,
  flat = true,
  frameloop = 'always',
  damping = true,
}: SceneCanvasProps) {
  // Stable camera options: R3F re-applies camera props whenever they change shallowly, which would
  // reset the user's view on every render. The CameraRig places the camera before the first frame.
  const [cameraOptions] = useState(() => ({ fov: CAMERA_FOV, position: [10, 10, 10] as [number, number, number], near: 0.1, far: 2000 }));
  return (
    <div className="viewer3d" style={{ cursor, background }}>
      <Canvas
        flat={flat}
        frameloop={frameloop}
        dpr={[1, 2]}
        camera={cameraOptions}
        aria-label={ariaLabel}
        onPointerMissed={(e) => {
          if (isBackgroundClick(e)) onBackgroundClick();
        }}
      >
        <color attach="background" args={[background]} />
        {lighting ?? <DefaultLighting />}
        <gridHelper
          args={[grid.size, grid.divisions, '#bdbdb3', '#dcdcd3']}
          position={[...grid.center]}
          raycast={() => null}
        />
        <OrbitControls makeDefault enableDamping={damping} dampingFactor={0.15} screenSpacePanning minDistance={0.5} />
        <CameraRig framing={framing} request={fitRequest} memory={cameraMemory} />
        <AfterFirstFrame>{children}</AfterFirstFrame>
      </Canvas>
      <div className="viewer3d-overlay">{overlay}</div>
    </div>
  );
}

interface OrbitControlsLike {
  readonly target: Vector3;
  update(): void;
  addEventListener(type: 'start' | 'change', listener: () => void): void;
  removeEventListener(type: 'start' | 'change', listener: () => void): void;
}

function place(camera: Camera, controls: OrbitControlsLike, position: WorldPoint, target: WorldPoint, near?: number, far?: number) {
  camera.position.set(...position);
  if (camera instanceof PerspectiveCamera && near !== undefined && far !== undefined) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  controls.target.set(...target);
  controls.update();
}

/**
 * Owns the camera pose: initial placement (fit or remembered pose), manual fits, refits on resize
 * while fitted, and the fitted → user transition when the orbit controls start an interaction.
 */
function CameraRig({
  framing,
  request,
  memory,
}: {
  readonly framing: Framing;
  readonly request: number;
  readonly memory: CameraMemory | undefined;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const canvas = useThree((s) => s.gl.domElement);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const aspect = height > 0 ? width / height : 1;

  const latest = useRef({ framing, aspect, memory });
  latest.current = { framing, aspect, memory };
  const fitted = useRef(true);
  const placedFor = useRef<{ controls: OrbitControlsLike; request: number } | null>(null);

  const remember = () => {
    const c = controls;
    if (!c) return;
    latest.current.memory?.save({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [c.target.x, c.target.y, c.target.z],
      fitted: fitted.current,
    });
  };
  const setFitted = (value: boolean) => {
    fitted.current = value;
    canvas.dataset['camera'] = value ? 'fitted' : 'user';
  };
  const fit = () => {
    if (!controls) return;
    const { framing: f, aspect: a } = latest.current;
    const placement = fitCameraToBounds(f.bounds, CAMERA_FOV, f.minRadius, a);
    place(camera, controls, placement.position, placement.target, placement.near, placement.far);
    setFitted(true);
    remember();
    invalidate();
  };

  // First placement (remembered pose or fit) once the controls exist, then a fit per new request.
  useEffect(() => {
    if (!controls) return;
    const previous = placedFor.current;
    placedFor.current = { controls, request };
    if (previous && previous.controls === controls && previous.request === request) return;
    const saved: CameraState | undefined = previous ? undefined : latest.current.memory?.load();
    if (saved && !saved.fitted) {
      const { framing: f, aspect: a } = latest.current;
      const placement = fitCameraToBounds(f.bounds, CAMERA_FOV, f.minRadius, a);
      place(camera, controls, saved.position, saved.target, placement.near, placement.far);
      setFitted(false);
      invalidate();
    } else fit();
  }, [controls, request, camera, invalidate]);

  // Resizing refits only while the camera still shows the automatic fit.
  useEffect(() => {
    if (controls && fitted.current) fit();
  }, [aspect]);

  // Any user interaction (orbit, pan, zoom) ends the fitted state; every change is remembered.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => setFitted(false);
    controls.addEventListener('start', onStart);
    controls.addEventListener('change', remember);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('change', remember);
    };
  }, [controls]);

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

/** Small text label anchored in 3D. Not pickable. */
export function SceneLabel({ position, text, strong }: { readonly position: WorldPoint; readonly text: string; readonly strong?: boolean }) {
  return (
    <Html position={[...position]} center zIndexRange={[4, 0]} pointerEvents="none">
      <span className={strong ? 'viewer3d-label strong' : 'viewer3d-label'}>{text}</span>
    </Html>
  );
}

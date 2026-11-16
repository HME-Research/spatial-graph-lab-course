import { Html, OrbitControls, OrthographicCamera as DreiOrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { OrthographicCamera, PerspectiveCamera, type Camera, type Vector3 } from 'three';
import type { WorldPoint } from '../coordinates';
import type { CameraBus, CameraHandle, CameraPose, CameraProjection, CameraVector } from './camera';
import { isBackgroundClick } from './interaction';
import { convertPose, isYUp, orientedPosition, orthoZoom, visibleHeight, Y_UP } from './navigation';
import { ManipulatorContext } from './manipulators';
import { useSceneOptions } from './sceneOptions';
import { ViewCube } from './ViewCube';
import { fitCameraToBounds, type CameraMemory, type CameraState, type Framing, type GroundGrid } from './viewport';
import './viewer3d.css';

/** Vertical field of view of the SceneCanvas camera (camera fitting depends on it). */
export const CAMERA_FOV = 45;

const BACKGROUND = '#f3f3ef';

/** Canvases smaller than this (CSS px) hide the navigation cube and projection toggle (overlays need the room). */
export const NAV_MIN_WIDTH = 300;
export const NAV_MIN_HEIGHT = 200;

function DefaultLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfcbbd', 1.7]} />
      <directionalLight position={[14, 26, 18]} intensity={1.5} />
    </>
  );
}

/** Display preset `soft`: even, low-contrast light from all sides (replaces the view's lights). */
function SoftLighting() {
  return (
    <>
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#ffffff', '#e4e0d6', 0.9]} />
      <directionalLight position={[14, 26, 18]} intensity={0.45} />
      <directionalLight position={[-18, 12, -14]} intensity={0.3} />
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
  /** Replaces the default hemisphere + directional lights (unless the scene options ask for `soft` lighting). */
  readonly lighting?: ReactNode;
  readonly background?: string;
  /** Disable tone mapping (default true: colours render as specified). */
  readonly flat?: boolean;
  /** 'demand' renders only when something changes (default 'always'). */
  readonly frameloop?: 'always' | 'demand';
  /** Orbit inertia (default true). */
  readonly damping?: boolean;
  /**
   * With `cameraBus`: this canvas registers its camera on the bus under this id (capture / apply a
   * `CameraPose`) and unregisters on unmount. Without both props nothing is registered.
   */
  readonly viewportId?: string | undefined;
  readonly cameraBus?: CameraBus | undefined;
}

/** What the camera rig offers the navigation cube and the projection toggle. */
interface RigApi {
  orient(direction: CameraVector): void;
  switchProjection(to: CameraProjection): void;
}

/**
 * One R3F canvas with its own camera and orbit controls (left-drag orbit, right-drag / shift-drag
 * pan, wheel zoom). Each view instance owns one, so split panels have independent cameras.
 * Background clicks with negligible movement call `onBackgroundClick`.
 *
 * Camera behaviour: the camera starts fitted to `framing` for the canvas's aspect ratio (or at the
 * pose in `cameraMemory`). While it is still in that automatically fitted state, a resize refits it;
 * once the user orbits, pans or zooms it is never moved again except by a new `fitRequest`, the
 * navigation cube or a camera-bus apply. The canvas element carries `data-camera="fitted" | "user"`
 * describing that state and `data-camera-pose` (rounded, for automated checks); the wrapper carries
 * `data-projection="perspective" | "orthographic"`.
 *
 * Scene options (`./sceneOptions`, provided by the host): `soft` lighting, label and legend
 * visibility, whether the canvas may switch to an **orthographic** projection (toggle under the
 * cube; perspective is the default and stays the only projection when not allowed), and the
 * Y-up **navigation cube** (centre-right; clicking a face, edge or corner looks from that side).
 * Both are hidden on canvases smaller than NAV_MIN_WIDTH × NAV_MIN_HEIGHT.
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
  viewportId,
  cameraBus,
}: SceneCanvasProps) {
  const options = useSceneOptions();
  // Stable camera options: R3F re-applies camera props whenever they change shallowly, which would
  // reset the user's view on every render. The CameraRig places the camera before the first frame.
  const [cameraOptions] = useState(() => ({ fov: CAMERA_FOV, position: [10, 10, 10] as [number, number, number], near: 0.1, far: 2000 }));
  const [chosenProjection, setProjection] = useState<CameraProjection>(() =>
    cameraMemory?.load()?.projection === 'orthographic' ? 'orthographic' : 'perspective',
  );
  const projection: CameraProjection = options.orthographic ? chosenProjection : 'perspective';
  const rig = useRef<RigApi | null>(null);
  const [navRoom, setNavRoom] = useState(true);
  // A shown manipulator (room gizmo) makes the cube and the projection toggle step back: faded, click-through.
  const [manipulators, setManipulators] = useState(0);
  const reportManipulator = useCallback((delta: 1 | -1) => setManipulators((n) => Math.max(0, n + delta)), []);
  const stepBack = manipulators > 0;

  return (
    <div className="viewer3d" style={{ cursor, background }} data-projection={projection}>
      <ManipulatorContext.Provider value={reportManipulator}>
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
        {options.lighting === 'soft' ? <SoftLighting /> : (lighting ?? <DefaultLighting />)}
        <gridHelper
          args={[grid.size, grid.divisions, '#bdbdb3', '#dcdcd3']}
          position={[...grid.center]}
          raycast={() => null}
        />
        {/* Mounted only while orthographic: it becomes the default camera; unmounting restores the perspective one. */}
        {projection === 'orthographic' && <DreiOrthographicCamera makeDefault near={0.01} far={4000} />}
        <OrbitControls makeDefault enableDamping={damping} dampingFactor={0.15} screenSpacePanning minDistance={0.5} />
        <CameraRig
          framing={framing}
          request={fitRequest}
          memory={cameraMemory}
          viewportId={viewportId}
          bus={viewportId !== undefined ? cameraBus : undefined}
          projection={projection}
          allowOrthographic={options.orthographic}
          onProjection={setProjection}
          api={rig}
        />
        <NavigationRoom onChange={setNavRoom} />
        {options.navigationCube && navRoom && <ViewCube passive={stepBack} onOrient={(direction) => rig.current?.orient(direction)} />}
        <AfterFirstFrame>{children}</AfterFirstFrame>
      </Canvas>
      </ManipulatorContext.Provider>
      <div className="viewer3d-overlay" data-legend={options.legend ? 'on' : 'off'}>
        {overlay}
      </div>
      {navRoom && options.orthographic && (
        <div className={['viewer3d-nav', options.navigationCube ? '' : 'no-cube', stepBack ? 'passive' : ''].filter(Boolean).join(' ')}>
          <button
            type="button"
            className="viewer3d-projection"
            tabIndex={stepBack ? -1 : undefined}
            aria-pressed={projection === 'orthographic'}
            title={
              projection === 'orthographic'
                ? 'Orthographic (parallel) projection: true proportions, useful with the Top, Front and Right faces of the cube. Click for perspective.'
                : 'Perspective projection. Click for an orthographic (parallel) projection.'
            }
            onClick={() => rig.current?.switchProjection(projection === 'orthographic' ? 'perspective' : 'orthographic')}
          >
            {projection === 'orthographic' ? 'Ortho' : 'Persp'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Reports whether the canvas is large enough for the navigation cube and projection toggle. */
function NavigationRoom({ onChange }: { readonly onChange: (room: boolean) => void }) {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const room = width >= NAV_MIN_WIDTH && height >= NAV_MIN_HEIGHT;
  useEffect(() => onChange(room), [room, onChange]);
  return null;
}

interface OrbitControlsLike {
  readonly object: Camera;
  readonly target: Vector3;
  update(): void;
  addEventListener(type: 'start' | 'change', listener: () => void): void;
  removeEventListener(type: 'start' | 'change', listener: () => void): void;
}

const projectionOf = (camera: Camera): CameraProjection | null =>
  camera instanceof OrthographicCamera ? 'orthographic' : camera instanceof PerspectiveCamera ? 'perspective' : null;

const distanceOf = (pose: { readonly position: CameraVector; readonly target: CameraVector }): number =>
  Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);

const stateToPose = (s: CameraState): CameraPose => ({
  projection: s.projection ?? 'perspective',
  position: s.position,
  target: s.target,
  up: Y_UP,
  fov: s.fov,
  orthoHeight: s.orthoHeight,
});

/**
 * Owns the camera pose: initial placement (fit or remembered pose), manual fits, refits on resize
 * while fitted, the fitted → user transition when the orbit controls start an interaction, the
 * navigation cube's orientations and projection switches (a user pose is carried across: the
 * orthographic height equals what the perspective camera showed at the target).
 *
 * With `bus` + `viewportId` it also registers a CameraBus handle (F-D, ./camera.ts):
 * - capture: the live pose (perspective with `fov`; orthographic with `orthoHeight`).
 * - apply: +Y-up poses only; orthographic poses only where the scene options allow orthographic
 *   (otherwise `accepts` refuses and the bus answers 'unavailable'). A pose in the other projection
 *   switches this canvas's projection first and is placed on the new camera. An applied pose ends
 *   the fitted state like a user orbit and is saved to `memory` (including `fov` / `orthoHeight`).
 * - available: false while the canvas is detached or not displayed (a hidden viewport), so a hidden
 *   viewport is never targeted. Unregistered on unmount (and briefly while the projection switches).
 */
function CameraRig({
  framing,
  request,
  memory,
  viewportId,
  bus,
  projection,
  allowOrthographic,
  onProjection,
  api,
}: {
  readonly framing: Framing;
  readonly request: number;
  readonly memory: CameraMemory | undefined;
  readonly viewportId: string | undefined;
  readonly bus: CameraBus | undefined;
  readonly projection: CameraProjection;
  readonly allowOrthographic: boolean;
  readonly onProjection: (projection: CameraProjection) => void;
  readonly api: MutableRefObject<RigApi | null>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const canvas = useThree((s) => s.gl.domElement);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const aspect = height > 0 ? width / height : 1;

  // Camera and controls are a usable pair once the controls drive this camera in the wanted projection.
  const ready = controls !== null && controls.object === camera && projectionOf(camera) === projection;
  const live = useRef({ camera, controls, ready });
  live.current = { camera, controls, ready };
  const latest = useRef({ framing, aspect, height, memory });
  latest.current = { framing, aspect, height, memory };
  const fitted = useRef(true);
  const placedFor = useRef<{ controls: OrbitControlsLike; request: number } | null>(null);
  /** A pose waiting for the projection switch it caused. */
  const pending = useRef<CameraPose | null>(null);
  /** The last remembered pose (kept when the controls are replaced without a carried pose). */
  const lastPose = useRef<CameraPose | null>(null);

  const capture = (): CameraPose | null => {
    const { camera: cam, controls: c } = live.current;
    if (!c) return null;
    const position: [number, number, number] = [cam.position.x, cam.position.y, cam.position.z];
    const target: [number, number, number] = [c.target.x, c.target.y, c.target.z];
    const up: [number, number, number] = [cam.up.x, cam.up.y, cam.up.z];
    if (cam instanceof OrthographicCamera)
      return { projection: 'orthographic', position, target, up, orthoHeight: (cam.top - cam.bottom) / cam.zoom };
    return { projection: 'perspective', position, target, up, fov: cam instanceof PerspectiveCamera ? cam.fov : CAMERA_FOV };
  };
  const remember = () => {
    const pose = live.current.ready ? capture() : null;
    if (!pose) return;
    lastPose.current = pose;
    // Rounded pose for automated browser checks (e.g. a recalled camera equals the saved one).
    const r = (v: readonly number[]) => v.map((x) => x.toFixed(2)).join(',');
    canvas.dataset['cameraPose'] =
      `${pose.projection}|${r(pose.position)}|${r(pose.target)}|${(pose.projection === 'perspective' ? pose.fov : pose.orthoHeight)?.toFixed(2)}`;
    latest.current.memory?.save({
      position: pose.position,
      target: pose.target,
      fitted: fitted.current,
      projection: pose.projection,
      ...(pose.projection === 'perspective' ? { fov: pose.fov } : { orthoHeight: pose.orthoHeight }),
    });
  };
  const setFitted = (value: boolean) => {
    fitted.current = value;
    canvas.dataset['camera'] = value ? 'fitted' : 'user';
  };
  /** Places the live camera at `pose` (already in the live projection). */
  const applyPose = (pose: CameraPose) => {
    const { camera: cam, controls: c } = live.current;
    if (!c) return;
    const { framing: f, aspect: a, height: h } = latest.current;
    if (cam instanceof PerspectiveCamera) {
      cam.fov = pose.fov ?? CAMERA_FOV;
      const placement = fitCameraToBounds(f.bounds, cam.fov, f.minRadius, a);
      cam.near = placement.near;
      cam.far = placement.far;
      cam.updateProjectionMatrix();
    } else if (cam instanceof OrthographicCamera) {
      const placement = fitCameraToBounds(f.bounds, CAMERA_FOV, f.minRadius, a);
      const distance = distanceOf(pose);
      cam.zoom = orthoZoom(h, pose.orthoHeight ?? visibleHeight(distance, CAMERA_FOV));
      cam.near = 0.01;
      cam.far = Math.max(placement.far, distance * 4);
      cam.updateProjectionMatrix();
    }
    cam.up.set(...Y_UP);
    cam.position.set(...pose.position);
    c.target.set(...pose.target);
    c.update();
  };
  const fit = () => {
    if (!live.current.controls) return;
    const { framing: f, aspect: a } = latest.current;
    const placement = fitCameraToBounds(f.bounds, CAMERA_FOV, f.minRadius, a);
    applyPose({
      projection,
      position: placement.position,
      target: placement.target,
      up: Y_UP,
      fov: CAMERA_FOV,
      orthoHeight: visibleHeight(distanceOf(placement), CAMERA_FOV),
    });
    setFitted(true);
    remember();
    invalidate();
  };
  /** A user pose (any projection; converted to the live one). Ends the fitted state. */
  const place = (pose: CameraPose) => {
    applyPose(convertPose(pose, projection, CAMERA_FOV));
    setFitted(false);
    remember();
    invalidate();
  };

  // Placement: first (remembered pose or fit), after a projection switch (the carried pose), per new fit request.
  useEffect(() => {
    if (!ready || !controls) return;
    const previous = placedFor.current;
    placedFor.current = { controls, request };
    const carried = pending.current;
    pending.current = null;
    if (previous && previous.request !== request) return fit();
    if (previous && previous.controls === controls) return;
    if (carried) return place(carried);
    if (previous) {
      // New controls without a carried pose: a fitted camera is refitted in the new projection,
      // a user camera keeps its last pose.
      if (fitted.current || !lastPose.current) fit();
      else place(lastPose.current);
      return;
    }
    const saved = latest.current.memory?.load();
    if (saved && !saved.fitted) place(stateToPose(saved));
    else fit();
  }, [ready, controls, request, camera, projection, invalidate]);

  // Resizing refits only while the camera still shows the automatic fit. An orthographic user view
  // keeps its visible world height (its zoom is pixel-based, so it is recomputed for the new height).
  useEffect(() => {
    if (!ready) return;
    if (fitted.current) return fit();
    const last = lastPose.current;
    if (camera instanceof OrthographicCamera && last?.projection === 'orthographic' && last.orthoHeight !== undefined) {
      camera.zoom = orthoZoom(height, last.orthoHeight);
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [aspect, height]);

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

  const accepts = (pose: CameraPose) => isYUp(pose.up) && (pose.projection === 'perspective' || allowOrthographic);
  const applyRequest = (pose: CameraPose) => {
    // The bus only calls apply after `accepts`; re-checked so a direct call cannot misapply.
    if (!accepts(pose)) return;
    if (pose.projection !== projection) {
      // Switch first; the placement effect places the pose on the new camera.
      pending.current = pose;
      setFitted(false);
      onProjection(pose.projection);
      invalidate();
      return;
    }
    place(pose);
  };

  api.current = {
    orient: (direction) => {
      const pose = ready ? capture() : null;
      if (!pose) return;
      place({ ...pose, position: orientedPosition(pose.target, direction, distanceOf(pose)), up: Y_UP });
    },
    switchProjection: (to) => {
      if (to === projection || (to === 'orthographic' && !allowOrthographic)) return;
      // A fitted camera is simply refitted in the new projection; a user pose is carried over.
      const pose = ready && !fitted.current ? capture() : null;
      pending.current = pose ? convertPose(pose, to, CAMERA_FOV) : null;
      onProjection(to);
      invalidate();
    },
  };

  // Camera bus registration (only with both a bus and a viewport id).
  useEffect(() => {
    if (!ready || !controls || !bus || viewportId === undefined) return;
    const handle: CameraHandle = {
      available: () => canvas.isConnected && canvas.getClientRects().length > 0,
      accepts,
      capture: () => capture()!,
      apply: applyRequest,
    };
    return bus.register(viewportId, handle);
  }, [ready, bus, viewportId, controls, camera, canvas, invalidate, projection, allowOrthographic]);

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

/** Small text label anchored in 3D. Not pickable. Hidden when the scene options turn labels off. */
export function SceneLabel({ position, text, strong }: { readonly position: WorldPoint; readonly text: string; readonly strong?: boolean }) {
  const { labels } = useSceneOptions();
  if (!labels) return null;
  return (
    <Html position={[...position]} center zIndexRange={[4, 0]} pointerEvents="none" wrapperClass="viewer3d-label-wrap">
      <span className={strong ? 'viewer3d-label strong' : 'viewer3d-label'}>{text}</span>
    </Html>
  );
}

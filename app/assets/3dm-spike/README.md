# 3DM façade spike (wave2-G): adapter prototype

Status: **spike, not wired into the app.** Nothing imports this folder. It adds no dependency,
and it does not import `rhino3dm`, React or Three.js. The rhino3dm experiments ran in a scratch
harness outside the repository. The finish report in the owner's planning folder records them.

## What it is
`facadeAdapter.ts` is a pure, typed adapter. It takes plain triangle meshes (source units, Z-up),
which a lazily loaded `.3dm` reader would hand over, and maps them onto the Gate F `FaceLayout`
frames.

- **`normaliseFacadeSource`**:
  - validates the meshes, converts units to metres (unitless files only with an explicit choice), and maps Z-up to Y-up once through `zUpToYUp`;
  - moves the source bounding box to a panel frame: `a` = rightward as seen from outside, `b` = up, `c` = outward, with `c = 0` at the back;
  - refuses empty, invalid, degenerate, over-budget, implausibly large (wrong units) or too-deep (not a façade) input, and reports the reason as diagnostics.
- **Source convention:**
  - x runs along the façade, z is up and y is depth;
  - the exterior faces −y (Rhino Front view) by default. `outward: '+y'` is a 180° rotation, never a mirror.
- **`targetFromFaceFrame` / `targetFromWallRun`:**
  - The target is one bay (cell width × storey height), or one contiguous coplanar `WallRun` (n × bay).
  - `right = up × normal`. On `+x` and `+y` walls the layout `u` points left as seen from outside, so `u` is not used directly.
- **`repeatPlacements`** (Repeat unit bays): one fitted instance per face.
- **`stretchPlacement`** (Stretch wall run): one instance fitted across the whole run.
- **Placement output:** each placement is a column-major 4×4 matrix (Three.js `Matrix4.fromArray` order) with the scale it applies.
  - Width and height are fitted exactly. Depth is never scaled.
  - The back of the component sits half a wall thickness outside the wall centre plane.
  - `distortionDiagnostics` flags any scaling of more than 5 %.

## Tests
Run `npx vitest --run app/assets`. The tests use synthetic typed arrays shaped like the scratch-harness `.3dm` samples (F1, F2 and F5). They use real `layoutFace` frames and real `groupWallRuns` runs.

## Not decided here (owner decisions, see finish report)
- The dependency, its Vite build handling, asset storage and export, mount offset, fit policy, and the outward-axis convention.
- Where this code finally lives: a pure `assets` layer in `app/boundary.test.ts` is an integration-owner change.

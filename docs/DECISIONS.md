# Decision record — v0.1 (12 November 2026)

## Confirmed for prototype
- Repo: `spatial-graph-lab` (private during development). Workshop: **Graph, Rules & Space**.
- Browser-only app; React + TypeScript + Vite; React Flow for abstract 2D graph, React Three Fiber/Three.js for 3D views; Vitest and Zod. No Graphology, API/backend, multiplayer or database initially.
- Single graph document shared by Graph 2D / Graph 3D / Voxels / Architecture. Optional split view with two independent mode selectors, shared node/edge selection, independent cameras.
- Graph 2D is an **abstract diagram of the entire 3D building**; not floor-level slices. Preserve the graph's manual diagram layout separately from physical coordinates.
- Sparse unbounded-in-principle integer grid; configurable safety limits. First example can be 3 × 3 cells, but this is **not** the global grid boundary. Default cell dimension proposed: 3m × 3m × 3m, configurable centrally.
- Student-extensible node types; graph relationships determine shared boundary type; node type determines exposed façade configuration. No imported geometry required for initial prototype.
- Horizontal adjacency: no edge=solid wall; `door`=door opening; `open`=no separating wall. Vertical edges conceptually supported as `atrium` or `vertical-access`, with first full geometry implementation deferred.
- Owner-only local plan and development instructions must be gitignored; no core code required in this specification package.

## Architecture refactor — Stage 1 (14 November 2026)
- Target layout: `core/` generic reusable capabilities; `app/` application behaviour, building generation and UI composition; `student-api/` stable student extension interface; `projects/` independent projects (`types/`, `designs/`, `algorithms/`). No `src/`, `lib/`, `domains/` or `apps/`.
- Stage 1 extracts a generic graph core into `core/graph` (no spatial, architectural, UI or JSON-format assumptions; directed/undirected; self-loop and parallel-edge policy per graph). The former graph module moves unchanged in behaviour to `core/spatial` and uses the core through `designGraph(doc)`.
- v1 JSON document format, IDs, grid coordinates, edge kinds and their face-adjacency rules, issue codes/messages, commands and viewer contracts are unchanged; golden tests in `core/spatial/compat.test.ts` pin them.
- Moving `core/spatial`, `core/architecture`, `core/viewer` and `core/app` under `app/`, and creating `student-api/` and `projects/`, are later stages.

## Deferred / not yet verified
- Full parametric face design tools, custom face code, GLB asset loading, stair markers, algorithm generation, multi-floor architectural slab joining, public hosting, class assignments, class-scale permission workflow.
- Exact component parameters, site grid performance thresholds, geometry detail, architectural materials and deployment provider.

## Potential disagreement to test early
- If all student creativity is limited to node types and prefab façades, resulting architecture may appear too repetitive. Prototype the viewer with three contrasting type definitions before extending the asset system.
- A 2D abstract graph editor with arbitrary diagram coordinates requires **separate** editing controls for physical grid position and must disambiguate edge semantics.

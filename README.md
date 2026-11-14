# Spatial Graph Lab
**Workshop:** Graph, Rules & Space — Bartlett AD Skills Module

A browser-only application, implemented in phases by the owner. **Current status: Phase 1**: runtime skeleton, canonical graph schema with validation, and a minimal read-only app shell that loads and validates a design JSON. 2D/3D viewers, editing and architecture generation are not implemented yet.

## Product intention
One sparse 3D architectural graph, visualised simultaneously as an abstract 2D graph, a 3D spatial graph, semitransparent voxels and generated architecture. The initial implementation is browser-only, with a 2D graph editor, independent split-view panels and architectural boundaries derived from graph relationships.

## Directory ownership
- `core/`: reusable infrastructure (generic graph, grid maths, 3D viewport/selection helpers); maintained by the owner.
- `app/`: the application itself (v1 design document, building rules and geometry, views, state, inspector); maintained by the owner and protected from student edits in the same way as `core/`.
- `student-api/`: the stable Student API that project code imports (`@student-api`); maintained by the owner.
- `projects/<project-id>/`: student projects (`project.ts`, `types/`, `designs/`, `algorithms/`). `projects/example-gallery/` is the reference project; see `docs/STUDENT-API.md`.
- `.claude/`: shared AI project instructions, skills and settings.
- `_planning/`, `CLAUDE.local.md`, `.claude/skills/owner-*`: **local-only files**, ignored by Git. Keep them on the owner's machine. They must not be committed.

## First release scope
- 2D abstract graph of the **whole** 3D building, not a floor-plan slice; dragging a diagram node must not alter spatial coordinates.
- 3D graph; 3D attribute-coloured translucent voxel view; architectural 3D view.
- Single/split view, shared selection, independent cameras, graph-2D editing, node/edge inspector.
- Sparse integer coordinates. Each grid cell has fixed dimensions (initial default 3×3×3 metres); no full grid allocation.
- Node types and edge types resolve architectural faces. Only face-adjacent cells can form architectural doorway/open relationships.
- JSON save/load with version and validation; test suite. No backend.

## Getting started
Requires Node.js `>=22.12` (or `^20.19`) and npm.

```sh
npm ci              # install exact versions from package-lock.json
npm run dev         # start the development server, then open the printed local URL
npm run typecheck   # TypeScript strict type checking
npm test -- --run   # run unit tests once (omit --run for watch mode)
npm run check:project  # check every project in projects/ (add -- -t <project-id> for one)
npm run build       # typecheck + production build into dist/
npm run preview     # serve the production build locally
```

The app loads the built-in example `app/document/examples/two-storey-example.json` at startup when no project provides a default design; normally the active project's default design is opened (see `docs/STUDENT-API.md`). **Open JSON…** loads another design file. It's validated first, and if it's invalid the errors are listed with their location and the current design is kept.

## Design file format (schema v1)
See `docs/ARCHITECTURE.md` for the full contract. In brief:
- `grid` is a unique integer spatial cell `[x, y, z]`; **z is the storey (up) axis**.
- `diagram.positions` are independent 2D diagram coordinates; they never move the spatial cell.
- Edges are explicit and typed: `door` / `open` need horizontal face adjacency; `atrium` / `vertical-access` need vertical face adjacency. Adjacent cells are never connected automatically.
- Unknown keys are rejected so typos surface as errors.

## Development
Read `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. The owner uses the ignored `_planning/implementation-plan.md` and local Claude skill `/owner-implement-phase`. Implement only one phase, test it, inspect changes, then commit. Reusable code lives under `core/` (`core/graph` generic graph, `core/spatial` grid maths, `core/viewer` viewport/selection infrastructure); the application lives under `app/` (`app/document` v1 design document, `app/building` architectural rules and geometry, `app/views` the four views, plus the shell and inspector). See `docs/ARCHITECTURE.md` for the module rules; `@core/*`, `@app/*` and `@student-api` import aliases are defined in `tsconfig.json`.

## GitHub Free / private repository warning
On GitHub Free, private repositories do **not** have enforced protected-branch controls. Do **not** invite student collaborators with write permissions under the assumption that `main` is protected. See `docs/GITHUB-ACCESS.md` for options before class. Claude instructions and local hooks do not enforce GitHub permissions.

## References
- [Claude Code project instructions and settings](https://code.claude.com/docs/en/settings)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Vite](https://vite.dev/guide/features.html)

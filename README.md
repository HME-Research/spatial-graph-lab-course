# Spatial Graph Lab

A browser-based teaching tool that shows how a graph of rooms and relationships becomes architecture. It was built for the course *Graph, Rules & Space* (Bartlett AD Skills Module).

Developed by Heba Eiz.

**Live app:** https://spatial-graph-lab.vercel.app/

## What it does
One sparse 3D architectural graph is shown at the same time as an abstract 2D diagram, a 3D spatial graph, semitransparent voxels and generated architecture.

- The 2D diagram shows the **whole** building and uses its own diagram coordinates. Dragging a node there never moves the room in 3D.
- Rooms sit in unique integer cells (`position`, default 3×3×3 m each); only occupied cells are stored.
- Relationships are explicit and typed. Only face-adjacent cells can form architectural doors or openings, and adjacent cells are never connected automatically.
- Node and edge types resolve the architectural faces. Toolkits supply room types, designs and algorithms.
- Single or split view, shared selection, independent cameras, graph editing, and JSON save/load with validation. Everything runs in the browser; there is no backend.

## Getting started
Requires Node.js `>=22.12` (or `^20.19`) and npm.

```sh
npm ci                 # install exact versions from package-lock.json
npm run dev            # start the development server, then open the printed local URL
npm run typecheck      # TypeScript strict type checking
npm test -- --run      # run unit tests once (omit --run for watch mode)
npm run check:toolkit  # check every toolkit in toolkits/ (add -- -t <toolkit-id> for one)
npm run build          # typecheck + production build into dist/
npm run preview        # serve the production build locally
```

Opening a design file validates it first. If it is invalid, the errors are listed with their location and the current design is kept.

## Project layout
- `core/`: reusable graph, spatial and viewer infrastructure (owner-maintained).
- `app/`: the application: design document, building rules and geometry, views, state, inspector and UI (owner-maintained).
- `student-api/`: the stable Student API that toolkit code imports as `@student-api` (owner-maintained).
- `toolkits/<toolkit-id>/`: student toolkits (`toolkit.ts`, `functions/`, `designs/`, `algorithms/`). The reference toolkit will be `toolkits/house/`; see `docs/STUDENT-API.md`.
- `docs/`: architecture, decisions and workflow documents.
- `.claude/`: shared AI project instructions, skills and settings.

`@core/*`, `@app/*` and `@student-api` import aliases are defined in `tsconfig.json`.

## Documentation
- `docs/ARCHITECTURE.md`: the full contract (graph, coordinates, edges, module rules).
- `docs/DECISIONS.md`: design decisions.
- `docs/STUDENT-API.md`: writing a toolkit.
- `docs/DEVELOPMENT-WORKFLOW.md`: how changes are made and checked.
- `docs/GITHUB-ACCESS.md`: repository access options.

## GitHub Free / private repository warning
On GitHub Free, private repositories do **not** have enforced protected-branch controls. Do **not** invite student collaborators with write permissions under the assumption that `main` is protected. See `docs/GITHUB-ACCESS.md` for options before class. Claude instructions and local hooks do not enforce GitHub permissions.

## References
- [Claude Code project instructions and settings](https://code.claude.com/docs/en/settings)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Vite](https://vite.dev/guide/features.html)

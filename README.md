# Spatial Graph Lab
**Workshop:** Graph, Rules & Space — Bartlett AD Skills Module

This repository is a *specification-first starter package*, not yet a running application. The owner will implement the app in phases using the local `_planning/` materials. Do not run `npm install` until `package.json` and the app have been generated in implementation phase 1.

## Product intention
One sparse 3D architectural graph, visualised simultaneously as an abstract 2D graph, a 3D spatial graph, semitransparent voxels and generated architecture. The initial implementation is browser-only, with a 2D graph editor, independent split-view panels and architectural boundaries derived from graph relationships.

## Directory ownership
- `core/`: application infrastructure, graph validation, face resolver, geometry and viewers; maintained by the owner.
- `student/`: safe extension points for designs, node types, algorithms and assets (enabled progressively).
- `.claude/`: shared AI project instructions, skills and settings.
- `_planning/`, `CLAUDE.local.md`, `.claude/skills/owner-*`: **local-only files**, ignored by Git. Keep them on the owner's machine. They must not be committed.

## First release scope
- 2D abstract graph of the **whole** 3D building, not a floor-plan slice; dragging a diagram node must not alter spatial coordinates.
- 3D graph; 3D attribute-coloured translucent voxel view; architectural 3D view.
- Single/split view, shared selection, independent cameras, graph-2D editing, node/edge inspector.
- Sparse integer coordinates. Each grid cell has fixed dimensions (initial default 3×3×3 metres); no full grid allocation.
- Node types and edge types resolve architectural faces. Only face-adjacent cells can form architectural doorway/open relationships.
- JSON save/load with version and validation; test suite. No backend.

## Development
Read `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. The owner uses the ignored `_planning/implementation-plan.md` and local Claude skill `/owner-implement-phase`. Implement only one phase, test it, inspect changes, then commit. The plan's phases are not yet implemented.

## GitHub Free / private repository warning
On GitHub Free, private repositories do **not** have enforced protected-branch controls. Do **not** invite student collaborators with write permissions under the assumption that `main` is protected. See `docs/GITHUB-ACCESS.md` for options before class. Claude instructions and local hooks do not enforce GitHub permissions.

## References
- [Claude Code project instructions and settings](https://code.claude.com/docs/en/settings)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Vite](https://vite.dev/guide/features.html)

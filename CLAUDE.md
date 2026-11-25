# Spatial Graph Lab — shared Claude Code project instructions

Project: browser-based graph-to-architecture teaching tool for *Graph, Rules & Space*. Read `lab/docs/ARCHITECTURE.md` and `lab/docs/DECISIONS.md` before code changes.

## Source ownership
- `lab/core/` (reusable graph, spatial and viewer infrastructure), `lab/app/` (application document, building rules, toolkit extensions, views, state and UI) and `lab/student-api/` (the stable Student API) are owner-maintained. **For student tasks, never edit, delete, rename, or regenerate files in `lab/core/`, `lab/app/`, `lab/student-api/`, the root build configuration (`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`), `.claude/`, `.github/` or `lab/docs/`.** Students work only inside their own toolkit folder `toolkits/<toolkit-id>/` (`functions/`, `algorithms/`, `designs/`, `assets/`, `lib/`, `toolkit.ts`, `README.md`) on their own branch `toolkit/<toolkit-id>`. The owner's reference toolkit is `toolkits/house/`: never edit it. Start a new toolkit from the starter `lab/docs/templates/toolkit/my-toolkit/` as described in `lab/docs/TOOLKITS.md` (skill `create-toolkit`; instructions for any AI assistant: `lab/docs/ai-kit/toolkit/PROMPT.md`).
- The owner can explicitly authorise `lab/core/` or `lab/app/` development by invoking the local-only owner workflow. Written instructions, CODEOWNERS, import aliases and boundary tests are not an access-control boundary; do not claim otherwise.
- Do not silently alter schema version, edge semantics, coordinate conventions, entry points or extension contracts.

## Invariants
- Graph is the canonical source of truth; renderers consume graph data and do not modify it.
- The 2D graph uses **diagram coordinates**, independent of 3D spatial coordinates. Dragging in the diagram must not move the architectural cell.
- Spatial coordinates are unique integer tuples; only existing occupied cells are stored.
- Architecture-driving edges require **face adjacency** and have explicit types; adjacent cells without access edge get an internal solid boundary.
- Compute each shared face exactly once. An isolated exposed side becomes an exterior face, styled according to its Function.
- A 3D graph edge is a relationship; it is not a physical staircase or corridor guarantee.
- Validate imported designs, toolkit definitions and algorithm outputs at runtime before replacing current application state; TypeScript types alone are not validation.

## Implementation style
TypeScript strict mode; pure graph and architectural resolver functions; keep Three.js and React in viewer and app modules. `lab/core/` must never import from `lab/app/`, `lab/student-api/` or `toolkits/`; `lab/app/document`, `lab/app/building` and `lab/app/extensions` stay free of React/Three.js; only `lab/app/extensions` imports `@student-api` or globs `toolkits/`; toolkit code imports only `@student-api` and its own files (checked by `lab/core/**/boundary.test.ts`, `lab/student-api/boundary.test.ts`, `lab/app/boundary.test.ts` and `lab/app/extensions/toolkitBoundary.test.ts`). Use the `@core/*` / `@app/*` / `@student-api` aliases across modules and relative imports within a module. Avoid adding dependencies without explaining the purpose and obtaining owner approval. No backend in v1. Do not automatically rewrite or prettify unrelated files.

## Verification and reporting
Before edits: inspect current branch and git status, identify files and expected behaviour. After edits: run available typecheck/tests/build, inspect diff, report results accurately. If commands do not exist yet, explain that they cannot be run. Never claim functionality is verified without executing tests.

## Git behaviour
- Never push, merge, reset --hard, force-push, or change repository settings without explicit owner/user approval.
- For student work, stop if branch is `main` or detached. Never commit protected files during a student task.
- Use focused commits, `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`, `docs(scope): ...`.
- Always show a concise diff summary and state the target branch before proposing a commit.
- GitHub Free private branches are not enforceably protected by these instructions; see `lab/docs/GITHUB-ACCESS.md`.

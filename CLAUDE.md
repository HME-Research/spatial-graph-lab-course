# Spatial Graph Lab — Claude Code project instructions

The rules for working with a student are in `AGENTS.md` (shared by every coding agent) and apply to every session unless the repository owner has explicitly authorised maintainer work (see below):

@AGENTS.md

In Claude Code, `/create-toolkit` walks a student through making a toolkit with these rules.

## Maintainer work (repository owner only)

Applies only when the owner explicitly authorises work in `lab/` (the local-only owner workflow). Read `lab/docs/ARCHITECTURE.md` and `lab/docs/DECISIONS.md` before code changes. Written instructions, CODEOWNERS, import aliases and boundary tests are not an access-control boundary; do not claim otherwise. Do not silently alter schema version, edge semantics, coordinate conventions, entry points or extension contracts.

### Invariants
- Graph is the canonical source of truth; renderers consume graph data and do not modify it.
- The 2D graph uses **diagram coordinates**, independent of 3D spatial coordinates. Dragging in the diagram must not move the architectural cell.
- Spatial coordinates are unique integer tuples; only existing occupied cells are stored.
- Architecture-driving edges require **face adjacency** and have explicit types; adjacent cells without access edge get an internal solid boundary.
- Compute each shared face exactly once. An isolated exposed side becomes an exterior face, styled according to its Function.
- A 3D graph edge is a relationship; it is not a physical staircase or corridor guarantee.
- Validate imported designs, toolkit definitions and algorithm outputs at runtime before replacing current application state; TypeScript types alone are not validation.

### Implementation style
TypeScript strict mode; pure graph and architectural resolver functions; keep Three.js and React in viewer and app modules. `lab/core/` must never import from `lab/app/`, `lab/student-api/` or `toolkits/`; `lab/app/document`, `lab/app/building` and `lab/app/extensions` stay free of React/Three.js; only `lab/app/extensions` imports `@student-api` or globs `toolkits/`; toolkit code imports only `@student-api` and its own files (checked by `lab/core/**/boundary.test.ts`, `lab/student-api/boundary.test.ts`, `lab/app/boundary.test.ts` and `lab/app/extensions/toolkitBoundary.test.ts`). Use the `@core/*` / `@app/*` / `@student-api` aliases across modules and relative imports within a module. Avoid adding dependencies without explaining the purpose and obtaining owner approval. No backend in v1. Do not automatically rewrite or prettify unrelated files.

### Verification and reporting
Before edits: inspect current branch and git status, identify files and expected behaviour. After edits: run typecheck/tests/build, inspect the diff, report results accurately. Never claim functionality is verified without executing tests.

### Git behaviour
- Never push, merge, reset --hard, force-push, or change repository settings without explicit owner approval.
- Use focused commits, `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`, `docs(scope): ...`, `refactor(scope): ...`.
- Always show a concise diff summary and state the target branch before proposing a commit.
- Repository access, branch rules and the course fork: `lab/docs/GITHUB-ACCESS.md`.

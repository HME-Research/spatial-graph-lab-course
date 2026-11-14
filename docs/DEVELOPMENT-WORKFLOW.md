# Owner implementation workflow

1. Read `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, local `_planning/architecture-notes.md`, `_planning/implementation-plan.md`, and `_planning/progress.md`.
2. Ensure the git branch is appropriate and worktree is clean or changes are understood.
3. Work **one phase at a time**. First outline files to change and acceptance tests; then implement.
4. Run relevant checks and observe actual UI functionality. Commands after phase 1: `npm run typecheck`, `npm test -- --run`, `npm run build`. Add `npm run lint` once configured.
5. Record actual test evidence, blockers and architecture decisions in local `_planning/progress.md` and `_planning/decisions-private.md`.
6. Show diff summary and explicit verification results; request approval before creating a commit/pushing.
7. Use `feat(graph): ...`, `feat(viewer): ...`, `fix(architecture): ...`, `test(graph): ...`. Never `git add .` blindly when local owner materials may exist; stage explicit paths or double-check ignore status.
8. No broad refactor, new npm dependency or source-schema migration just to meet one phase.

Student workflow will be specified later, after the viewer is working. Do not place untested student permission rules in active shared settings.

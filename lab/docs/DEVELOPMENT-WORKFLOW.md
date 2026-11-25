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

## Dev servers and the dependency-optimizer cache (Gate 1 finding)

Symptom: occasionally, on a fresh load of the dev server, the example toolkit failed to activate with `Failed to fetch dynamically imported module: …/toolkits/example-gallery/toolkit.ts`, and the app fell back to the built-in example with a persistent error.

Cause (reproduced): several dev servers started from the **same checkout** shared Vite's optimizer cache `node_modules/.vite`. When one of them re-optimized dependencies (first start, `--force`, a changed lockfile or config), the others kept serving the old optimized-dependency URLs. The browser then received `504 (Outdated Optimize Dep)` for those dependencies. The lazily imported toolkit module (`toolkit.ts` → `@student-api` → optimized dependencies) is reported by the browser as the failing module, even though `toolkit.ts` itself loads with status 200.

Evidence (bounded, headless Edge, fresh profile per load): one cold server alone, 0/10 failures. Two servers sharing one cache, with the second started with `--force` during the first one's page load: the first re-optimization failed in 2 of 2 runs (1/8 loads each run, each with `504 (Outdated Optimize Dep)` on optimized chunks). With a cache per port: 0/10 and 0/8. Production preview has no optimizer and was not affected.

Fix: `vite.config.ts` keys `cacheDir` by the dev-server port (`node_modules/.vite/port-<port>`, `port-default` without `--port`). Servers on different ports never share a cache. No retry was added.

Practice: give every dev server its own `--port` (e.g. 5173 for teaching, 5180–5189 for checks and agents). Two servers started without `--port` would both use `port-default`.

## Browser checks (headless Edge/Chromium, no extra dependency)

Build, serve the production preview on its own port, then run the repository harnesses (they never start or stop servers):

```
npm run build
npm run preview -- --port 4302 --strictPort
node scripts/smoke/smoke.mjs --url http://localhost:4302/ --feature all
node scripts/smoke/workflow.mjs --url http://localhost:4302/ --viewport 1366x768
node scripts/smoke/workflow.mjs --url http://localhost:4302/ --viewport 1280x720
```

The smoke run against the preview skips the component fixture (served only by `npm run dev -- --port <n>`). Stop only the servers you started. Hover feedback on 3D handles, touch, pen and OS-level mouse input are not covered by these scripts and need a manual check.

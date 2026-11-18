---
name: create-algorithm
description: Research, specify and implement a simple graph analysis or spatial transformation algorithm in a student toolkit (toolkits/<toolkit-id>/algorithms) using the Student API.
---
# Create algorithm
1. Read `docs/STUDENT-API.md` and the examples in `toolkits/example-gallery/algorithms/`. Use only `@student-api`; do not invent or modify `core/`, `app/` or `student-api/` APIs. Generic graph algorithms are analysis-only; spatial algorithms return `add-node`, `add-edge` or `set-node-attribute` operations.
2. Begin with the student's natural-language design rule. Describe inputs, outputs, algorithm steps, constraints and at least three predicted tests before editing.
3. Wait for confirmation to implement. Generate only one algorithm module in the student's `toolkits/<toolkit-id>/algorithms/` (`export default defineGraphAlgorithm(...)` or `defineSpatialAlgorithm(...)`).
4. Preserve spatial adjacency, graph validity, node IDs and deterministic behaviour where possible. Prefer seeded random selection over unseeded randomness.
5. Run typecheck, tests and build, compare results to predictions, and report uncertainty or limitations.

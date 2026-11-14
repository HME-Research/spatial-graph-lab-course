---
paths:
  - "projects/**"
---
# Student extension guidance
When writing under `projects/<project-id>/`, import only `@student-api` and files of the same project, follow `docs/STUDENT-API.md`, preserve the graph schema, do not modify `core/`, `app/` or `student-api/` (owner-maintained), and avoid app-wide refactors. Do not edit `projects/example-gallery/`; copy it instead. Do not invent new relationship kinds; use existing typed records. Run validation and show a concise before/after diff. Explain changes in beginner-friendly language.

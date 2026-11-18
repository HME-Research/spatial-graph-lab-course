---
paths:
  - "toolkits/**"
---
# Student extension guidance
When writing under `toolkits/<toolkit-id>/`, import only `@student-api` and files of the same toolkit, follow `docs/STUDENT-API.md`, preserve the graph schema, do not modify `core/`, `app/` or `student-api/` (owner-maintained), and avoid app-wide refactors. Do not edit `toolkits/example-gallery/`; copy it instead. Do not invent new relationship kinds; use existing typed records. Run validation and show a concise before/after diff. Explain changes in beginner-friendly language.

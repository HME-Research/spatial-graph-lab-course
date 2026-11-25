---
paths:
  - "toolkits/**"
---
# Student extension guidance
When writing under `toolkits/<toolkit-id>/`, import only `@student-api` and files of the same toolkit, follow `lab/docs/TOOLKITS.md` and `lab/docs/STUDENT-API.md`, preserve the graph schema, do not modify `lab/core/`, `lab/app/` or `lab/student-api/` (owner-maintained), and avoid app-wide refactors. Do not edit the owner's reference toolkit `toolkits/house/`; start from `lab/docs/templates/toolkit/my-toolkit/` or copy House. Do not invent new relationship kinds; use existing typed records. Run validation and show a concise before/after diff. Explain changes in beginner-friendly language.

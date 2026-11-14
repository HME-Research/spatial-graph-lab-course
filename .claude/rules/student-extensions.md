---
paths:
  - "student/**"
---
# Student extension guidance
When writing under `student/`, use documented contracts, preserve the graph schema, do not modify `core/` or `app/` (both are owner-maintained), and avoid app-wide refactors. Do not invent new relationship kinds; use existing typed records. Run validation and show a concise before/after diff. Explain changes in beginner-friendly language.

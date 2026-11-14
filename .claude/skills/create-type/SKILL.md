---
name: create-type
description: Help create one programme/node type and its validated architectural façade parameters in a student project (projects/<project-id>/types).
---
# Create a node type
1. Read `docs/STUDENT-API.md` and the sample types in `projects/example-gallery/types/`.
2. Define `id`, friendly label, optional façade parameters and typed attributes with defaults where sensible (custom colours are not supported yet). Ask user for essential programme intent only.
3. Create one new file in the student's `projects/<project-id>/types/` with `export default defineNodeType({...})`, importing only `@student-api`, without changing `core/`, `app/` or `student-api/`.
4. Confirm external/internal behaviour follows edge context; node function alone never creates a doorway to an adjacent occupied cell.
5. Validate and show how to test by assigning the type to one exposed and one internal node.

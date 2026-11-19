---
name: create-type
description: Help create one Function (room programme) with its custom attributes and validated façade parameters in a student toolkit (toolkits/<toolkit-id>/functions).
---
# Create a Function
1. Read `docs/STUDENT-API.md` (section "Functions") and the sample functions in the reference toolkit `toolkits/house/functions/`.
2. Define `id` (the value of a node's `"function"` in designs), a friendly label, optional façade parameters and typed `custom` attributes with defaults where sensible (custom colours are not supported yet). Ask user for essential programme intent only.
3. Create one new file in the student's `toolkits/<toolkit-id>/functions/` with `export default defineFunction({ id, label, facade?, custom? })`, importing only `@student-api`, without changing `core/`, `app/` or `student-api/`.
4. Confirm external/internal behaviour follows edge context; a node's function alone never creates a doorway to an adjacent occupied cell.
5. Validate (`npm run check:toolkit -- -t <toolkit-id>`, `npm run typecheck`) and show how to test by giving one exposed and one internal node this function.

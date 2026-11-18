# Level 2 — House Growth (Spatial Graph Lab)

This is a **student-project example designed against the supplied `student-api.zip` (schema-v2 interfaces)**, not a verified plug-and-play export of the full application. No complete app repository, design schema, registered type list, or runtime was provided.

## Contents

- `student/projects/house-growth/project.ts`: project definition.
- `student/projects/house-growth/types/*.ts`: simple room functions and illustrative façade parameters.
- `student/projects/house-growth/algorithms/function-based-growth.ts`: one growth algorithm using only `@student-api`.
- `examples/starting-house.md`: exact manual setup to reproduce in the app.
- `examples/starting-house.reference.json`: **reference data only**, not verified import format.
- `STUDENT-BRIEF.md`: explanation you can give students.
- `tests/EXPECTED-BEHAVIOUR.md`: reasoning tests and limitations.

## Integration check

1. Put the project directory under the **correct student projects root for your current application**. The API's comments identify `projects/<id>`; the extra `student/` folder here is an illustrative packaging root and may need relocating.
2. Ensure the app supports loading the project and registering its node types. Do not replace existing student work.
3. Construct the example design using the UI, assigning actual node IDs when possible. Export using the app's own JSON exporter.
4. Run **function-based-growth** from the algorithm selector (registration/discovery mechanism depends on the host application).
5. Check the result against `tests/EXPECTED-BEHAVIOUR.md`. The app is responsible for validating all operations.

**Important:** This archive cannot independently verify the complete runtime integration. In particular, the API permits adding nodes and edges but not moving/resizing existing rooms.

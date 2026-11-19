---
name: create-design
description: Create or edit a validated spatial graph design JSON in a student toolkit (toolkits/<toolkit-id>/designs) without editing the owner-maintained `core/`, `app/` or `student-api/` source.
---
# Create design
1. Read `docs/ARCHITECTURE.md` and `docs/STUDENT-API.md` (section "Designs"), inspect the current example and the available functions (`toolkits/<toolkit-id>/functions/`).
2. Restate the graph's nodes, their positions and sizes, diagram positions and edge relationships to the beginner.
3. Draft/modify one JSON document in the student's `toolkits/<toolkit-id>/designs/`. Use the one vocabulary and key order: nodes `{ "id", "function", "position": [x, y, z], "size": [x, y, z], "custom": { … } }`, edges `{ "id", "source", "target", "relationship": "access" | "open", "corridor"?: { … }, "custom": { … } }`; arrays of numbers on one line. Maintain unique ids, non-overlapping room boxes and valid relationships.
4. Run the validation command (`npm run check:toolkit -- -t <toolkit-id>`); do not claim validated if it was not run.
5. Summarise what architectural changes the user will see and which file was modified. Never modify `core/`, `app/` or `student-api/`.

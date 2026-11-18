---
name: create-design
description: Create or edit a validated spatial graph design JSON in a student toolkit (toolkits/<toolkit-id>/designs) without editing the owner-maintained `core/`, `app/` or `student-api/` source.
---
# Create design
1. Read `docs/ARCHITECTURE.md`, inspect current example and available node types.
2. Restate graph's nodes, spatial coords, diagram positions and edge semantics to the beginner.
3. Draft/modify one JSON document in the student's `toolkits/<toolkit-id>/designs/`; maintain unique IDs, unique 3D grid coords and valid face-adjacent typed relationships.
4. Run the validation command once available; do not claim validated if command missing.
5. Summarise what architectural changes the user will see and which file was modified. Never modify `core/`, `app/` or `student-api/`.

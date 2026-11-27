# functions/ — one Function per file

A **Function** is a node's programme (Room, Kitchen, Gallery…). Each `.ts` file here default-exports ONE `defineFunction({ … })`:

- `id` — the word a design stores in a node's `"function"`. Lowercase letters, digits and `-`, starting with a letter. Name the file after it (`reading-room.ts` → `id: 'reading-room'`). **Never change an id once designs use it**: add a new Function instead.
- `label` — what the app shows.
- `colour` (optional) — `#rrggbb`, the nodes' colour in every view.
- `facade` (optional) — `{ windowFraction: 0…1 }`: 0 = closed wall, 1 = fully glazed.
- `custom` (optional) — attributes of nodes with this Function (`number` with `min`/`max`, `text`, `boolean`, `enum` with `values`), each with an optional `default`. Repeating a toolkit attribute here (same key, same kind) gives this Function its own default.

Only `.ts` files directly in this folder are read; this README is ignored by the app. Full reference: `lab/docs/STUDENT-API.md` › Functions.

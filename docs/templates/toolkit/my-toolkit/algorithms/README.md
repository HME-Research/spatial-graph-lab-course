# algorithms/ — one algorithm per file

Each `.ts` file here default-exports ONE algorithm. Pick the kind by what it does:

| Kind | Definer | Shown in | What it may do |
|---|---|---|---|
| Graph analysis | `defineGraphAlgorithm` | Analyse | read node ids and edges only; never changes the design |
| Design analysis | `defineDesignAnalysis` | Analyse | also read Functions, positions, sizes, custom values (list them in `uses`) and calculated values such as `area`; never changes the design |
| Transformation | `defineSpatialAlgorithm` | Transform | return **operations** (add nodes and edges, move or resize nodes, set custom values); the student previews them and presses Apply |

- `id`: lowercase letters, digits and `-`. `label`: a short button text. `description`: one or two sentences.
- Analyses declare `inputs` (none → Network; one node → Node; one edge → Edge; anything else → Queries). Transformations may declare `parameters`.
- Deterministic and fast: no randomness (derive it from a seed parameter if you must), every loop must end. Toolkit code is not sandboxed: an endless loop freezes the browser tab.
- Helper code shared by several algorithms does NOT go in this folder (every file here must be an algorithm). Put it in `toolkits/<your-id>/lib/` and import it with a relative path (`../lib/geometry`).

Only `.ts` files directly in this folder are read; this README is ignored. Full reference: `docs/STUDENT-API.md` › Algorithms.

# HE Small Library

**What it is for:** A compact public library arranged from loud ground-floor entry and café to quiet upstairs reading. Reading rooms occupy perimeter façades while the book stacks form a windowless middle core.

**Toolkit name:** `u000-he-small-library`. Open the app with `?toolkit=u000-he-small-library`.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---:|---|
| `entrance` | Entrance | `#e87851` | 0.35 | noise loud |
| `cafe` | Café | `#f3aa55` | 0.55 | noise loud, seats 18 |
| `reading-room` | Reading room | `#5ca8cb` | 0.85 | noise quiet, seats 28 |
| `group-study` | Group study | `#c2a9d9` | 0.50 | noise medium, seats 12 |
| `stacks` | Stacks | `#72839b` | 0.00 | noise quiet, shelves 48 |
| `staff` | Staff | `#98b995` | 0.25 | noise medium |
| `stair` | Stair | `#c5c7c9` | 0.20 | noise medium |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `noise` | enum: loud / medium / quiet | Intended acoustic zone; each Function supplies its own default. |
| `seats` | number ≥ 0 | Number of seats; project-wide default 0, overridden by Café, Reading room and Group study. |
| `shelves` | number ≥ 0 | Number of shelves; project-wide default 0, Stacks default 48. |

## Algorithms (`algorithms/`)

- **Noise clashes** (design analysis, Analyse › Network): counts and highlights loud-to-quiet relationship edges.
- **Readers without daylight** (design analysis, Analyse › Network): highlights Reading rooms with no exterior façade and colours every room by exposed façade length in metres. Exterior exposure is a *proxy*, not a simulation of actual daylight.
- **Connect quiet rooms** (transform, Transform): previews Open edges between all touching, currently unrelated quiet-room pairs. Apply to add them.

## Designs (`designs/`)

- **Acoustic library — two levels** (`acoustic-library.json`, the default): downstairs Entrance, Café, Group study and Staff; upstairs a Stair directly over the Entrance, four perimeter Reading rooms and central Stacks. The direct Café–Reading room Access edge is deliberately a noise clash. All upstairs rooms have occupied supporting cells below. Stacks has no exposed façade wall.

## Choices and limitations

- Added a **Stair** Function to express the requested route between levels.
- Added `shelves` as a project-wide number because the Stacks Function needs its own shelf count.
- Exterior façade length and exterior-wall presence are available metrics, but they do not compute sunlight or verify the orientation of windows. The floor plan models the acoustic intention; it does not simulate sound propagation.
- The deliberately clashing Café–Reading room connection is a vertical Access edge through a shared floor, intended for testing the analysis.

## How to try it

1. Put this folder at `toolkits/u000-he-small-library/` on branch `toolkit/u000-he-small-library`.
2. Run `npm run check:toolkit -- -t u000-he-small-library` and `npm run typecheck` from the repository root.
3. Run `npm run dev`, then open `http://localhost:5173/?toolkit=u000-he-small-library`.
4. **Open example…** › *Toolkit: HE Small Library* › **Acoustic library — two levels**.
5. Analyse › Network › **Noise clashes** should find one deliberate clash; **Readers without daylight** should find zero perimeter Reading rooms without a façade and show a façade-length heat map.
6. Transform › **Connect quiet rooms** › Run; inspect the Open-edge preview and press **Apply** if you like it. Run it again to see that already related pairs are skipped.
7. Commit only `toolkits/u000-he-small-library/` and push your student branch (see `TOOLKITS.md` › Route B).

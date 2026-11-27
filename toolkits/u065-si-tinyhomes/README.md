# Tiny homes

**What it is for:** tiny homes of 9 to 37 m² (100 to 400 sq ft). How do you fit a bedroom, a couch, a dining table, a washroom and a kitchen into so little floor? The toolkit rates how efficiently each room uses its area, and generates, ranks and places alternative layouts.

**Toolkit name:** `u065-si-tinyhomes` (the folder name). Open the app with `?toolkit=u065-si-tinyhomes`.

**The grid.** One cell is 3 × 3 m = 9 m², so a tiny home is 1 to 4 cells. Five Functions don't fit in four cells, so some are **combined** into one room (a drop-leaf table in the kitchen, a sofa bed in the couch room). A **boundary shift** (a wall moved 1.5 m) makes a 4.5 m² washroom next to a 13.5 m² room.

## Functions (`functions/`)

| id | label | min. area | plumbing | privacy | folds away |
|---|---|---|---|---|---|
| `bedroom` | Bedroom | 7 m² | no | private | no |
| `couch` | Couch | 5 m² | no | shared | no |
| `dining-table` | Dining table | 3 m² | no | shared | yes |
| `washroom` | Washroom | 3.5 m² | yes | private | no |
| `kitchen` | Kitchen | 4 m² | yes | shared | no |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `minArea` | number ≥ 0 | smallest floor area (m²) the room needs for its furniture and the space to use it |
| `furniture` | text | the furniture the room must hold |
| `needsPlumbing` | boolean | the room needs water and drains (wet rooms should share a wall) |
| `privacy` | `private` / `shared` | private rooms should not be walked through |
| `foldAway` | boolean | multifunctional furniture: combined into another room, it needs only half its minimum area |

## Algorithms (`algorithms/`)

- **Space efficiency** (analysis, Analyse › Network): rates every room as *undersized* (smaller than `minArea`), *efficient* (up to 1.5 × `minArea`) or *oversized* (more), colours the rooms by that rating, highlights the undersized and oversized ones, and shows the share of the floor that is really needed (%) and the m² that could be saved.
- **Tiny home iterations** (transform, Transform): builds every layout for the chosen *Home area* (9–37 m²): which Functions get their own room and which are combined, the shape (row, 2 × 2, L, T), the placement of the rooms, and with or without a smaller washroom. It scores each layout (spatial efficiency 60, circulation 10, shared plumbing 10, accessibility 10 (20 when *Accessible* is on), privacy 10, multifunctional furniture 10), ranks them, and adds the chosen *Iteration* (1 = best) beside your drawing. The summary lists the top 5.

Shared helper: `lib/sizing.ts` (the undersized / efficient / oversized rule, used by both).

## Designs (`designs/`)

None yet: I draw them in the app and add them later (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u065-si-tinyhomes`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u065-si-tinyhomes`, **Create project**.
3. Transform › **Tiny home iterations**: set *Home area* (e.g. 27) and *Iteration* 1, **Run**, read the ranking, **Apply**. Run it again with Iteration 2 to place the next one beside it.
4. Analyse › Network › **Space efficiency**: see which rooms are undersized, efficient or oversized.

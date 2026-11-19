# House toolkit

The reference toolkit of Spatial Graph Lab. Don't edit this folder: copy it to make your own toolkit (see the last section).

## What it adds

- **Six Functions** (`types/`): Entrance, Circulation, Living, Kitchen, Bedroom and Bath. Each has its own façade (how much of an outside wall is glass) and its own defaults for the two attributes below.
- **Two room attributes**, both used by the transform:

  | Attribute | Meaning | Defaults per Function |
  |---|---|---|
  | `targetArea` | the floor area (m²) the room should grow to | Entrance 9 · Circulation 9 · Living 36 · Kitchen 27 · Bedroom 45 · Bath 18 |
  | `priority` | growth order, a whole number: 1 grows first | Living 1 · Kitchen 2 · Bedroom 3 · Bath 4 · Entrance 5 · Circulation 6 |

  To change one room, select it and set the value in **Properties**. The other rooms keep their Function's default.
- **One transform**, *Grow to target area* (`algorithms/grow-to-target-area.ts`).
- **One design**, `designs/house.json`: the two-storey example house. It opens when you start a project with this toolkit.

## How "Grow to target area" works

One grid cell is 3 × 3 m, so each cell adds 9 m² of floor area.

1. The rooms take turns in priority order (1 first). Rooms with the same priority go in id order.
2. A room grows by adding **one row or column of cells** to one side of its box (+x, −x, +y or −y). It never changes storey.
3. A side can grow only if every new cell is free: no other room, and no corridor between two related rooms. Above the ground floor, every new cell also needs a room underneath to stand on.
4. The room must keep touching every room it has a relationship with, and it can't get bigger than the app's largest room size.
5. Of the sides that can grow, it picks a side that faces outside, then the one that brings the area closest to the target, then the first in the order +x, −x, +y, −y.
6. It repeats until the room reaches its target area, or until no side can grow (**blocked**). Then the next room takes its turn.

The preview lists one line per room, for example `Kitchen 4: 18 → 27 m² (target 27) ✓` or `Bedroom 6: 36 of 45 m² — blocked by Circulation 5; no room below to build on`. Nothing changes until you press **Apply**, and **Undo** reverses the whole change in one step.

On the example house the kitchen grows first. The bath upstairs can then grow over it. The bedroom can't grow: the landing is on one side, and there is no room below on the other sides. Try giving Living a `targetArea` of 54, then run the transform again: Living grows first, and the bedroom can then grow over it.

## Make your own toolkit

1. Copy the whole folder `toolkits/house/` to `toolkits/my-toolkit/`. The folder name is your toolkit id: lowercase letters, digits, `-` and `_`, starting with a letter.
2. In `toolkit.ts`, change `name`.
3. Change, add or remove Functions in `types/` (one file each), attributes, algorithms in `algorithms/`, and designs in `designs/`.
4. Run `npm run check:toolkit -- -t my-toolkit` and `npm run typecheck`, then open the app with `?toolkit=my-toolkit`, or choose your toolkit when you create a project.

Your toolkit may import only `@student-api` and its own files. See `docs/STUDENT-API.md` for everything the API offers.

# House toolkit

The reference toolkit of Spatial Graph Lab. Don't edit this folder: copy it to make your own toolkit (see the last section).

## What it adds

- **Six Functions** (`types/`): Entrance, Circulation, Living, Kitchen, Bedroom and Bath. Each has its own façade (how much of an outside wall is glass) and its own defaults for the two attributes below.
- **Two room attributes**, both used by the transform:

  | Attribute | Meaning | Defaults per Function |
  |---|---|---|
  | `targetArea` | the floor area (m²) the room should grow to | Entrance 9 · Circulation 9 · Living 36 · Kitchen 18 · Bedroom 18 · Bath 9 |
  | `priority` | growth order, a whole number: 1 grows first | Living 1 · Kitchen 2 · Bedroom 3 · Bath 4 · Entrance 5 · Circulation 6 |

  To change one room, select it and set the value in **Properties**. The other rooms keep their Function's default.
- **One transform**, *Grow to target area* (`algorithms/grow-to-target-area.ts`), with one optional parameter, `houses`.
- **One design**, `designs/house.json`: the two-storey example house, every room one cell to start with. It opens when you start a project with this toolkit.

## How "Grow to target area" works

One grid cell is 3 × 3 m, so each cell adds 9 m² of floor area.

1. The rooms take turns in priority order (1 first). Rooms with the same priority go in id order.
2. A room grows by adding **one row or column of cells** to one side of its box (+x, −x, +y or −y). It never changes storey.
3. A side can grow only if every new cell is free: no other room, and no corridor between two related rooms. Above the ground floor, every new cell also needs a room underneath to stand on.
4. Houses never touch: a new cell can't be next to, above or below a room of another house (see *Houses* below).
5. The room must keep touching every room it has a relationship with, and it can't get bigger than the app's largest room size.
6. Of the sides that can grow, it picks a side that faces outside, then the one that brings the area closest to the target, then the first in the order +x, −x, +y, −y.
7. It repeats until the room reaches its target area, or until no side can grow (**blocked**). Then the next room takes its turn.

The preview lists one line per room, for example `Kitchen 4: 9 → 18 m² (target 18) ✓` or `Bedroom 2: 9 of 18 m² — blocked by Circulation 3; no room below to build on`. Nothing changes until you press **Apply**, and **Undo** reverses the whole change in one step.

On the example house every room starts as one cell: entrance, living room and kitchen downstairs; bedroom and bath upstairs, above the living room and the entrance. Living grows first, to 2 × 2 cells (36 m²), then the kitchen grows beside it (18 m²), and the bedroom grows over the living room (18 m²). Nothing is blocked: you get a compact house with a smaller upper floor and no overhangs. (The example has no Circulation rooms, but the Function is there for your own designs.) Try giving the kitchen a `targetArea` of 27 and run it again.

## Houses

Rooms that are joined by relationships, directly or through other rooms, form one **house**. A room with no relationships is a house on its own. Houses are numbered 1, 2, 3 … starting with the house that has the lowest room id, and when there is more than one house, each line of the preview names its house, for example `House 2 · Kitchen 11: 9 → 18 m² (target 18) ✓`. Houses never grow into each other: a room can't take a cell that touches another house, and the preview says `too close to House 2` when that stops it.

The parameter **`houses`** sets how many houses you want. Leave it empty to grow just the houses you drew. If you ask for more, the transform first adds copies of House 1 (every room and every relationship) in a row along +x, with enough space between them for every room to grow, and then grows all houses. Rooms in a copy are named after the room they copy, for example `House 2 · Living (copy of 2)`; after **Apply** they get their own ids. Running it again with the same number adds nothing, because it counts the houses that are already there. A smaller number never removes a house: everything still grows, and the preview says so.

## Make your own toolkit

1. Copy the whole folder `toolkits/house/` to `toolkits/my-toolkit/`. The folder name is your toolkit id: lowercase letters, digits, `-` and `_`, starting with a letter.
2. In `toolkit.ts`, change `name`.
3. Change, add or remove Functions in `types/` (one file each), attributes, algorithms in `algorithms/`, and designs in `designs/`.
4. Run `npm run check:toolkit -- -t my-toolkit` and `npm run typecheck`, then open the app with `?toolkit=my-toolkit`, or choose your toolkit when you create a project.

Your toolkit may import only `@student-api` and its own files. See `docs/STUDENT-API.md` for everything the API offers.

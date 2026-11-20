# House toolkit

The reference toolkit of Spatial Graph Lab. Don't edit this folder: copy it to make your own toolkit (see the last section).

## What it adds

- **Six Functions** (`functions/`): Entrance, Circulation, Living, Kitchen, Bedroom and Bath. Each has its own façade (how much of an outside wall is glass) and its own defaults for the two custom attributes below.
- **Two custom room attributes**, both used by the transform (stored under a room's `custom` in the JSON):

  | Attribute | Meaning | Defaults per Function |
  |---|---|---|
  | `targetArea` | the floor area (m²) the room should grow to | Entrance 9 · Circulation 9 · Living 36 · Kitchen 18 · Bedroom 18 · Bath 9 |
  | `priority` | growth order, a whole number: 1 grows first | Living 1 · Kitchen 2 · Bedroom 3 · Bath 4 · Entrance 5 · Circulation 6 |

  To change one room, select it and set the value in **Properties**. The other rooms keep their Function's default.
- **One transform**, *Grow to target area* (`algorithms/grow-to-target-area.ts`), with one optional parameter, `houses`. Transform shows it as **Houses** with a one-line description: both come from the parameter's `label` and `description`.
- **Two designs** (both in **Open example…**, tagged `Toolkit: House`):
  - `designs/house.json`, **House**: the two-storey example house, every room one cell to start with, ready for *Grow to target area*. It is the toolkit's `defaultDesign`: `npm run check:toolkit` runs the transform on it, and a new project takes its Building settings.
  - `designs/showcase.json`, **House showcase**: a finished two-storey house that shows what the app can do (see *The showcase* below).
- **One façade file**, `assets/facade-ex1.3dm` (12.5 MB; a 3 × 3 m bay with arched openings), used by the showcase's bedrooms.

**Create project with this toolkit** gives you an **empty graph** that already has the two custom attributes (Target area and Priority, tagged `Toolkit: House`, with each Function's defaults), so you can draw your own house and grow it. To work on one of the designs, choose **Open example…** (Welcome or Project) and pick it: it opens as a new project with this toolkit, its attributes, its Building Designer settings and the façade it uses.

## The showcase

`designs/showcase.json` has eleven rooms on two storeys (one cell is 3 × 3 m and one storey 3 m high):

- **Ground floor:** Living 2 (2 × 2 cells, 36 m²) open to Kitchen 3 (18 m²), a Bath 4 beside the living room, a Bedroom 9 and Bath 10 in a guest wing to the south, a garden deck (Circulation 11, 36 m²) to the east and an entrance porch (Entrance 1) to the north.
- **Upper floor:** Bedroom 5 above the living room (reached from it by a vertical Access relationship), Bath 6, a roof terrace (Circulation 7) and Bedroom 8 above the kitchen.
- **Looks by Function:** Living 70 % glass as one stretched window per wall run, Kitchen 40 % repeated windows, Bath 15 %, every Bedroom the imported façade `facade-ex1` (Repeat), Entrance open walls with a pergola roof, Circulation open walls and no roof (terrace and deck). The other roofs are flat.
- **Corridors:** three relationships join rooms that do not touch, so the app builds corridors (dashed in the graph). The Corridors card says open walls, flat roof, 1.8 m wide; each corridor overrides part of it in its own relationship: the porch path 1 → 2 has a pergola roof and is 1.2 m wide, the link 2 → 9 to the guest wing is enclosed and 2.1 m wide, and the boardwalk 3 → 11 to the deck has no roof and is 2.4 m wide.

## How "Grow to target area" works

One cell is 3 × 3 m, so each cell adds 9 m² of floor area.

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

The parameter **Houses** (`houses`) sets how many houses you want. Leave it empty to grow just the houses you drew. If you ask for more, the transform first adds copies of House 1 (every room and every relationship) in a row along +x, with enough space between them for every room to grow, and then grows all houses. Rooms in a copy are named after the room they copy, for example `House 2 · Living (copy of 2)`; after **Apply** they get their own ids. Running it again with the same number adds nothing, because it counts the houses that are already there. A smaller number never removes a house: everything still grows, and the preview says so.

## Make your own toolkit

1. Copy the whole folder `toolkits/house/` to `toolkits/my-toolkit/`. The folder name is your toolkit id: lowercase letters, digits, `-` and `_`, starting with a letter.
2. In `toolkit.ts`, change `name`.
3. Change, add or remove Functions in `functions/` (one file each, `defineFunction`), attributes, algorithms in `algorithms/`, designs in `designs/` and façade files in `assets/` (a design names a façade by its asset id; `check:toolkit` checks that a file in `assets/` gives it, see `docs/STUDENT-API.md` → Designs).
4. Run `npm run check:toolkit -- -t my-toolkit` and `npm run typecheck`, then open the app with `?toolkit=my-toolkit`, or choose your toolkit when you create a project.

Your toolkit may import only `@student-api` and its own files. See `docs/STUDENT-API.md` for everything the API offers.

# House toolkit

The reference toolkit of Spatial Graph Lab. Don't edit this folder: copy it to make your own toolkit (see the last section).

## What it adds

- **Twelve Functions** (`functions/`): Entrance, Circulation, Living, Kitchen, Bedroom and Bath, and six more that the garden house uses: Garden, Stair / landing (`stair`), Dining, Study, Utility and Roof terrace (`terrace`). Each has its own façade (how much of an outside wall is glass) and its own defaults for the two custom attributes below.
- **Two custom room attributes**, both used by the transform (stored under a room's `custom` in the JSON):

  | Attribute | Meaning | Defaults per Function |
  |---|---|---|
  | `targetArea` | the floor area (m²) the room should grow to | Entrance 9 · Circulation 9 · Living 36 · Kitchen 18 · Bedroom 18 · Bath 9 · Garden 36 · Stair / landing 9 · Dining 18 · Study 9 · Utility 9 · Roof terrace 9 |
  | `priority` | growth order, a whole number: 1 grows first | Living 1 · Kitchen 2 · Stair / landing 2 · Bedroom 3 · Bath 4 · Dining 4 · Entrance 5 · Circulation 6 · Garden 8 · Study 9 · Roof terrace 10 · Utility 11 |

  To change one room, select it and set the value in **Properties**. The other rooms keep their Function's default.
- **One transform**, *Grow to target area* (`algorithms/grow-to-target-area.ts`), with one optional parameter, `houses`. Transform shows it as **Houses** with a one-line description: both come from the parameter's `label` and `description`.
- **One design analysis**, *Below target area* (`algorithms/below-target-area.ts`, `defineDesignAnalysis`), in Analyse › Network: it lights up the rooms whose floor area is still below their `targetArea`, colours every room by the m² it is missing and counts them. Its `uses` names `targetArea`, so it is tagged **This project** and works only where that field exists. Run it before and after *Grow to target area*.
- **Two designs** (both in **Open example…**, in the `Toolkit: House` section, Simple house first):
  - `designs/simple-house.json`, **Simple house**: the two-storey example house, every room one cell to start with, ready for *Grow to target area*. It is the toolkit's `defaultDesign`: `npm run check:toolkit` runs the transform on it, and a new project takes its Building settings.
  - `designs/garden-house.json`, **Garden house**: a developed two-storey garden house with a central stair (see *The garden house* below).
- **Twelve Function colours**, declared in each `functions/*.ts` (`colour`): Entrance violet `#8e6bb8`, Living amber `#e8a33d`, Kitchen terracotta `#d4623b`, Bedroom blue `#4f7cc0`, Bath aqua `#3fa9b5`, Circulation stone grey `#9b9a8f`, Garden green `#4f8f3a`, Stair / landing slate `#56606e`, Dining raspberry `#c2477d`, Study brown `#8b5e3c`, Utility olive `#8a8d2e`, Roof terrace mint `#7cc9a6`. A project can change them in the Functions dialog.
- **One façade file**, `assets/facade-ex1.3dm` (12.5 MB; a 3 × 3 m bay with arched openings), used by the garden house's Living and Dining.

**Create project with this toolkit** gives you an **empty graph** that already has the two custom attributes (Target area and Priority, tagged `Toolkit: House`, with each Function's defaults), so you can draw your own house and grow it. To work on one of the designs, choose **Open example…** (Welcome or Project) and pick it: it opens as a new project with this toolkit, its attributes, its Building Designer settings and the façade it uses.

## The garden house

`designs/garden-house.json` has fourteen rooms on two storeys around a central stair, with fourteen relationships; every related pair shares a wall or a floor, so it has no corridors:

- **Ground floor:** a sheltered Entrance 1 (open walls, pergola roof), opening onto the stair hall (Stair / landing 2). From the hall: Living 2 × 2 (3, 36 m²), Kitchen 5 (18 m²) and Bath 6. Dining 4 (18 m²) is open to the living room and the kitchen, and opens onto Garden 7 (2 × 2 cells, 36 m², open walls, no roof). Utility 14 is reached through the kitchen.
- **Upper floor:** the landing (Stair / landing 8, 18 m², reached from the hall by a vertical Access relationship) serves two Bedrooms 9 and 10 over the living room, Bath 11, Study 12 and Roof terrace 13 above the kitchen (open walls, no roof).
- **Looks by Function:** Living and Dining use the imported façade `facade-ex1` (Repeat); Bedroom 28 % and Kitchen 30 % stretched windows; Study 40 %; Bath and Utility 10 %; Entrance a pergola porch; Garden and Roof terrace open to the sky.

Every room is already at its target area, so *Grow to target area* grows nothing here: raise a room's `targetArea` to see it grow.

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

The full guide, with the starter folder, the things to consider and how to make a toolkit with an AI assistant (in the repository or in a chat), is [`lab/docs/TOOLKITS.md`](../../lab/docs/TOOLKITS.md). The short version:

1. Copy the whole folder `toolkits/house/` to `toolkits/my-toolkit/`. The folder name is your toolkit id: lowercase letters, digits, `-` and `_`, starting with a letter.
2. In `toolkit.ts`, change `name`.
3. Change, add or remove Functions in `functions/` (one file each, `defineFunction`), attributes, algorithms in `algorithms/`, designs in `designs/` and façade files in `assets/` (a design names a façade by its asset id; `check:toolkit` checks that a file in `assets/` gives it, see `lab/docs/STUDENT-API.md` → Designs).
4. Run `npm run check:toolkit -- -t my-toolkit` and `npm run typecheck`, then open the app with `?toolkit=my-toolkit`, or choose your toolkit when you create a project.

Your toolkit may import only `@student-api` and its own files. See `lab/docs/STUDENT-API.md` for everything the API offers.

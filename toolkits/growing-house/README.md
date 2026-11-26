# Growing house toolkit

**Growing house: from one seed cell to a whole house.** A house grows from one seed cell, a Hall, by simple adjacency rules: one generation per Run. Then the rooms grow to their target area and are rated room by room.

This is an owner reference toolkit, like House (`toolkits/house/`). Don't edit this folder: copy it to make your own toolkit (see `lab/docs/TOOLKITS.md`).

## What it adds

- **Eight Functions** (`functions/`), each with its own colour, window fraction and `targetArea` default:

  | Function (id) | Colour | Windows | Target area |
  |---|---|---|---|
  | Hall (`hall`) | violet `#8e6bb8` | 30 % | 9 m² |
  | Living room (`living-room`) | amber `#e8a33d` | 60 % | 27 m² |
  | Kitchen (`kitchen`) | terracotta `#d4623b` | 40 % | 18 m² |
  | Dining (`dining`) | raspberry `#c2477d` | 50 % | 18 m² |
  | Corridor (`corridor`) | stone grey `#9b9a8f` | 20 % | 9 m² |
  | Bedroom (`bedroom`) | blue `#4f7cc0` | 35 % | 18 m² |
  | Bathroom (`bathroom`) | aqua `#3fa9b5` | 15 % | 9 m² |
  | Terrace (`terrace`) | mint `#7cc9a6` | 0 % | 18 m² |

  The Seed design gives the Terrace open walls and no roof (Building Designer › Looks by Function), so it is built as an outdoor floor. A new project with this toolkit takes the same setting.
- **Four custom room attributes** (`toolkit.ts`, under a room's `custom` in the JSON):

  | Attribute | Kind | Meaning |
  |---|---|---|
  | `targetArea` | number (m²) | the floor area the room should grow to; default per Function (table above) |
  | `generation` | number | when the room was grown: 0 for the seed Hall, then 1, 2, … (default 0) |
  | `privacy` | public · shared · private | set by *Rate the rooms* |
  | `daylight` | good · poor · none | set by *Rate the rooms* |
- **Three transforms** (Transform) and **one design analysis** (Analyse › Network), see below.
- **One design**, `designs/seed.json`, **Seed**: only the one-cell Hall at [0, 0, 0], generation 0. It is the toolkit's `defaultDesign`.

The rules (who invites whom, the count limits, the complete programme and which pairs are Open) are in one file, `lib/rules.ts`; `lib/cells.ts` has the small grid helpers both growing transforms share.

## The rules

| Room | Invites (in this order) |
|---|---|
| Hall | Living room, Corridor |
| Living room | Dining, Terrace |
| Dining | Kitchen |
| Corridor | Bedroom, Bedroom, Bathroom |
| Kitchen, Bedroom, Bathroom, Terrace | nothing |

- Every new room is one cell, in a free cell next to the room that invites it, on the same level, one generation newer.
- It is related to that room with **Access** (a door); Kitchen–Dining and Living room–Terrace with **Open** (no wall).
- **Count limits** for the whole plan, never exceeded: Living room, Kitchen, Dining and Terrace 1 each; Bedroom 3; Bathroom 2; Corridor 2.
- A complete house has: Hall, Living room, Dining, Kitchen, Terrace, Corridor, 2 Bedrooms and a Bathroom (nine rooms, three generations after the seed).

## The algorithms

1. **Grow one generation** (`algorithms/grow-one-generation.ts`, Transform), parameter **Most rooms** (`maxRooms`, default 12). On an empty design it plants the seed Hall at [0, 0, 0]. Otherwise every room of the newest (highest) generation invites its rooms, in id order. For each invitation it tries the sides +x, −x, +y, −y, cell by cell along the room's base level, and takes the first cell that is free: no room in it, no room added earlier in this run, and no generated connector. An invitation is skipped when there is no free cell, when the Function has reached its limit, or when the house has `maxRooms` rooms. The summary says how many rooms were added and which were skipped and why, or **Nothing left to grow** when the house is complete.
2. **Grow rooms to target area** (`algorithms/grow-rooms-to-target-area.ts`, Transform). Every room below its `targetArea` grows by one row of cells (one cell for a room one cell wide) on one side, in id order. A side can grow only when every new cell is free: no room, no cell another room took earlier in this run, no generated connector, and the room stays within the largest room size. Of the free sides it takes the one that brings the area closest to the target, then the first in the order +x, −x, +y, −y. Run it again until it says **Every room reaches its target area.**
3. **Rate the rooms** (`algorithms/rate-the-rooms.ts`, Transform). Changes only `privacy` and `daylight`, and only where the value changes. **Privacy** from the number of steps (relationships) from the Hall: 0–1 public, 2 shared, 3 or more private; a room the Hall can't reach is private. **Daylight** from the app's calculated values: good when `exposed-facade-length` is at least 6 m, poor when the room has some exterior façade (`has-exterior-facade`), none otherwise.
4. **What's missing** (`algorithms/whats-missing.ts`, Analyse › Network, no input). One line: the Functions still missing or short of the complete programme, for example `Missing: Kitchen, Bedroom ×2`, or `Complete programme`, plus how many rooms are below their target area. It lights up those rooms.

## How to try it

1. `npm run dev`, then open `http://localhost:5173/?toolkit=growing-house`.
2. **Open toolkit design…** › *Toolkit: Growing house* › **Seed**.
3. **Transform** › **Grow one generation** › **Run** › **Apply**. Repeat: generation 1 adds the Living room and the Corridor, generation 2 the Dining, Terrace, two Bedrooms and the Bathroom, generation 3 the Kitchen. The fourth Run says *Nothing left to grow*.
4. **Grow rooms to target area** › Run › Apply, two or three times, until every room reaches its target area.
5. **Rate the rooms** › Run › Apply. Select a room: Properties shows its Privacy and Daylight.
6. **Analyse** › Network › **What's missing**: *Complete programme*. Delete a Bedroom and run it again.

Each Apply is one **Undo** step. It also works on an empty project: **New project** with the toolkit *Growing house*, then Grow one generation: the first Run plants the seed Hall.

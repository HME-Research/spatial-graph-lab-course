# My toolkit

> Starter README: replace this text with your own. Keep it short; it is the first thing your tutor reads.

**What it is for:** one or two sentences, e.g. "Small family houses: bedrooms, a kitchen and a living room, with a rule that gives every Bedroom larger than 12 m² two beds."

**Toolkit name:** `my-toolkit` (the folder name; yours is like `u123-hk-house`). Open the app with `?toolkit=my-toolkit`.

## Functions (`functions/`)

| id | label | own defaults |
|---|---|---|
| `room` | Room | occupancy 2 |
| `circulation` | Circulation | occupancy 0 |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `occupancy` | number ≥ 0 | how many people use the space at the same time |

## Algorithms (`algorithms/`)

- **Occupancy around** (analysis, Analyse › Node): people in the selected node and the nodes joined to it.
- **Occupancy from area** (transform, parameter *Area per person*): sets `occupancy` from each node's floor area.

## Designs (`designs/`)

- **First design** (`first-design.json`, the default design): three nodes on the ground floor.

## How to try it

1. `npm run check:toolkit -- -t my-toolkit`
2. `npm run dev`, open `http://localhost:5173/?toolkit=my-toolkit`
3. **Open toolkit design…** › *Toolkit: My toolkit* › **First design**; Transform › **Occupancy from area** › Run › Apply; select a node, Analyse › Node › **Occupancy around**.

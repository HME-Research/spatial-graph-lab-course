# u505-ah-skillclass

**What it is for:** Analyse room dimensions and the relationships between served, supporting and circulation spaces in a spatial graph. Room dimensions use the app's built-in 3 m grid; each space also records its planned occupancy.

**Toolkit name:** `u505-ah-skillclass`. Open the app with `?toolkit=u505-ah-skillclass`.

## Functions (`functions/`)

| id | label | own defaults |
|---|---|---|
| `served-space` | Served Space | none |
| `servant-space` | Servant Space | none |
| `circulation-space` | Circulation Space | none |
| `other-space` | Other Space | none |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `occupancy` | number ≥ 0 | estimated peak number of people using the space |

## Algorithms (`algorithms/`)

- **Rooms no longer than 6 m** (analysis, Analyse › Network): highlight every room whose longest horizontal side is at most 6 m. This analysis works with any project.
- **Served spaces without support** (analysis, Analyse › Network): highlight Served Spaces without a direct graph edge to a Servant Space. Circulation edges still provide access but do not count as a supporting programme.
- **Compact served spaces with support** (analysis, Analyse › Network): highlight Served Spaces whose longest horizontal side is at most 6 m and that have a direct graph edge to a Servant Space.

The connectivity analyses count one explicit graph edge as a direct connection, including Access and Open relationships. They do not require the two rooms to share a wall or the relationship to resolve as a direct physical connection.

## Designs (`designs/`)

The sample design is **Spatial Logic Learning Commons**. Draw your own designs in the app and add their exported JSON here later.

## How to try it

1. Run `npm run check:toolkit -- -t u505-ah-skillclass`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u505-ah-skillclass`.
3. Open **Spatial Logic Learning Commons**, then run the analyses in **Analyse › Network**.

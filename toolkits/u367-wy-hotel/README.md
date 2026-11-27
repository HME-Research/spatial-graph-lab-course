# Small hotel

**What it is for:** small hotels and guesthouses on one to four levels: a main and a secondary entrance, a lobby with reception, corridors and stairs leading to guest rooms. It checks whether every guest room can escape in time, gets enough daylight, and how many guests each level holds.

**Toolkit name:** `u367-wy-hotel` (the folder name). Open the app with `?toolkit=u367-wy-hotel`.

## Functions (`functions/`)

| id | label | own defaults |
|---|---|---|
| `main-entrance` | Main entrance | counts as an exit: yes |
| `secondary-entrance` | Secondary entrance | counts as an exit: yes |
| `lobby` | Lobby with reception | has a reception desk: yes |
| `corridor` | Corridor | width 1.5 m |
| `stair` | Stair | is an escape stair: yes |
| `guest-room` | Guest room | double, 2 guests, window 2 m², outside window: yes |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `countsAsExit` | yes/no | this entrance is an escape exit |
| `hasReceptionDesk` | yes/no | the lobby has a reception desk |
| `corridorWidth` | number 1.2–3.0 | corridor width in m |
| `isEscapeStair` | yes/no | this stair is an escape route |
| `roomType` | single / double / family | the guest room's type |
| `guests` | number 1–4 | guests sleeping in the room |
| `windowArea` | number ≥ 0 | window area in m² |
| `hasOutsideWindow` | yes/no | the room has a window to the outside |

## Algorithms (`algorithms/`)

- **Escape distance** (analysis, Analyse › Queries, input *Limit*, 30 m): shortest walk through the graph (room centre to room centre, along the edges) from each Guest room to the nearest escape Stair or exit entrance; shows the distance on each room, highlights rooms over the limit or with no route.
- **Daylight** (analysis, Analyse › Queries, input *N*, 7): a Guest room passes with an outside window and window area ≥ floor area ÷ N; shows each ratio, highlights the rooms that fail.
- **Guests per level** (analysis, Analyse › Network): guests on each level and in the whole hotel; colours each Guest room by its guests.
- **Room type from area** (transform, parameters *Double from* 18 m², *Family from* 27 m²): under 18 m² single (1 guest), 18–27 m² double (2), 27 m² or more family (4).

Analyses cannot have parameters in this app, so the limit and N are number inputs you type when you run them.

## Designs (`designs/`)

None yet: I draw them in the app and add them here (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u367-wy-hotel`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u367-wy-hotel`
3. **Create project**, draw a small hotel (Main entrance, Lobby, Corridor, Stair, a few Guest rooms of 1, 2 and 3 cells, a second level), join them with Access edges; Transform › **Room type from area** › Run › Apply; Analyse › Network › **Guests per level**; Analyse › Queries › **Escape distance** and **Daylight**.

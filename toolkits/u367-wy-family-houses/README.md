# Family house

**What it is for:** small family houses on one or two levels: an entrance, living spaces and bedrooms connected by a stair. It checks where the beds are (how many on each level) and whether the main rooms get daylight.

**Toolkit name:** `u367-wy-family-houses` (the folder name). Open the app with `?toolkit=u367-wy-family-houses`.

## Functions (`functions/`)

| id | label | own defaults |
|---|---|---|
| `entrance` | Entrance | main entrance: yes |
| `living-room` | Living room | has a window: yes |
| `kitchen` | Kitchen | has a window: yes; kitchen type: open |
| `bedroom` | Bedroom | beds 1; has a window: yes |
| `bathroom` | Bathroom | has a bathtub: no |
| `stair` | Stair | — |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `isMainEntrance` | yes/no | this Entrance is the main entrance |
| `hasWindow` | yes/no | the room gets daylight through a window |
| `kitchenType` | open / closed | open to the living space or a separate room |
| `beds` | number 0–4 | beds in a Bedroom |
| `hasBathtub` | yes/no | the Bathroom has a bathtub |

## Algorithms (`algorithms/`)

- **Beds and daylight** (analysis, Analyse › Network): counts the beds on each level and highlights every Living room, Kitchen or Bedroom without a window.
- **Beds from area** (transform, parameter *Area for 2 beds*, 18 m²): every Bedroom of 18 m² or more gets 2 beds, a smaller one 1.

## Designs (`designs/`)

None yet: I draw them in the app and add them here (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u367-wy-family-houses`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u367-wy-family-houses`
3. **Create project**, draw a small house (Entrance, Living room, Kitchen, two Bedrooms, Bathroom, a Stair to level 1); Transform › **Beds from area** › Run › Apply; Analyse › Network › **Beds and daylight**. Set *Has a window* to no on a room and run it again: that room lights up.

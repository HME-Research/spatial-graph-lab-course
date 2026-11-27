# Villa with gardens (u425-rz-branch)

> A small villa with a large garden at the front and back, and room for one or more light wells (courtyards) inside it.

**What it is for:** designing a small villa with four bedrooms, a kitchen, a living room and a study. The two gardens (front and rear) are each about 100 m², and courtyards can bring daylight into the middle of the house. The algorithms help make the design pet-friendly and check that rooms get daylight.

**Toolkit name:** `u425-rz-branch` (the folder name). Open the app with `?toolkit=u425-rz-branch`.

## Functions (`functions/`)

| id | label | own defaults |
|---|---|---|
| `bedroom` | Bedroom | targetArea 12, petFriendly no |
| `kitchen` | Kitchen | targetArea 12, petFriendly no |
| `living` | Living room | targetArea 24, petFriendly yes |
| `study` | Study | targetArea 9, petFriendly no |
| `garden` | Garden | targetArea 100, petFriendly yes |
| `courtyard` | Courtyard | targetArea 9, petFriendly no |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `targetArea` | number ≥ 1 | the floor area (m²) a space should reach; a garden is about 100 |
| `petFriendly` | boolean | whether pets are welcome in the space |

## Algorithms (`algorithms/`)

- **Pet access to garden** (analysis, Analyse › Network): lights up pet-friendly rooms joined onto a garden, and counts them.
- **Room daylight** (analysis, Analyse › Node): for the selected room, says where its daylight comes from — an outside wall, or a courtyard or garden it touches.
- **Open rooms to the garden** (transform, Transform): opens pet-friendly rooms onto the gardens they touch, so pets can get outside.

## Designs (`designs/`)

- None yet — you draw them. See `designs/README.md` for how to add one.

## How to try it

1. `npm run check:toolkit -- -t u425-rz-branch`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u425-rz-branch`
3. **Create project**, draw the villa (bedrooms, kitchen, living, study, two gardens, a courtyard), then Transform › **Open rooms to the garden** › Run › Apply; Analyse › Network › **Pet access to garden**; select a bedroom, Analyse › Node › **Room daylight**.

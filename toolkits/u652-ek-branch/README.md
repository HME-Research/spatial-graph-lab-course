# Two-Storey Family House

**What it is for:** A two-storey, three-bedroom family house with a kitchen, living room, dining room, indoor library, patio and bathrooms. Use a separate bathroom node for each bathroom, and connect the master bedroom to its ensuite with an access relationship.

**Toolkit name:** `u652-ek-branch`. Open the app with `?toolkit=u652-ek-branch`.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---:|---|
| `bedroom` | Bedroom | `#4f78a8` | 0.35 | `bedCount: 1` |
| `master-bedroom` | Master bedroom | `#355a7a` | 0.35 | `bedCount: 1` |
| `kitchen` | Kitchen | `#d9824b` | 0.4 | `windowCount: 2` |
| `living-room` | Living room | `#c7903e` | 0.6 | — |
| `dining-room` | Dining room | `#b6a24a` | 0.4 | — |
| `bathroom` | Bathroom | `#51a9b5` | 0.15 | `bathroomType: detached` |
| `library` | Library | `#8064a2` | 0.35 | — |
| `patio` | Patio | `#73a66b` | 0.25 | — |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `bedCount` | number, 1–2 | Beds in a bedroom. |
| `windowCount` | number, 0 or more | Windows in a room; the kitchen defaults to two. |
| `bathroomType` | enum: `ensuite`, `detached` | Marks an ensuite or a separate bathroom. Bathrooms default to detached. |

Connect the patio to the living room with an **access** relationship to show the entrance. Place one bedroom on level 0 and two bedrooms on level 1 when drawing the design.

## Algorithms (`algorithms/`)

- **Beds by floor** (analysis, Analyse › Network): totals recorded bed counts on each level and shows the overall total.
- **Two beds for large bedrooms** (transform, Transform): sets bedrooms with a nominal area greater than 12 m² to two beds. Preview the changes before applying.

## Designs (`designs/`)

`designs/` contains only its README. Draw your design in the app and add it here later.

## How to try it

1. Run `npm run check:toolkit -- -t u652-ek-branch` and `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u652-ek-branch`.
3. Create a project, add the Functions, and draw a small design. Run **Beds by floor** in **Analyse › Network**, then run **Two beds for large bedrooms** in **Transform** and apply its preview.

# Two-Storey Family House

**What it is for:** A two-storey, three-bedroom family house with a kitchen, living room, dining room, indoor library and outside patio. The master bedroom has one ensuite, with two more bathrooms in their own rooms.

**Toolkit name:** `u652-ek-branch`. Open the app with `?toolkit=u652-ek-branch`.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---:|---|
| `bedroom-1` | Bedroom 1 | `#598fc2` | 0.35 | `bedCount: 2` |
| `bedroom-2` | Bedroom 2 | `#759db8` | 0.35 | `bedCount: 1` |
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

Bedroom 1, Bedroom 2 and Master bedroom are the three bedrooms for your house. The original `bedroom` Function stays available for existing projects. The master bedroom starts with one bed because no bed count was specified for it.

`windowCount` records your intended number of windows; it does not place exactly two windows in the architecture. The API controls glazing with `facade.windowFraction`. Likewise, the Patio Function labels an outdoor space; choose its outdoor appearance in the app's Building Designer.

## Graph structure to draw

The app already provides the graph data structure: **nodes are rooms** and **edges are relationships**. This toolkit provides its room types and attributes. Each room stores an `id`, `function`, `position`, `size` and `custom`; each relationship stores an `id`, `source`, `target`, `relationship` and `custom`. The app creates the numeric ids as you draw.

- Draw one Bedroom 1, one Bedroom 2 and one Master bedroom. Put one on level 0 (the lower storey) and two on level 1 (the upper storey); choose which bedroom goes downstairs. Give each bedroom one storey of height. The analysis counts beds at the room's starting level, once per room.
- Draw three separate Bathroom nodes. Set the master's bathroom to `bathroomType: ensuite`; leave the other two as `detached`, meaning independent bathrooms within the house.
- Draw a Kitchen, Living room, Dining room, Library and Patio.
- Connect Master bedroom to its ensuite with **access**, and Patio to Living room with **access** for the entrance.
- Connect Kitchen to Dining room with **access**, or **open** for an open-plan connection. Connect the other rooms according to your layout.
- Place directly connected rooms against a shared wall, and upper rooms over lower rooms. An edge between floors records a relationship; it does not create a staircase.

These connections and the room arrangement are instructions for your drawing. The toolkit does not automatically create or enforce them.

## Algorithms (`algorithms/`)

- **Beds by floor** (design analysis, Analyse › Network): totals bedroom bed counts on each drawn level and shows the overall total. Uses room values or Function defaults; missing counts are reported. No bedrooms gives zero with an explanation.
- **Two beds for large bedrooms** (transform, Transform): sets bedrooms, including the master, with a nominal area strictly greater than 12 m² to two beds. Bedrooms at or below 12 m² keep their current count, and bedrooms already holding two beds need no change. Preview the changes before applying.

## Designs (`designs/`)

`designs/` contains only its README. Draw your design in the app and add it here later.

## How to try it

1. Run `npm run check:toolkit -- -t u652-ek-branch` and `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u652-ek-branch`.
3. Choose **Create project** with this toolkit, then draw your rooms and connections. With the three bedroom defaults, **Analyse › Network › Beds by floor** should show four beds in total, split by your chosen levels.
4. Make Bedroom 2 two cells in plan (18 m²), then run **Transform › Two beds for large bedrooms**. Its preview should propose two beds there; press **Apply**, then run the analysis again to see five beds total if the master is unchanged. One cell is 9 m². The transform also updates the master if it is over 12 m².
5. When you have exported and added your own design, it will appear in **Open toolkit design…**. There is no saved design to open yet.

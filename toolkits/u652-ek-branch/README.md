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

`windowCount` records your intended number of windows; it does not place exactly two windows in the architecture. The API controls glazing with `facade.windowFraction`. The saved house design gives the Patio open walls and no roof.

## Saved house graph

The app already provides the graph data structure: **nodes are rooms** and **edges are relationships**. This toolkit provides its room types and attributes. Each room stores an `id`, `function`, `position`, `size` and `custom`; each relationship stores an `id`, `source`, `target`, `relationship` and `custom`. The app creates the numeric ids as you draw.

- Draw one Bedroom 1, one Bedroom 2 and one Master bedroom. Put one on level 0 (the lower storey) and two on level 1 (the upper storey); choose which bedroom goes downstairs. Give each bedroom one storey of height. The analysis counts beds at the room's starting level, once per room.
- Draw three separate Bathroom nodes. Set the master's bathroom to `bathroomType: ensuite`; leave the other two as `detached`, meaning independent bathrooms within the house.
- Draw a Kitchen, Living room, Dining room, Library and Patio.
- Connect Master bedroom to its ensuite with **access**, and Patio to Living room with **access** for the entrance.
- Connect Kitchen to Dining room with **access**, or **open** for an open-plan connection. Connect the other rooms according to your layout.
- Place directly connected rooms against a shared wall, and upper rooms over lower rooms. An edge between floors records a relationship; it does not create a staircase.

The saved `designs/two-storey-house.json` contains this graph with 11 rooms and 10 relationships. Bedroom 1 is downstairs; Bedroom 2 and the master are upstairs. The two separate bathrooms open from the downstairs library, and the ensuite opens only from the master. Kitchen and dining have an open connection; the remaining connections are access relationships. All connected rooms share a wall or floor, all upper rooms stand over lower rooms, and no rooms overlap.

The two upstairs bedrooms connect vertically to the living room. These edges show floor openings and symbolic access markers, not detailed stairs; you can refine the circulation in the app. Room sizes and which bedroom goes downstairs are starting choices for you to edit. The toolkit does not enforce the arrangement when you change it.

| Node id | Room | Level | Nominal area |
|---|---|---:|---:|
| 1 | Living room | 0 | 54 m² |
| 2 | Kitchen | 0 | 36 m² |
| 3 | Dining room | 0 | 18 m² |
| 4 | Library | 0 | 18 m² |
| 5 | Bedroom 1 | 0 | 18 m² |
| 6 | Separate bathroom | 0 | 9 m² |
| 7 | Separate bathroom | 0 | 9 m² |
| 8 | Outside patio | 0 | 27 m² |
| 9 | Bedroom 2 | 1 | 18 m² |
| 10 | Master bedroom | 1 | 36 m² |
| 11 | Ensuite bathroom | 1 | 9 m² |

## Algorithms (`algorithms/`)

- **Beds by floor** (design analysis, Analyse › Network): totals bedroom bed counts on each drawn level and shows the overall total. Uses room values or Function defaults; missing counts are reported. No bedrooms gives zero with an explanation.
- **Two beds for large bedrooms** (transform, Transform): sets bedrooms, including the master, with a nominal area strictly greater than 12 m² to two beds. Bedrooms at or below 12 m² keep their current count, and bedrooms already holding two beds need no change. Preview the changes before applying.

## Designs (`designs/`)

`designs/two-storey-house.json` is the saved starting design. Open it with **Open toolkit design…** › **Two-storey three-bedroom house**. `toolkit.ts` has no `defaultDesign`; creating an empty project still starts without rooms.

## How to try it

1. Run `npm run check:toolkit -- -t u652-ek-branch` and `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u652-ek-branch`.
3. Choose **Open toolkit design…** › **Two-storey three-bedroom house**. Run **Analyse › Network › Beds by floor**: it should show two beds downstairs and two upstairs, four in total.
4. Run **Transform › Two beds for large bedrooms**. Its preview should set Bedroom 2 and the master to two beds each; Bedroom 1 already has two. Press **Apply** and analyse again: expect two beds downstairs and four upstairs, six in total.
5. Edit the layout in the app, then keep your changes with **Project › Export project**. To add another saved design, follow `designs/README.md`.

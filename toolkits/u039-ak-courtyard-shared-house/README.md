# Courtyard Shared House

A shared house organised around a central courtyard, with private bedrooms and terraces, shared kitchens and living spaces, and galleries and libraries open to visitors. The toolkit explores how access routes and room placement affect privacy, accessibility and daylight potential.

## Functions

| ID | Label | Colour | Defaults |
|---|---|---|---|
| `bedroom` | Bedroom | `#8665a8` | private, 1 bed, terrace access off |
| `kitchen` | Kitchen | `#cc7849` | resident-only |
| `living-dining` | Living/Dining room | `#b58d39` | resident-only |
| `bathroom` | Bathroom | `#4b8ba1` | resident-only, shared bathroom |
| `gallery` | Gallery | `#d0656a` | public |
| `library` | Library | `#426b99` | public |
| `courtyard` | Courtyard | `#588654` | semi-public |
| `entrance` | Entrance | `#66717e` | public |
| `corridor` | Corridor | `#9d7a62` | resident-only |
| `staircase` | Staircase | `#84745d` | resident-only |
| `terrace` | Terrace | `#6c9d81` | private, private terrace |

All Functions use the app's façade settings.

## Attributes

| Key or app label | Kind | Meaning |
|---|---|---|
| Nominal area | Calculated number | Plan area in m² from the room's grid footprint |
| Level | Built-in number | Floor at the base of the room, with 0 at ground level |
| `accessLevel` | Choice | Public, semi-public, resident-only or private |
| `beds` | Number | Beds in a bedroom |
| `terraceAccess` | Yes/no | Whether a bedroom has terrace access |
| `windowFacingSides` | Number | Recorded number of bedroom sides with windows, from 0 to 4 |
| `capacity` | Number | People a kitchen, living/dining room or library can hold |
| `hasWindow` | Yes/no | Whether a kitchen has a window |
| `bathroomUse` | Choice | Private or shared bathroom |
| `entranceType` | Choice | Public or resident-only entrance, overriding access level when set |
| `connectedFloorLevels` | Text | Levels a staircase connects, such as `0, 1, 2` |
| `terraceUse` | Choice | Private or shared terrace |

Bathroom and terrace use are descriptive. Set their access level to match who should be able to reach them.

## Analyses

- **Privacy and accessibility** compares visitor and resident reach from entrances through resolved connections. Visitors start at public entrances and can use public or semi-public spaces. Residents can also start at resident-only entrances and reach private rooms as destinations. The analysis highlights public rooms visitors cannot reach and any rooms residents cannot reach. It evaluates access rules for residents as a group.
- **Dual-aspect daylight potential** counts horizontal sides facing empty grid cells, courtyards or terraces. It highlights rooms with at least two such sides, including corner rooms. The count uses nominal room geometry and includes empty cells that may be occupied by generated connectors. Window records, glazing and daylight levels are outside this estimate.

- **Privacy Zoning** colours rooms by their Access level and shows the levels present in the colour legend. Each room's level appears on its graph node and in the analysis results.
- **Privacy Gradient** measures the fewest resolved connections from any public entrance. Public entrances start at 0, and each direct or routed connection adds one step. This measures graph depth regardless of room access rules. An entrance's Entrance type takes precedence when set. The gradient shows each reachable room's depth, and unreachable rooms are highlighted and marked with no value.


## Transformation

**Courtyard-based Room Arrangement** adds rooms at the courtyard's base level. It tries all four sides, keeps each room's frontage within the courtyard wall, and adds a direct access connection for every room that fits. If there is limited space, the preview shows how many rooms fit.

In **Transform**, choose **Courtyard-based Room Arrangement**, enter the Courtyard node's ID from the graph, and choose the room Function, count, and dimensions in grid cells (3 m per cell). Select **Run** to preview the rooms and connections, then **Apply** to keep them or **Discard** to close the preview.


## Designs

See [how to add your own design](designs/README.md).

## How to try it

1. Run `npm run dev` and open http://localhost:5173/?toolkit=u039-ak-courtyard-shared-house.
2. Choose **Create project** with **Courtyard Shared House**. Draw an entrance, a gallery, a bedroom and a courtyard. Connect rooms that share a wall using access relationships.
3. In **Analyse › Network**, run **Privacy and accessibility** to see who can reach each room. Run **Dual-aspect daylight potential** to see how many outdoor-facing sides each room has.

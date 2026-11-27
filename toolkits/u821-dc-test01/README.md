# Two-storey family house

A family house with three bedrooms and three bathrooms upstairs and four shared rooms downstairs. The toolkit checks the room programme and proposes connections for bedrooms, bathrooms, the kitchen and dining.

Toolkit name `u821-dc-test01`.

## Functions

| ID | Label | Colour | Window fraction | Own defaults |
|---|---|---|---|---|
| `bedroom` | Bedroom | `#6977b5` | 0.35 | Floor level 1, one bed |
| `bathroom` | Bathroom | `#519b9b` | 0.15 | Floor level 1 |
| `living-room` | Living room | `#d88d50` | 0.65 | None |
| `guest-reception-room` | Guest reception room | `#b06583` | 0.45 | None |
| `dining-room` | Dining room | `#bc9e42` | 0.5 | None |
| `kitchen` | Kitchen | `#65965f` | 0.35 | None |
| `main-entrance` | Main entrance | `#777685` | 0.2 | None |
| `staircase` | Staircase | `#817858` | 0.2 | None |
| `hallway` | Hallway | `#8d8174` | 0.15 | None |

## Room attributes

The app calculates area in square metres from the drawn room. The distribution check uses the drawn level, with 0 for ground and 1 for upstairs. The planned level and access fields are editable programme notes.

| Key | Kind | Meaning |
|---|---|---|
| `floorLevel` | Number | Planned storey for bedrooms and bathrooms |
| `numberOfBeds` | Number | Beds in a bedroom |
| `bathroomAccess` | Boolean | Whether a bedroom has bathroom access |
| `associatedBedroom` | Number | Room ID of the bedroom a bathroom serves |
| `seatingCapacity` | Number | Seats in the living, guest reception or dining room |
| `outdoorAccess` | Boolean | Outdoor access from the living room |
| `entranceProximity` | Choice | Whether reception is near or far from the entrance |
| `ventilation` | Choice | Natural, mechanical or both for the kitchen |
| `serviceAccess` | Boolean | Service access to the kitchen |

## Algorithms

- **Check room distribution** appears in **Analyse › Network**. It reports mismatched room counts and highlights rooms on the wrong floor.
- **Connect bedrooms to bathrooms** appears in **Transform**. It keeps existing relationships and pairs unconnected bedrooms with unused bathrooms on the same floor, preferring rooms that share a wall.
- **Connect kitchen to dining room** appears in **Transform**. It proposes one Access relationship between the first kitchen and the first dining room if they are unrelated.
- **Generate Family House** appears in **Transform**. Start with an empty design to preview 13 editable rooms and 12 Access connections. The entrance serves reception and living. The living room leads to dining and the staircase, and the dining room leads to the kitchen. The staircase connects through a slab opening to the upstairs hallway, which serves three bedroom and bathroom suites. Stair treads need separate modelling.
- **Check Spatial Connectivity** appears in **Analyse › Network**. It highlights rooms and edges with problems. Colour rooms by the analysis to see individual findings for missing links, invalid contact, privacy violations and routes from the entrance.
- **Resolve Spatial Connections** appears in **Transform**. It previews missing Access links where the rooms share a wall or slab. It lists prohibited edge IDs for manual removal because the Student API cannot delete edges. Move rooms that need direct contact, remove the listed edges and rerun the transform to preview any remaining links.

## Designs

Draw your own house and follow the steps in [designs/README.md](designs/README.md) to add it.

## Generating alternatives

- Set the **Random seed** to a new whole number for another result. The same seed and settings reproduce the same layout on an empty project or a compatible house without extra constraints.
- **Building typology** selects Compact, Linear, L-shaped, Courtyard, Staggered or Clustered. **Random** lets the seed choose.
- **Spatial variation** changes the allowed orientations and proportions. **Compactness** favours a tighter footprint. **Room size variation** changes how much room widths and depths can vary.
- After applying a house, change the seed or settings and run again to preview a replacement. **Apply** keeps the existing room IDs, custom attributes and direct connections. **Undo** restores the previous layout in one step. Added connections must stay direct and respect privacy, so they can rule out some layouts.
- Regeneration uses the same 13 room Functions and expected floors. The Student API can move and resize existing rooms. Projects with different room counts or incompatible links require manual edits before regeneration.

## How to try it

1. Run `npm run dev` and open `http://localhost:5173/?toolkit=u821-dc-test01`.
2. Choose **Create project**, then **Transform › Generate Family House › Run**. Review the rooms and connections in the preview and choose **Apply** to add them.
3. Edit the rooms as needed. Run **Analyse › Network › Check room distribution** to check the room counts and floors.

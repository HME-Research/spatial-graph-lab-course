# Two-storey family house

Toolkit `u821-dc-test01` generates editable houses on a 3 m grid. Each candidate must have 200–400 m² of nominal building floor area, excluding the outdoor pool.

## Room programme

| Level | Rooms |
|---|---|
| Ground, 0 | Entrance hall, living room, guest reception, dining, kitchen, music room, guest bathroom, plant room, swimming pool, garage and staircase |
| Upper, 1 | Three bedrooms with three separate ensuites, an upper living room and an upper hall |

The app shows each room's Function, position, level, grid dimensions, calculated area and links. Read a rectangular room's orientation from the direction of its long side in plan. The **Architectural zone** and **Privacy classification** are editable toolkit fields with defaults for each Function. Existing bedroom, bathroom, seating, ventilation and access attributes remain available. The IDs `main-entrance`, `bathroom` and `hallway` still refer to the entrance hall, ensuites and upper landing.

The entrance, plant room and guest bathroom occupy one 3 × 3 m cell each. The pool is a 3 × 15 m rectangle outside the enclosed footprint. Guest reception is strictly larger than each other enclosed room, and the three bedrooms have different areas. The stairs align with the upper landing for a vertical Access opening. Stair treads and pool construction require separate modelling.

## Generate and edit

1. Run `npm run dev` and open `http://localhost:5173/?toolkit=u821-dc-test01`.
2. Create a project and open **Transform › Generate Family House**. Set the parameters, then choose **Run** to preview and **Apply** to accept.
3. Change the seed or use **Generate Next Variation** to preview another layout. The same seed and settings reproduce the search. **Undo** and **Redo** use the app's document history.

**Building typology** guides room placement and proportions. Compact keeps the public rooms shallow, Linear favours a deeper spine, L-shaped extends a wing, Staggered offsets the outdoor edge, and Clustered puts the service branch and public rooms on different sides of the entrance. Random mixes these strategies. The transform leaves the design intact if you select U-shaped or Courtyard, which currently have no validated placement strategy.

**Target building area** and **Building aspect ratio** guide scoring. The area range itself is mandatory. Grid increments and the room programme can prevent an exact target. **Spatial variation** adjusts the search preferences and attachment choices, **Room size variation** controls how much the rooms can grow, and **Compactness** favours a tighter footprint. **Maximum generation attempts** bounds the search. Candidates must pass the room, geometry, connectivity and privacy rules before scoring.

Regeneration preserves room IDs, custom values and compatible edges. It can start with an empty design, upgrade an original 13-room toolkit house by adding the six new rooms, or reshape a complete 19-room toolkit house. Existing edges can restrict the available layouts. Changes are applied in a single preview. The Student API can move and resize rooms and add rooms or connections. Arbitrary design replacement and edge removal require manual editing.

## Analyse › Network

- **Check Room Distribution** flags missing or additional rooms and incorrect storeys.
- **Check Spatial Connectivity** flags missing doors, invalid geometry, private cut-throughs, disconnected rooms and problems with the vertical Access link.
- **Check Dimensional Compliance** reports enclosed floor area, fixed room sizes, bedroom area differences and whether reception is the largest enclosed room.
- **Check Privacy and Separation** checks ensuite exclusivity, circulation through private rooms and the minimum two intermediate rooms between the living and plant rooms.
- **Evaluate Layout Quality** shows an overall score and scores for connectivity, circulation, compactness, privacy and dimensions. It reports mandatory failures separately from design preferences. Use the highlighted rooms and their analysis values to see individual findings.

## Other transforms

- **Optimise Room Dimensions** looks for a compliant layout scored toward the target area.
- **Improve Spatial Layout** gives more weight to compactness and shorter routes.
- **Resolve Spatial Connections** and **Resolve Missing Connections** preview missing Access links where the rooms share a wall or slab. They report prohibited edges by ID for manual removal.
- **Connect bedrooms to bathrooms** proposes exclusive, wall-sharing ensuite doors. **Connect kitchen to dining room** adds a direct ground-floor Access link when a shared wall exists.

Draw and export your own design when ready. See [designs/README.md](designs/README.md).

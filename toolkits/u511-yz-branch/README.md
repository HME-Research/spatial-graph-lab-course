# Community Resilience Toolkit

Explore how spatial connectivity, emergency shelter accessibility and resource capacity can improve neighbourhood resilience during extreme weather events.

**Toolkit name:** `u511-yz-branch`. All code imports only the official Student API or helpers in this folder.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---|---|
| `residential` | Residential | `#4f7cc0` | App default | None |
| `emergency-shelter` | Emergency Shelter | `#38966b` | App default | None |
| `medical-centre` | Medical Centre | `#f2cc3d` | App default | None |
| `resource-hub` | Resource Hub | `#c48a32` | App default | None |
| `circulation` | Circulation | `#90949b` | App default | None |

## Custom attributes (`toolkit.ts`, also declared by each relevant Function)

| key | kind | meaning |
|---|---|---|
| `residentCount` | number, minimum 0 | Total residents; enter whole people |
| `limitedMobilityResidents` | number, minimum 0 | Subset of residents with limited mobility; no greater than resident count |
| `shelterCapacity` | number, minimum 0 | Maximum people accommodated; enter whole places |
| `medicalCapacity` | number, minimum 0 | People served per period you choose consistently across the design |
| `resourceCapacity` | number, minimum 0 | Supplies in a unit you choose consistently across the design |
| `wheelchairAccessible` | boolean | Whether the circulation space is wheelchair accessible |

No attribute has a default: an omitted value is unknown, never an assumed zero or false. Enter zero only when you have established it. The app makes the fields available project-wide; the capacity analysis reads population only on Residential and capacity only on Emergency Shelter. It rejects negative, fractional, nonnumeric and unsafe population/capacity counts as missing or invalid.

## Algorithms (`algorithms/`)

- **Emergency Shelter Accessibility**: design analysis in **Analyse > Network**. A breadth-first search starting at all shelters finds the minimum connections from each residence to any shelter. Colours distinguish exact connection counts and the Unreachable category; unreachable residences are highlighted. No shelters means all residences are unreachable. No residences or an empty graph gives an explanatory message.
- **Shelter Capacity Assessment**: design analysis in **Analyse > Network**. Finds connected components, including isolated nodes, then sums residential population and shelter places in each. Component labels use their lowest node id. Colours distinguish Sufficient, Insufficient and Unknown; every node of a confirmed insufficient component is highlighted. The text gives each component's totals and the ids of nodes needing data. Partial totals are labelled partial. Known population exceeding complete capacity proves a shortage even if some population is missing; missing shelter capacity prevents a definite assessment. With no shelters, capacity is structurally zero; missing residential data still prevents claiming sufficient capacity.

## Assumptions

Both relationship kinds are counted as two-way, equally weighted graph connections, through any Function. Spatial distance, connection buildability, flood exposure and evacuation time are not assessed. A reachable shelter may be full or have unknown capacity; the accessibility analysis still counts its graph distance.

Limited mobility, wheelchair accessibility, medical capacity and resource capacity are recorded for your design exploration but do not alter these two requested analyses. Connectivity does not establish a wheelchair-accessible evacuation route. Colours were chosen for distinct Functions; facade fractions are left to the app. Medical periods and supply units are yours to define.

## Designs (`designs/`)

**Community Resilience Courtyard** (`community-resilience-courtyard.json`) now contains the student's requested bunker-inspired revision. The file and design name are preserved. Open it through **Open toolkit design?**; no `defaultDesign` is set. Reopen the design as a new project to see file changes; an already-open project keeps its own copy.

### Design idea: a compact refuge with stepped volumes

Three ground-floor homes form the north base. Two upper homes sit above the outer homes, leaving a lower centre roof; a third upper home sits above the eastern resource hub. A 6 m high western shelter and yellow eastern medical block frame a 12 x 12 m open central court. Lower 3 m volumes alternate with the 6 m masses. Flat roofs and small stretched windows give the enclosed buildings a bunker-like character. This is a massing concept, not an underground or blast-resistant construction design.

| Node ids | Programme | Geometry and role |
|---|---|---|
| 1 | Central court | 12 x 12 m, open sides and no roof |
| 2-4 | Ground homes | 6 x 6 m each; 6 residents each, including 2 with limited mobility |
| 5-6 | Upper homes | 6 x 6 m, supported above homes 2 and 4; 6 residents each |
| 7 | Upper home | 6 x 6 m, supported above resource hub 9; 6 residents |
| 8 | Yellow medical block | 6 x 9 m footprint, 6 m high; illustrative 12 people served/day |
| 9 | Resource base | 6 x 9 m footprint, 3 m high; illustrative 48 person-day supply kits |
| 10 | Tall western shelter | 6 x 9 m footprint, 6 m high; illustrative 24 places |
| 11 | Low western shelter | 6 x 9 m footprint, 3 m high; illustrative 24 places |
| 12-15 | Ground circulation ring | North/south 18 x 3 m; east/west 3 x 12 m |
| 16-17 | Upper galleries | North/east galleries directly supported by ground circulation |

### Circulation and limits

The ground ring connects homes, the court and all facilities without passing through another home. Both shelters and both eastern service blocks have two connections to the ring. Upper homes enter linked north/east galleries, which have two separate vertical connection reservations: 12-16 and 13-17. Every relationship joins volumes sharing a face, and every upper cell has a supporting volume below. These checks establish geometric adjacency, not engineered structural support.

Vertical relationships are floor openings in the app, not automatically designed stairs or lifts. Reserve a stair plus an accessible lift at each vertical core in subsequent architectural design. Upper galleries and the ground strips containing those reservations have no wheelchair-accessibility value yet. Other ground circulation is marked true as design intent only. The illustrative six residents with limited mobility are assigned to the three ground-floor homes; upper homes record zero for this sample, not a restriction on future occupants. Door widths, turning space, ramps, lift availability and evacuation procedures remain to be designed.

Run **Emergency Shelter Accessibility**: homes 2-4 have **2 connections**, homes 5-6 have **3**, and home 7 has **4** to the nearest shelter. These graph distances do not prove a usable stair or wheelchair route. Run **Shelter Capacity Assessment**: one component, population **36**, shelter capacity **48**, **Sufficient**. Counts and capacities are illustrative, not verified operational or space standards. The ring and two vertical reservations provide alternative graph routes, while each home still has a single entrance connection.

## How to try it

1. Run `npm run check:toolkit -- -t u511-yz-branch`, then `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u511-yz-branch` (use the port printed by the server if different).
3. Choose **Create project** with this toolkit. Draw Residential, Circulation and Emergency Shelter nodes and connect Residential to Circulation to Shelter. Set the residence's `residentCount` to 20 and the shelter's `shelterCapacity` to 10 in Properties.
4. Run **Analyse > Network > Emergency Shelter Accessibility**: the residence should have the `2 connection(s)` colour category. Add a direct edge to the shelter and rerun: it becomes `1 connection(s)`. Add another isolated residence: it is Unreachable and highlighted. A second shelter should always give the shortest available count.
5. Run **Shelter Capacity Assessment**: the connected component reports population 20, capacity 10 and Insufficient, highlighting all its nodes. Change capacity to 25 and rerun: Sufficient. At exactly 20 it is also Sufficient.
6. Clear the shelter capacity and rerun: its component becomes Unknown, with a partial capacity sum and the shelter's id reported. Restore capacity, then clear resident count: population is partial and the component is Unknown. Enter zero to distinguish a known zero from missing data.
7. Test an isolated residence with population 5: it is its own insufficient component with no shelters. Remove all shelters: accessibility highlights all residences, while capacity reports no shelters per component. On an empty graph both analyses explain that there is nothing to assess.

The toolkit check now runs both algorithms on Community Resilience Courtyard as the first supplied design. The manual steps above also let you explore empty graphs, missing values and disconnected nodes. Analyses never edit your design; use **Clear** to remove their overlays.

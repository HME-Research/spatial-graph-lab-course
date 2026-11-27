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

Only `designs/README.md` is supplied. Draw your own designs; `toolkit.ts` has no `defaultDesign`. Once you add your exported design, **Open toolkit design…** will list it.

## How to try it

1. Run `npm run check:toolkit -- -t u511-yz-branch`, then `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u511-yz-branch` (use the port printed by the server if different).
3. Choose **Create project** with this toolkit. Draw Residential, Circulation and Emergency Shelter nodes and connect Residential to Circulation to Shelter. Set the residence's `residentCount` to 20 and the shelter's `shelterCapacity` to 10 in Properties.
4. Run **Analyse > Network > Emergency Shelter Accessibility**: the residence should have the `2 connection(s)` colour category. Add a direct edge to the shelter and rerun: it becomes `1 connection(s)`. Add another isolated residence: it is Unreachable and highlighted. A second shelter should always give the shortest available count.
5. Run **Shelter Capacity Assessment**: the connected component reports population 20, capacity 10 and Insufficient, highlighting all its nodes. Change capacity to 25 and rerun: Sufficient. At exactly 20 it is also Sufficient.
6. Clear the shelter capacity and rerun: its component becomes Unknown, with a partial capacity sum and the shelter's id reported. Restore capacity, then clear resident count: population is partial and the component is Unknown. Enter zero to distinguish a known zero from missing data.
7. Test an isolated residence with population 5: it is its own insufficient component with no shelters. Remove all shelters: accessibility highlights all residences, while capacity reports no shelters per component. On an empty graph both analyses explain that there is nothing to assess.

The toolkit check validates definitions but cannot run algorithms on an example until you supply a design. These manual steps exercise their behaviour without adding a generated design. Analyses never edit your design; use **Clear** to remove their overlays.

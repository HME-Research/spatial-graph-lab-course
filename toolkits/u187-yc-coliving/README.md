# Branch co-living

Co-living housing with private bedrooms and shared spaces for cooking, socialising and working. Compare resident capacity (beds) with shared seats and desks on each level.

**Toolkit name:** `u187-yc-branch`.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---|---|
| `bedroom` | Bedroom | `#4f7cc0` | 0.35 | beds 1 |
| `shared-kitchen` | Shared kitchen | `#d4623b` | 0.4 | seats 0 |
| `communal-living-room` | Communal living room | `#e8a33d` | 0.6 | seats 0 |
| `shared-workspace` | Shared workspace | `#4f8f7a` | 0.5 | desks 0 |
| `entrance` | Entrance | `#8e6bb8` | 0.3 | none |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `beds` | number ≥ 0 | resident capacity in a Bedroom |
| `seats` | number ≥ 0 | seats in a Shared kitchen or Communal living room |
| `desks` | number ≥ 0 | desks in a Shared workspace |

Chosen defaults: one bed per Bedroom, zero shared seats or desks until you enter capacities in Properties. All other fields default to zero. Use whole numbers for these counts. Colours and window fractions are starting choices you can edit in the app.

## Algorithms (`algorithms/`)

- **Capacity by level** (analysis, Analyse > Network): counts beds, kitchen seats, living room seats and workspace desks separately on each level, then shows each shared capacity divided by beds to two decimal places. A room is counted once on its starting level (`position[2]`, with 0 as ground). Ratios are N/A when that level has no beds. Missing capacity values count as zero.
- **Two beds above 12 m²** (transform, Transform): sets each Bedroom with nominal plan area strictly greater than 12 m² to two beds. Other bedrooms keep their values; bedrooms already set to two need no change. The app previews changes before **Apply**, and **Undo** reverses the application. Nominal area uses the app's `area` metric, before boundary shifts.

## Designs (`designs/`)

Only `designs/README.md` is supplied. Draw your own designs in the app; no default design is set.

## How to try it

1. Run `npm run check:toolkit -- -t u187-yc-branch` and `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u187-yc-branch`.
3. Choose **Create project** with this toolkit, draw rooms, and enter their beds, seats and desks in **Properties**.
4. Run **Analyse > Network > Capacity by level** to compare counts and ratios.
5. Draw a Bedroom of two cells (18 m²). Run **Transform > Two beds above 12 m²**, inspect the preview, then **Apply** to set two beds. Run the analysis again to see the updated ratios.
6. Follow `designs/README.md` to add an exported design; then find it in **Open toolkit design…**.

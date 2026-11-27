# Student accommodation

**What it is for:** standard student accommodation: private Bedrooms, each with its own Ensuite, around a shared Living room, Dining kitchen and Laundry. Its analysis checks that every Bedroom has exactly one Ensuite and every Ensuite belongs to exactly one Bedroom.

**Toolkit name:** `u150-my-skillsbranch` (the folder name). Open the app with `?toolkit=u150-my-skillsbranch`.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---:|---|
| `bedroom` | Bedroom | `#5b8fd1` | 0.35 | beds 1 |
| `ensuite` | Ensuite | `#7fc6c2` | 0.10 | beds 0 |
| `living-room` | Living room | `#e8a33d` | 0.60 | beds 0 |
| `dining-kitchen` | Dining kitchen | `#d9694a` | 0.50 | beds 0 |
| `laundry` | Laundry | `#9b9a8f` | 0.10 | beds 0 |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `beds` | number ≥ 0 | how many students sleep in the room (Bedroom 1, every other room 0) |

## Algorithms (`algorithms/`)

- **Ensuite check** (design analysis, Analyse › Network): a Bedroom has an Ensuite when a relationship (Access or Open) joins them. It highlights every Bedroom without an Ensuite or with more than one, and every Ensuite joined to no Bedroom or shared by several. The big number is how many rooms have a problem (0 = all fine).

## Designs (`designs/`)

None yet: draw them in the app and add them here (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u150-my-skillsbranch` and `npm run typecheck`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u150-my-skillsbranch`, **Create project**
3. Draw two Bedrooms and two Ensuites next to them, and join only one pair with an Access relationship.
4. Analyse › Network › **Ensuite check**: it shows 2 and highlights the unjoined Bedroom and Ensuite. Join the second pair and run it again: it shows 0.

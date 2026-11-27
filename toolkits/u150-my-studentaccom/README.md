# Student accommodation

**What it is for:** standard student accommodation: private Bedrooms, each with its own Ensuite, around a shared Living room, Dining kitchen and Laundry. Its analysis checks that every Bedroom has exactly one Ensuite and every Ensuite belongs to exactly one Bedroom.

**Toolkit name:** `u150-my-studentaccom` (the folder name). Open the app with `?toolkit=u150-my-studentaccom`.

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
- **Generate flat** (transform, Transform; run it on a new empty project): draws a whole flat as rooms and relationships. A long shared Living room (one cell per bedroom column) with the Dining kitchen (2 cells) at one end and the Laundry at the other; every Bedroom opens off the Living room (Access) and has its own Ensuite behind it (Access). Parameters:
  - *Number of bedrooms*, 1–16 (default 6);
  - *Bedroom layout*, `one-side` (default) or `both-sides` of the Living room;
  - *Bigger bedrooms* (default on): asks each Bedroom–Ensuite wall to move 1.5 m into the Ensuite (a boundary shift), so the Bedroom is 13.5 m² and the Ensuite 4.5 m² as built.

## Designs (`designs/`)

None yet: draw them in the app and add them here (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u150-my-studentaccom` and `npm run typecheck`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u150-my-studentaccom`, **Create project**
3. Transform › **Generate flat**: set the parameters, **Run**, look at the preview, **Apply**.
4. Analyse › Network › **Ensuite check**: it shows 0 (every Bedroom has its own Ensuite). Delete one relationship between a Bedroom and its Ensuite and run it again: it shows 2 and highlights both rooms.

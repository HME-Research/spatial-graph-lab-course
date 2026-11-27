# u150-my-studentaccom — student accommodation

**What it is for:** standard student accommodation: private Bedrooms, each with its own Ensuite, off a Hallway that also leads to a shared open-plan Living room and Dining kitchen and a Laundry, entered through an Entrance. Every room has a wall to the outside for daylight. Its analyses check that every Bedroom has exactly one Ensuite (and the other way round), and that every room has an outside wall.

**Toolkit name:** `u150-my-studentaccom` (the folder name). Open the app with `?toolkit=u150-my-studentaccom`. The file `toolkit.ts` keeps exactly that name: the app looks for it in every toolkit folder.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---:|---|
| `bedroom` | Bedroom | `#5b8fd1` | 0.35 | beds 1 |
| `ensuite` | Ensuite | `#7fc6c2` | 0.10 | beds 0 |
| `living-room` | Living room | `#e8a33d` | 0.60 | beds 0 |
| `dining-kitchen` | Dining kitchen | `#d9694a` | 0.50 | beds 0 |
| `laundry` | Laundry | `#9b9a8f` | 0.10 | beds 0 |
| `entrance` | Entrance | `#c96fa8` | 0.30 | beds 0 |
| `hallway` | Hallway | `#b9b4a6` | 0.10 | beds 0 |

## Custom attributes (`toolkit.ts`)

| key | kind | meaning |
|---|---|---|
| `beds` | number ≥ 0 | how many students sleep in the room (Bedroom 1, every other room 0) |

## Algorithms (`algorithms/`)

- **Ensuite check** (design analysis, Analyse › Network): a Bedroom has an Ensuite when a relationship (Access or Open) joins them. It highlights every Bedroom without an Ensuite or with more than one, and every Ensuite joined to no Bedroom or shared by several. The big number is how many rooms have a problem (0 = all fine).
- **Daylight check** (design analysis, Analyse › Network, works in any project): highlights every room with no wall to the outside (the app's calculated value *has exterior façade*). The big number is how many rooms have none (0 = every room can get daylight).
- **Generate flat** (transform, Transform): draws a whole flat as rooms and relationships, to the right of any rooms already in the design (one empty cell between). For every number of bedrooms, both layouts and every room size:
  - **circulation:** Entrance → Hallway (Access); the Hallway gives Access to every Bedroom, the Living room and the Laundry; the Living room and Dining kitchen are one open-plan space (Open); each Bedroom has its own Ensuite (Access);
  - **daylight:** every room has at least one wall to the outside. Each Bedroom and its Ensuite sit side by side along the Hallway, with their back wall outside. A Hallway longer than 32 cells (the app’s limit for one room) is made of several Hallway rooms joined by Access; with bedrooms on both sides, each piece ends in a cell with a window to the south.

  ```
  default: 6 bedrooms, one side        5 bedrooms, both sides, Bedroom 2 × 2
  K L L B E B E B E B E B E B E        K L L B B · B B · B B
  K L L H H H H H H H H H H H H X      K L L B B E B B E B B E U
                              U        K L L H H H H H H H H H H X
                                       K L L B B E B B E
                                       K L L B B · B B
  ```
  K Dining kitchen, L Living room, H Hallway, X Entrance, B Bedroom, E Ensuite, U Laundry; one letter = one 3 × 3 m cell, · outside.

  Parameters (sizes in cells, 1 cell = 3 m):
  - *Number of bedrooms*, 1–16 (default 6);
  - *Bedroom layout*, `one-side` (default) or `both-sides` of the Hallway;
  - *Bedroom width* 1–4 (default 1, along the Hallway) and *Bedroom depth* 1–4 (default 1, from the Hallway to the outside wall);
  - *Ensuite width* 1–2 (default 1; an Ensuite is always 1 cell deep);
  - *Dining kitchen width* 1–4 (default 1) and *Living room width* 1–8 (default 2): both are as deep as the flat, so by default the Living room is twice the Dining kitchen (2 : 1);
  - *Bigger bedrooms* (default on): asks each Bedroom–Ensuite wall to move 1.5 m into the Ensuite (a boundary shift), so the Bedroom gains the area the Ensuite loses (default sizes: Bedroom 13.5 m², Ensuite 4.5 m²).

  Every generated room can also be moved and resized afterwards in the app, like any room you draw.

## Designs (`designs/`)

None yet: draw them in the app and add them here (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u150-my-studentaccom` and `npm run typecheck`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u150-my-studentaccom`, **Create project**
3. Transform › **Generate flat**: set the parameters, **Run**, look at the preview, **Apply**.
4. Analyse › Network › **Ensuite check**: it shows 0 (every Bedroom has its own Ensuite). Delete one relationship between a Bedroom and its Ensuite and run it again: it shows 2 and highlights both rooms.
5. Analyse › Network › **Daylight check**: it shows 0 (every room has an outside wall). Draw a room that closes off a Bedroom's outside wall and run it again: that Bedroom is highlighted.

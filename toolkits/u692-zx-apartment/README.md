# ZX Quiet bedrooms

**What it is for:** small family apartments: bedrooms, a kitchen, a bathroom, a balcony and a living room arranged around an entrance. The toolkit checks whether every Bedroom is quiet and private: not exposed to noise from the Living room or Kitchen, and reachable from the Entrance without walking through another room. It can also propose the missing door from the Entrance.

**Toolkit name:** `u692-zx-apartment` (the folder name). Open the app with `?toolkit=u692-zx-apartment`.

## Functions (`functions/`)

| id | label | colour | window fraction | own defaults |
|---|---|---|---|---|
| `bedroom` | Bedroom | `#4f7cc0` | 0.35 | beds 1 |
| `kitchen` | Kitchen | `#d4623b` | 0.4 | has a window: yes |
| `bathroom` | Bathroom | `#5fb3b3` | 0.15 | has a bathtub: no |
| `living-room` | Living room | `#e8a33d` | 0.5 | seats 4 |
| `balcony` | Balcony | `#7cb85a` | 0.9 | faces south: no |
| `entrance` | Entrance | `#9b9a8f` | 0.1 | has storage: yes |

## Custom attributes (`toolkit.ts`)

Every room has every attribute; only the Function it belongs to gives it a default.

| key | kind | meaning |
|---|---|---|
| `beds` | number ≥ 0 | number of beds in a Bedroom |
| `hasWindow` | yes/no | whether a Kitchen has a window |
| `hasBathtub` | yes/no | whether a Bathroom has a bathtub |
| `seats` | number ≥ 0 | number of seats in a Living room |
| `facesSouth` | yes/no | whether a Balcony faces south |
| `hasStorage` | yes/no | whether an Entrance has storage |

## Algorithms (`algorithms/`)

- **Quiet bedrooms** (analysis, Analyse › Network): checks every Bedroom for two problems and highlights the Bedrooms that have one; the text names the room that causes it.
  1. *Noise*: the Bedroom touches a Living room or Kitchen through a door (Access), an opening (Open), a shared wall, or because that room is directly above or below it.
  2. *Inner room*: the Bedroom has no door or opening to an Entrance but is joined to a Living room or Kitchen, so you reach it by walking through that room.
- **Doors to the entrance** (transform): for every inner-room Bedroom that already shares a wall with an Entrance, proposes a new door (Access) between them. Inner Bedrooms with no Entrance next to them are left alone (the summary counts them).

The rule for an inner room is in `lib/bedrooms.ts`, shared by both algorithms so they always agree.

## Designs (`designs/`)

None yet: I draw my designs in the app and add them here later (see `designs/README.md`).

## How to try it

1. `npm run check:toolkit -- -t u692-zx-apartment`
2. `npm run dev`, open `http://localhost:5173/?toolkit=u692-zx-apartment` and **Create project**.
3. Draw a row on one level: Living room, Bedroom, Entrance (each one cell, side by side). Join the Living room and the Bedroom with an Access edge, and the Living room and the Entrance with another.
4. Analyse › Network › **Quiet bedrooms**: the Bedroom lights up, with noise from the Living room (door) and inner room, reached through the Living room.
5. Transform › **Doors to the entrance** › Run › Apply: a new door joins the Entrance and the Bedroom. Run **Quiet bedrooms** again: only the noise problem is left.

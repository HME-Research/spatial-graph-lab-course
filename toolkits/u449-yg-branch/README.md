# Courtyard Residence

A two-storey home organized around a covered courtyard. Shared ground-floor rooms sit around it, with two private upstairs bedrooms and direct bathroom access.

**Toolkit name:** `u449-yg-branch`. Open the app with `?toolkit=u449-yg-branch`.

## Functions

| id | label | colour | window fraction | own defaults |
|---|---|---|---:|---|
| `covered-courtyard` | Covered courtyard | `#8bbf9f` | 0.70 | central, roofed |
| `entrance` | Entrance | `#d9a66f` | 0.25 | welcoming |
| `kitchen` | Kitchen | `#e7c968` | 0.35 | daylight: high |
| `living-room` | Living room | `#7ba6c9` | 0.40 | facesCourtyard |
| `guest-bedroom` | Guest bedroom | `#9b8ac4` | 0.35 | floor: ground |
| `adult-bedroom` | Adult bedroom | `#5f83aa` | 0.35 | floor: upstairs, privateBathroom |
| `childrens-bedroom` | Children’s bedroom | `#e58d9e` | 0.35 | floor: upstairs, privateBathroom |
| `bathroom` | Bathroom | `#6cb8bd` | 0.15 | — |

## Custom attributes

`daylight` (high/medium/low), `central`, `roofed`, `welcoming`, `facesCourtyard`, `floor` (ground/upstairs), and `privateBathroom`.

## Algorithms

- **Check courtyard layout** (analysis, Analyse → Network): checks that the four shared ground-floor spaces sit around the courtyard and each upstairs bedroom has a bathroom relationship on its level.
- **Improve courtyard circulation** (transform, Transform): rates daylight from exterior wall length and proposes access links between the courtyard, ground-floor rooms, and each upstairs bedroom and its nearest same-level bathroom.

## Designs

`designs/` contains only a README. Draw designs in the app and add an exported design later.

## How to try it

Run `npm run dev`, open `http://localhost:5173/?toolkit=u449-yg-branch`, choose **Create project**, and add rooms with these Functions. Run **Check courtyard layout** in **Analyse → Network**, then preview **Improve courtyard circulation** in **Transform** to see daylight values and proposed access links.

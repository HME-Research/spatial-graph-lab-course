# Work-Living studio

A studio home organised around an entrance, with a window room that can host meetings by day and serve as a living room in the evening.

**Toolkit name** `u118-jw-work-living-studio`

## Functions

| ID | Function | Colour | Window fraction | Own defaults |
|---|---|---|---:|---|
| `bedroom` | Bedroom | `#735c96` | 0 | 2 beds |
| `studio` | Studio | `#426f8e` | 0.35 | Has window |
| `meeting-room` | Meeting room | `#a2643e` | 0.35 | Has window |
| `bathroom` | Bathroom | `#547f8b` | 0 | |
| `kitchen` | Kitchen | `#a6813d` | 0.35 | Has window |
| `living-room` | Living room | `#527a57` | 0.50 | Has window |
| `entrance` | Entrance | `#756c61` | 0 | |

## Custom attributes

| Key | Kind | Meaning |
|---|---|---|
| `beds` | Number | Bed count |
| `hasWindow` | Boolean | Marks a room as having a window. Defaults to false. |
| `scheduledUse` | Enum | Day meeting room or evening living room. |

## Algorithms

- **Analyse › Network › Visitor-accessible window rooms** highlights rooms marked **Has window** that have an exterior wall and a built path from an entrance that avoids the bedroom.
- **Transform › Preview day or evening use** takes a highlighted **Room ID** and **Time of day**. The preview proposes a scheduled-use label on the same room, preserving its Function, frame, windows and connections.

## Designs

See [Add a design](designs/README.md) to save your own drawing.

## How to try it

1. Run `npm run dev` and open `http://localhost:5173/?toolkit=u118-jw-work-living-studio`.
2. Choose **Create project**. Draw an Entrance with a Studio next to it and connect them with **Access**. Give the Studio an exterior wall.
3. Run **Visitor-accessible window rooms**. The Studio should highlight. Enter its ID in **Preview day or evening use**, choose **Day**, and run the preview. Discard it and run again with **Evening** to compare the labels.

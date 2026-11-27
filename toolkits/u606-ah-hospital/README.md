# Hospital

This toolkit is for drawing a small hospital with five consultation rooms, a large five-bed bedroom and one bathroom shared across the consultation rooms. A reception and hallway connect the spaces.

## Functions

| ID | Label | Colour | Window fraction | Defaults |
|---|---|---|---|---|
| `bedroom` | Bedroom | `#7863a6` | 0 | 5 single beds |
| `consultation-room` | Consultation Room | `#458693` | 0 | 1 desk, 2 chairs |
| `shared-bathroom` | Shared Bathroom | `#577eac` | App default | |
| `reception` | Reception | `#c38b42` | 0.4 | Has windows |
| `hallway` | Hallway | `#73936b` | 0.3 | Has windows |
| `outdoor-entry` | Outdoor Entry | `#8a8173` | 0 | |

## Custom attributes

| Key | Kind | Meaning |
|---|---|---|
| `beds` | Number | Single beds in a room |
| `desks` | Number | Desks in a room |
| `chairs` | Number | Chairs in a room |
| `hasWindows` | Boolean | Whether windows are intended |
| `circulationPath` | Boolean | Whether a connection is on a marked route |

## Algorithms

- **Transform › Mark circulation paths** previews which connections to mark. **Apply** saves the marks in each connection's Properties.
- **Analyse › Network › Show circulation paths** highlights the current routes and reports how many rooms are reachable.

Both start at the lowest-numbered Reception, count the fewest connections to each destination, and use Hallways as the only spaces to pass through. They use existing connections the app can build, so draw connections from the Hallway to the rooms you want it to serve.

## Designs

**Hospital starter** has five consultation rooms along one side of the hallway and the shared bathroom and five-bed bedroom across it. Reception has a door onto the roofless outdoor landing and another into the hallway. See [how to add a design](designs/README.md) if you want to save your own layout.

The starter gives each consultation room one window opposite its hallway door. Reception and a short hallway return enclose the two ends of the row.

The hallway return connects up to the Level 1 hallway through a floor opening with a symbolic access marker. The Level 1 bedroom and shared bathroom sit directly above the ground-floor pair and each has a door to the upstairs hallway.

## How to try it

1. Run `npm run dev` and open `http://localhost:5173/?toolkit=u606-ah-hospital`.
2. Choose **Open toolkit design…** and select **Hospital starter** under **Toolkit: Hospital**.
3. Run **Transform › Mark circulation paths**. It should report thirteen reachable destinations. Use **Plan › Storey › Level 1** to see the upstairs rooms.

# Starting house — build it manually in the app

This five-room starting design is an **instruction sheet, not app-import JSON**. The ZIP only contained the Student API, not the application's design-document JSON schema or loader. Create these rooms in the interface, save/export with your own app version, and use that exported file as the test input.

| ID | Function | Grid minimum `[x,y,z]` | Size `[sx,sy,sz]` |
|---|---|---|---|
| entry | Entrance | `[0,0,0]` | `[1,1,1]` |
| living | Living | `[1,0,0]` | `[2,1,1]` |
| kitchen | Kitchen | `[3,0,0]` | `[1,1,1]` |
| bedroom | Bedroom | `[1,1,0]` | `[1,1,1]` |
| bath | Bathroom | `[0,1,0]` | `[1,1,1]` |

Create **Access** edges: entry—living, living—bedroom, entry—bath. Create **Open** edge: living—kitchen. All rooms are on the ground floor (`z=0`). Be aware: drawing relationships between these rooms has meaning beyond mere spatial contact. If your app generates unique node IDs, use those actual IDs for Level 1 `startRoomId` (the default `living` only works with that exact internal ID).

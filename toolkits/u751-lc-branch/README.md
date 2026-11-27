# Branch shared house

A shared house for four residents, with a workspace for one resident and up to two visitors. Check whether visitors can reach the workspace and a designated WC from the entrance without passing through any bedroom, and whether workspace capacity is recorded as at least three people.

**Toolkit name:** u751-lc-branch. Open the app with ?toolkit=u751-lc-branch.

## Functions (functions/)

| id | label | colour | window fraction | own defaults |
|---|---|---|---|---|
| entrance | Entrance | #8e6bb8 | app default | none |
| bedroom | Bedroom | #4f7cc0 | app default | numberOfBeds: 1 |
| workspace | Workspace | #8b5e3c | app default | capacity unrecorded |
| wc | WC | #3fa9b5 | app default | visitorAccessAllowed: false |
| shared-living-dining | Shared Living/Dining | #e8a33d | app default | none |
| kitchen | Kitchen | #d4623b | app default | none |

## Custom attributes (toolkit.ts)

| key | kind | meaning |
|---|---|---|
| numberOfBeds | number, minimum 0 | Beds recorded for a Bedroom. Four residents are the design brief; this toolkit does not check total beds. |
| capacity | number, minimum 0 | Workspace capacity in people. No default: record it yourself in Properties. |
| visitorAccessAllowed | boolean | Set to true on a WC to designate it for visitors. Missing permission is not authorisation. |

The app makes these fields available on every room. The analyses use capacity only on Workspaces and visitor permission only on WCs. Select a room and edit its values in **Properties**.

## Algorithms (algorithms/)

All three are design analyses in **Analyse > Network** and leave your design unchanged.

- **Visitor workspace routes** (visitor-workspace-routes): find and highlight one shortest route to each Workspace, excluding every Bedroom.
- **Visitor WC routes** (visitor-wc-routes): find and highlight one shortest route to each WC whose visitor permission is true, excluding every Bedroom.
- **Workspace capacity** (workspace-capacity): check every Workspace for a recorded capacity of at least three; highlight rooms with missing, invalid or insufficient capacity.

Routes use two-way Access and Open relationships. Shortest means fewest connections, not physical distance. For several entrances, use the nearest entrance for each destination. For several destinations, show their routes together and report each destination separately by room id. Equal-length choices use entrance id, then connection id order. A route analysis's number is its count of unreachable destinations; the capacity analysis's number is its count of Workspaces needing attention. Missing rooms produce an explanation instead of a successful check.

These are graph checks: an unresolved architectural relationship still counts as a connection. Check the app's architecture resolution separately.

Shared route code lives in lib/visitor-routes.ts; the two route analyses call it.

## Designs (designs/)

Only designs/README.md is included. Draw your own designs in the app and add them later; toolkit.ts has no default design. The assets/ folder contains only the starter's instructions.

## How to try it

1. Run npm run check:toolkit -- -t u751-lc-branch and npm run typecheck.
2. Run npm run dev, open http://localhost:5173/?toolkit=u751-lc-branch, and choose **Create project** with **Branch shared house**.
3. Draw your Entrance, Bedrooms, Workspace, WC, Shared Living/Dining and Kitchen. Record beds and Workspace capacity in **Properties**; set **Visitor access allowed** to true on your designated WC.
4. Add Access or Open connections. Run each analysis in **Analyse > Network**. The route analyses should highlight connections avoiding Bedrooms; an unreachable Workspace or authorised WC is named in the result.
5. Set Workspace capacity to 2 and run **Workspace capacity**: it should report a failure and highlight the Workspace. Set it to 3 and run again: it should pass.
6. In your own design, try making a Bedroom the only way to a destination: the route check should report no valid path. A longer alternative through shared rooms should be found instead.
7. Export your project to keep your work. Once you add your own design JSON here, it will be listed in **Open toolkit design...**.

## Choices made

The display name and colours are provided for readability; no facade window fractions are prescribed. A Bedroom starts with one bed, WC permission starts false, and Workspace capacity starts unrecorded. The route checks support multiple entrances and destinations and measure shortest routes by connection count.

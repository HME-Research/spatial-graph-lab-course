# Room for facade

Which rooms should I consider placing along a noisy street-facing façade? This toolkit highlights rooms that need daylight and can tolerate noise, so you can decide where to place them.

Toolkit name: `u493-ek-roomforfacade`.

## Functions

| id | label | colour | window fraction | own defaults |
|---|---|---|---|---|
| studio | Studio | #e8a33d | Not set | None |
| study | Study | #4f7cc0 | Not set | None |
| storage | Storage | #9b9a8f | Not set | None |

The same analysis rule applies to all three functions, including Storage. Colours distinguish the functions; no façade appearance is specified.

## Custom attributes

Every room has both editable yes/no fields. Neither has a default; set each value yourself in Properties.

| key | kind | label and meaning |
|---|---|---|
| needsDaylight | boolean | Needs daylight: does the activity in this room require natural light? |
| canTolerateNoise | boolean | Can tolerate noise: is some exterior noise acceptable for this room's intended use? |

These replace the earlier window and noisy-façade observations. For an existing project, create a new project with this revised toolkit to get the new fields; old observations do not establish daylight needs or noise tolerance.

## Analysis

**Find rooms for the street façade** is a whole-design analysis in **Analyse > Network**. No room selection is needed. Its existing internal id and file remain `review-facade-placement`.

A room is highlighted only when `needsDaylight === true` AND `canTolerateNoise === true`. If either value is false, missing or null, the room is skipped. A Storage room with both values set to Yes is a candidate just like a Studio or Study.

This identifies candidates before placement. Current windows, street exposure, room position and relationships do not affect the result. The analysis only highlights candidates; you draw and revise the layout yourself.

## Designs

`designs/` contains only its short README explaining how to add a design drawn in the app. No design or default design is provided.

## How to try it

1. Run `npm run check:toolkit -- -t u493-ek-roomforfacade` and `npm run typecheck`.
2. Run `npm run dev` and open `http://localhost:5173/?toolkit=u493-ek-roomforfacade`.
3. Choose **Create project** with this toolkit and draw Studio, Study and Storage rooms. Select each room to set **Needs daylight** and **Can tolerate noise** in **Properties**.
4. Run **Analyse > Network > Find rooms for the street façade** without selecting a room first. Only rooms with both fields set to Yes should highlight, including Storage. Change either field to No and rerun: that room should no longer highlight.
5. After adding your exported design to `designs/`, it will appear in **Open toolkit design…**.

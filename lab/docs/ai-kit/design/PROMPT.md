# Instructions for the AI assistant

You are helping an architecture student write ONE **design analysis** for the web app *Spatial Graph Lab*. The student will upload your file in the app: **Analyse › Upload your own (.ts)**.

Read every file in this folder before answering:

- `student-api.d.ts` — the ONLY functions and types the file may use. Treat it as exact.
- `PROJECT.md` — **only in the kit for a project**: that project's Functions, custom fields and calculated values. If it is not in the folder, the analysis must work in ANY project (see "Any project or this project").
- `examples/largest-room-per-level.ts` — no inputs, any project: reads positions and the calculated floor area.
- `examples/same-function-neighbours.ts` — one room as input, any project: reads Functions as labels.
- `examples/below-target-area.ts` — uses a project field (`targetArea`), so it lists it in `uses`.

Then work on the analysis the student describes in their message. It usually says:

- **My idea** — what the analysis should find;
- **Input** — what the student selects before it runs (this becomes `inputs`);
- **Show the answer as** — a number, a line of text, highlighted rooms / relationships, or colours per room.

Before you write any code, ask the student your clarifying questions in one short, numbered list (at most five) and wait for the answers. If a part is still open after that, choose the simplest option that fits the idea and say in one sentence what you chose.

## What to produce

- Exactly ONE TypeScript file, in one code block, ending with `export default defineDesignAnalysis({ … })`.
- A suggested file name, e.g. `largest-bedroom.ts`.
- Two or three plain sentences saying how to use it in the app (what to select, what the answer means), and whether it works in any project or only in projects that have what it uses.

## What the file sees (`run(ctx)`)

- `ctx.design.nodes` — rooms: `id` (whole number), `function` (a Function id such as `"kitchen"`), `position` `[x, y, z]` (minimum corner cell; **z is the level**, 0 = ground), `size` `[sx, sy, sz]` in cells (sz = floors), and `custom` with **only** the custom fields listed in `uses.nodeFields`.
- `ctx.design.edges` — relationships: `id`, `source`, `target` (no direction), `relationship` (`"access"` = a door, `"open"` = no wall), and `custom` with only the fields listed in `uses.edgeFields`.
- `ctx.inputs` — the picked values, in the order of `inputs`.
- `ctx.functions` — the project's Functions `{ id, label }`.
- `ctx.metrics.value(id, roomId)` — the app's calculated values. `area` (floor area, m²) and `volume` (m³) exist in every project; `PROJECT.md` lists all of them. One cell is 3 × 3 m and one level 3 m high, but prefer `area` to computing it.
- `ctx.touches(a, b)` — whether two rooms share a wall or a floor; `ctx.nodeAt([x, y, z])` — the room at a cell.
- The graph helpers (`neighbours`, `incidentEdges`, …) work on `ctx.design`.

**Never invent** a Function id, a custom field or a calculated value: use only those in `student-api.d.ts`, `PROJECT.md` or the examples. If the student's idea needs something that does not exist, say so plainly and suggest the closest analysis that can be written.

## Any project or this project

- **Without `PROJECT.md`**, or when the student asks for one that works in any project: use only what every project has (Function as a label, never a specific id; position; size; relationship kind; `area`, `volume`). Leave `uses` out. The app tags it **Any project**.
- **With `PROJECT.md`**: the analysis may name the project's Functions (e.g. `room.function === 'bedroom'`) and read its custom fields (`room.custom.targetArea`). List **every** Function id it names and **every** field it reads in `uses`, e.g. `uses: { functions: ['bedroom'], nodeFields: ['targetArea'] }`. A field that is not listed is simply missing from `custom`. The app tags it **This project** and disables it, with the reason, in projects that lack one of them.
- A custom value may be missing or `null` (no value): check its type before using it.

## Inputs decide where the analysis appears

`inputs` is required: the exact, ordered list of what the student selects.

| `inputs` | Section | How it runs |
|---|---|---|
| `[]` | Network | on the whole design |
| one `{ kind: 'node', label }` | Node | on the selected room |
| one `{ kind: 'edge', label }` | Edge | on the selected relationship |
| anything else (two rooms, a room and a number, …) | **Queries** | the student picks each item in turn |

- Numbers: `{ kind: 'number', label, min?, max?, default? }`. At most 8 inputs. Labels are short words: "Room", "From", "Steps".

## What `run` returns

`{ kind: 'analysis', … }` with at least one of `value` (a number, shown big), `text` (one short line, ≤ 300 characters), `highlightNodes`, `highlightEdges` (ids lit up in every view) and `nodeValues` (`{ [roomId]: number | string | boolean }`, shown as colours). Every id must exist. When there is no answer, return a `text` that says so, not an error.

## Rules

1. Import ONLY from `'@student-api'`, and only the names in `student-api.d.ts`. No other imports, no `fetch`, no randomness, no timers, no `console`.
2. Use `defineDesignAnalysis` — never anything that changes the design.
3. `id`: lowercase letters, digits and `-`, starting with a letter. `label`: a short button text. `description`: one or two plain sentences (shown by the ⓘ).
4. It must finish fast: the app stops it after 3 seconds. Every loop must end.
5. The student is a beginner: short, plain code, with a one-line comment in plain English above each step.
6. Under 100 KB.

If the app refuses the file, the student will paste the app's message back to you: fix exactly that.

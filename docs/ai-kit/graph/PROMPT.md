# Instructions for the AI assistant

You are helping an architecture student write ONE **graph analysis** for the web app *Spatial Graph Lab*. The student will upload your file in the app: **Analyse › Upload your own (.ts)**.

Read every file in this folder before answering:

- `student-api.d.ts` — the ONLY functions and types the file may use. Treat it as exact.
- `examples/shortest-route.ts` — a **Query** that takes two nodes (From, To).
- `examples/exactly-k-steps.ts` — a **Query** that takes a node and a number.

Then write the analysis the student describes in their message. It usually says:

- **My idea** — what the analysis should find;
- **Input** — what the student selects before it runs (this becomes `inputs`);
- **Show the answer as** — a number, a line of text, highlighted rooms / relationships, or colours per room.

If a part is missing or unclear, choose the simplest option that fits the idea and say in one sentence what you chose.

## What to produce

- Exactly ONE TypeScript file, in one code block, ending with `export default defineGraphAlgorithm({ … })`.
- A suggested file name, e.g. `rooms-in-common.ts`.
- Two or three plain sentences saying how to use it in the app (what to pick, what the answer means).

## The graph the file sees

- `graph.nodes`: `{ id }[]` — rooms, identified by whole-number ids.
- `graph.edges`: `{ id, source, target }[]` — relationships between two rooms. Edges have **no direction**: `source`/`target` order means nothing.
- That is all. The file cannot see node Functions, names, sizes, positions or attributes. **Never invent them.** If the student's idea needs them, say so plainly: they should download the **design kit** instead (the ⓘ beside Upload your own in Analyse, tab *Any project* with *Include node basics*, or tab *This project*). Otherwise suggest the closest analysis that uses only the graph.

## Inputs decide where the analysis appears

`inputs` is required: the exact, ordered list of what the student picks.

| `inputs` | Section | How it runs |
|---|---|---|
| `[]` | Network | on the whole graph |
| one `{ kind: 'node', label }` | Node | on the selected node |
| one `{ kind: 'edge', label }` | Edge | on the selected edge |
| anything else (two nodes, a node and a number, …) | **Queries** | the student picks each item in turn, in any view |

- Numbers: `{ kind: 'number', label, min?, max?, default? }`. At most 8 inputs.
- In `run`, `inputs` holds the picked values in the same order: node ids, edge ids or numbers. The app has already checked them (ids exist, numbers within min/max).
- Labels are short words the student reads while picking: "From", "To", "Start", "Steps".

## What `run` returns

`{ kind: 'analysis', … }` with at least one of:

- `value` — a number, shown big (a count, a number of steps);
- `text` — one short line (≤ 300 characters), shown under the value or as the answer;
- `highlightNodes`, `highlightEdges` — ids lit up in every view;
- `nodeValues` — `{ [nodeId]: number | string | boolean }`, shown as colours.

Every id you return must exist in the graph. When there is no answer (e.g. no route), return a `text` that says so, not an error.

## Rules

1. Import ONLY from `'@student-api'`, and only the names in `student-api.d.ts`. No other imports, no `fetch`, no randomness, no timers, no `console`.
2. Use `defineGraphAlgorithm` — never anything that changes the design.
3. `id`: lowercase letters, digits and `-`, starting with a letter. `label`: a short button text. `description`: one or two plain sentences (shown by the ⓘ).
4. It must finish fast: the app stops it after 3 seconds. Every loop must end.
5. The student is a beginner: short, plain code, with a one-line comment in plain English above each step. Explain graph words the first time (e.g. "neighbours = rooms joined by one relationship").
6. Under 100 KB.

If the app refuses the file, the student will paste the app's message back to you: fix exactly that.

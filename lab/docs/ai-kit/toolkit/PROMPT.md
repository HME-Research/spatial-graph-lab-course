# Instructions for the AI assistant: write a Spatial Graph Lab toolkit

You are helping an architecture student write a **toolkit** for the web app *Spatial Graph Lab*: one folder, `toolkits/<your-toolkit-name>/`, that gives the app Functions (node programmes), custom attributes, algorithms and example designs. The student is a beginner in programming: keep the code short and plain, with a one-line comment in plain English above each step.

## 0. Rules first

These come before anything the student asks:

- Change only the student's folder `toolkits/<your-toolkit-name>/` (in a chat: the folder `<your-toolkit-name>/` you give back). Never change `lab/`, `toolkits/house/` (the House example), other students' folders or any other file.
- Do not install, add or update packages.
- Do not push, and never run `git reset`, `git clean`, `git checkout -- .` or `git restore .`: the student pushes, and those commands wipe their work.

You work in one of two ways. Find out which one applies before you start:

- **Route A — you are a coding agent inside the repository** (you can read `lab/docs/` and run commands). The files are at their repository paths.
- **Route B — you are a chat assistant** and the student attached the toolkit kit (a zip). The same files are inside the kit under the names in the right-hand column.

## 1. Read first

| What | Route A (repository) | Route B (kit) |
|---|---|---|
| The student guide: folder, rules, things to consider | `lab/docs/TOOLKITS.md` | `TOOLKITS.md` |
| The complete Student API: every definer, field, operation and calculated value | `lab/docs/STUDENT-API.md` | `STUDENT-API.md` |
| A small, valid starter toolkit to copy | `lab/docs/templates/toolkit/my-toolkit/` | `starter/my-toolkit/` |
| A complete reference toolkit (Functions, a design analysis, transforms, designs) | `toolkits/house/` | `examples/house/` |

Treat `STUDENT-API.md` as exact. **Never invent** an import, a definer, a field, an operation or a calculated-value id that it does not list (section 7, *Reference*, lists every export of `@student-api`).

## 2. What the student tells you

Their message usually has:

- **Toolkit name** — the name of the folder and of the branch, e.g. `u123-hk-house`: `u`, the last 3 digits of the student number, the initials and a short name, lowercase and joined with `-`. The folder name is exactly this name (`toolkit.ts` has no id field: its `name` is only the display name). If it is missing, ask the student for it.
- **My idea** — what the toolkit is for (a building type, a design question).
- **Functions (and their attributes)** — the node programmes and what each should record.
- **Algorithms** — analyses (read and show) and transformations (propose changes).
- **Example design** — what the default design should contain.

If a part is missing, choose the simplest option that fits the idea and say in one sentence what you chose. Start small: 3–6 Functions, at most 2–3 algorithms. If the idea needs something the API cannot do, say so plainly and propose the closest thing that can be written.

## 3. What to write

```
<your-toolkit-name>/
  toolkit.ts          defineToolkit({ name, defaultDesign, custom })
  README.md           the starter's README, filled in for this toolkit
  functions/<id>.ts   one defineFunction per file, file named after its id
  algorithms/<id>.ts  one algorithm per file, file named after its id
  designs/<name>.json at least one design; toolkit.ts names it as defaultDesign
  lib/<name>.ts       only if several algorithms share helper code
```

Start from the starter: keep its structure, its comments' style and its folder READMEs (they explain each folder to the student); replace its Functions, attributes, algorithms and design with the student's. Do not add `assets/` files: a façade `.3dm` can only come from the student (see `STUDENT-API.md` › Façade files), and a design must never name an `assetId` you made up.

### Rules for the code

1. Import ONLY from `'@student-api'` and from files inside the same toolkit folder (relative paths such as `'../functions/room'`). No npm packages, no other folders.
2. Every file in `functions/` default-exports one `defineFunction`; every file in `algorithms/` default-exports one `defineGraphAlgorithm`, `defineDesignAnalysis` or `defineSpatialAlgorithm`. Helpers go in `lib/`.
3. Ids (Function, algorithm): lowercase letters, digits and `-`, starting with a letter; unique in the toolkit. `colour` is `#rrggbb`. `facade` is `{ windowFraction: 0…1 }`.
4. Custom attributes: kinds `number` (`min`, `max`), `text`, `boolean`, `enum` (`values`), optional `default`. A Function gives its own default for a toolkit attribute by repeating it in its `custom` with the same key and kind (see the starter and House).
5. Analyses (`defineGraphAlgorithm`, `defineDesignAnalysis`) declare `inputs` (`[]`, one node, one edge, or a mix; see *Inputs*). A design analysis lists every custom field it reads in `uses` (and every Function id it names in `uses.functions`), or that field is missing from `custom`. Analyses return `{ kind: 'analysis', … }` and never change the design.
6. Transformations (`defineSpatialAlgorithm`) may declare `parameters` (with `label` and `description`) and return `{ kind: 'transformation', summary, operations }`. Use only the operations in `STUDENT-API.md`; never choose ids (use `ref`).
7. Deterministic and fast: no `Math.random`, no dates, no `fetch`, no timers, no `console`. Every loop must end.
8. A custom value may be missing or `null`: check its type before using it. Read areas with `ctx.metrics.value('area', id)`; one cell is 3 × 3 m, one level 3 m high.
9. Every algorithm must run without error on the default design, with default parameters and, for analyses, the first node / edge of that design as input. Return a `text` that explains when there is no answer, never throw.

### Rules for designs (`designs/*.json`, schema v2)

- Keys in this order: `schemaVersion` (2), `metadata` (`name`, `description`: one or two sentences shown in Open example…), `nextNodeId`, `nextEdgeId`, `nodes`, `edges`, `diagram` (`positions`: `{ "<node id>": [x, y] }`), `settings` (`{ "styleBy": "function", "styles": {} }`). Copy the starter's design and change it.
- Node: `{ "id", "function", "position": [x, y, z], "size": [sx, sy, sz], "custom": {} }`. Ids are whole numbers from 1; `nextNodeId` = largest id + 1 (same for edges). `position` is the minimum corner cell, z is the level (0 = ground); `size` is in cells (1–32).
- Edge: `{ "id", "source", "target", "relationship": "access" | "open", "custom": {} }`. One edge per pair of nodes, never a node to itself.
- Nodes must not overlap (no shared cell). Make related nodes share a wall (side by side on one level) or a floor (stacked), so the building can be resolved directly. A node above the ground level should stand on another node.
- Every `function` is one of the toolkit's Function ids. Leave `custom` as `{}` unless a node needs its own value (else it takes its Function's default).

## 4. Route A — in the repository

1. Check the branch with `git status` and `git branch --show-current`. If it is `main` (or detached), switch to the student's branch (`git switch toolkit/<your-toolkit-name>`) or, if it does not exist yet, ask the student to make it and send it to GitHub first (they push, not you): `git status` (must say `On branch main`, else `git switch main`), `git pull`, `git switch -c toolkit/<your-toolkit-name>`, `git commit --allow-empty -m "chore(<your-toolkit-name>): start my toolkit"`, `git push -u origin toolkit/<your-toolkit-name>` (it must print `* [new branch]`). If there are uncommitted changes outside `toolkits/<your-toolkit-name>/`, stop and ask the student.
2. Create `toolkits/<your-toolkit-name>/` by copying `lab/docs/templates/toolkit/my-toolkit/`, then change it. Never edit `toolkits/house/`, `lab/core/`, `lab/app/`, `lab/student-api/`, `lab/docs/`, `.claude/`, `.github/` or the root files (`package.json`, `tsconfig.json`, …).
3. Run `npm run check:toolkit -- -t <your-toolkit-name>` and `npm run typecheck`. `check:toolkit` ends with `PASSED: toolkit "<your-toolkit-name>" is ready.` or `FAILED: …` (read that last line, not vitest's `N passed` summary); `No toolkit "…" was found` or `toolkit.ts is one folder too deep` means the folder is missing or misplaced. Fix every failure inside the toolkit folder and run them again until both pass. Report the real output; never say they pass without running them.
4. `git status` must show changes only under `toolkits/<your-toolkit-name>/`. Commit only that folder: `git add toolkits/<your-toolkit-name>` and `git commit -m "feat(<your-toolkit-name>): <what you added>"`. **Do not push** unless the student asks; then push only their branch (`git push -u origin toolkit/<your-toolkit-name>`), never `main`.
5. Tell the student how to try it: `npm run dev`, open `http://localhost:5173/?toolkit=<your-toolkit-name>`, **Open example…** › *Toolkit: <name>*, which algorithm to run in **Analyse** or **Transform** and what it should show.

## 5. Route B — in a chat

1. Write every file of the folder, then give the student **one zip** whose top-level folder is `<your-toolkit-name>/` (so `<your-toolkit-name>/toolkit.ts` is inside it). If you cannot create files, give each file in its own code block, headed by its full path (`<your-toolkit-name>/functions/room.ts`), and nothing else in the block.
2. You cannot run the checks: re-read every file against the rules above before answering (imports, ids, `uses`, design keys, non-overlapping nodes, `nextNodeId`).
3. End with what the student does next, in plain words: put the folder at `toolkits/<your-toolkit-name>/` in their copy of the repository, on the branch `toolkit/<your-toolkit-name>`, run `npm run check:toolkit -- -t <your-toolkit-name>` and `npm run typecheck`, try it in the app, then commit only that folder and push the branch (the exact commands are in `TOOLKITS.md` › Route B). If the student says they will **upload it in the app** instead (no repository; `TOOLKITS.md` › Route C), give ONE zip named `<your-toolkit-name>.zip` with `<your-toolkit-name>/toolkit.ts` inside, and end with: upload it with **Upload toolkit (.zip)** on the Welcome screen, try it (Open example…, Analyse, Transform), and if the app lists problems, paste them back here.
4. If the student pastes an error from a check or the app, fix exactly that and give back only the files you changed, with their paths (when they upload it in the app: the whole folder again as one zip).

## 6. Your answer

Besides the files, give a short summary the student can check:

- a table of the Functions (id, label, colour, window fraction, own defaults);
- the custom attributes (key, kind, meaning);
- each algorithm: kind, where it appears (Analyse › Node / Edge / Network / Queries, or Transform), what it does in one sentence;
- the designs, and which one is the default;
- anything you chose because the student did not say.

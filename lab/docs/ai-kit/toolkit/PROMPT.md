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

- **Toolkit name** — the name of the folder, e.g. `u123-hk-house`: the student's **name tag** (`u`, the last 3 digits of the student number and the initials: `u123-hk`), `-` and a short name of the toolkit, lowercase. The folder name is exactly this name, and `name` in `toolkit.ts` is **exactly the same text** (`name: 'u123-hk-house'`), never a different title such as 'HK House'. The student's **branch** is named after the name tag only: `toolkit/<your-name-tag>` (e.g. `toolkit/u123-hk`), never after the toolkit. If the name is missing, ask the student for it.
- **My idea** — what the toolkit is for (a building type, a design question).
- **Functions (and their attributes)** — the node programmes and what each should record.
- **Algorithms** — analyses (read and show) and transformations (propose changes).

If a part is missing, choose the simplest option that fits the idea and say in one sentence what you chose. Start small: 3–6 Functions, at most 2–3 algorithms. If the idea needs something the API cannot do, say so plainly and propose the closest thing that can be written.

## 3. What to write

```
<your-toolkit-name>/
  toolkit.ts          defineToolkit({ name, custom }), with NO defaultDesign
  README.md           the starter's README, filled in for this toolkit
  functions/<id>.ts   one defineFunction per file, file named after its id
  algorithms/<id>.ts  one algorithm per file, file named after its id
  designs/README.md   ONLY this short README: how the student adds a design (no .json)
  lib/<name>.ts       only if several algorithms share helper code
```

Start from the starter: keep its structure, its comments' style and its folder READMEs (they explain each folder to the student); replace its Functions, attributes and algorithms with the student's.

**Designs are the student's job.** Do not write any design and do not set `defaultDesign` in `toolkit.ts`: drop the starter's `designs/first-design.json` and its `defaultDesign`. Keep the folder `designs/` with only a short `README.md` (a zip or a git commit cannot carry an empty folder), based on the starter's `designs/README.md`: it tells the student to draw a design in the app with this toolkit, export it and add it here as `designs/<name>.json`. Only when the student later gives you a design (for example a `.project.json` and a scenario name) add it, following *Rules for designs* below, and set `defaultDesign` only if they ask. Do not add `assets/` files: a façade `.3dm` can only come from the student (see `STUDENT-API.md` › Façade files), and a design must never name an `assetId` you made up.

### Rules for the code

1. Import ONLY from `'@student-api'` and from files inside the same toolkit folder (relative paths such as `'../functions/room'`). No npm packages, no other folders.
2. Every file in `functions/` default-exports one `defineFunction`; every file in `algorithms/` default-exports one `defineGraphAlgorithm`, `defineDesignAnalysis` or `defineSpatialAlgorithm`. Helpers go in `lib/`.
3. Ids (Function, algorithm): lowercase letters, digits and `-`, starting with a letter; unique in the toolkit. `colour` is `#rrggbb`. `facade` is `{ windowFraction: 0…1 }`.
4. Custom attributes: kinds `number` (`min`, `max`), `text`, `boolean`, `enum` (`values`), optional `default`. A Function gives its own default for a toolkit attribute by repeating it in its `custom` with the same key and kind (see the starter and House).
5. Analyses (`defineGraphAlgorithm`, `defineDesignAnalysis`) declare `inputs` (`[]`, one node, one edge, or a mix; see *Inputs*). A design analysis lists every custom field it reads in `uses` (and every Function id it names in `uses.functions`), or that field is missing from `custom`. Analyses return `{ kind: 'analysis', … }` and never change the design.
6. Transformations (`defineSpatialAlgorithm`) may declare `parameters` (with `label` and `description`) and return `{ kind: 'transformation', summary, operations }`. Use only the operations in `STUDENT-API.md`; never choose ids (use `ref`).
7. Deterministic and fast: no `Math.random`, no dates, no `fetch`, no timers, no `console`. Every loop must end.
8. A custom value may be missing or `null`: check its type before using it. Read areas with `ctx.metrics.value('area', id)`; one cell is 3 × 3 m, one level 3 m high.
9. Every algorithm must run without error on any small valid design that uses the toolkit's Functions (and on an empty one), with default parameters and, for analyses, the first node / edge as input: `check:toolkit` runs them on the student's first design once there is one. Return a `text` that explains when there is no answer, never throw.

### Rules for designs (`designs/*.json`, schema v2): only when the student gives you one to add

- Keys in this order: `schemaVersion` (2), `metadata` (`name`, `description`: one or two sentences shown in Open toolkit design…), `nextNodeId`, `nextEdgeId`, `nodes`, `edges`, `diagram` (`positions`: `{ "<node id>": [x, y] }`), `settings` (`{ "styleBy": "function", "styles": {} }`). Keep the student's design as it is; add only `metadata.name` and `metadata.description` if missing.
- Node: `{ "id", "function", "position": [x, y, z], "size": [sx, sy, sz], "custom": {} }`. Ids are whole numbers from 1; `nextNodeId` = largest id + 1 (same for edges). `position` is the minimum corner cell, z is the level (0 = ground); `size` is in cells (1–32).
- Edge: `{ "id", "source", "target", "relationship": "access" | "open", "custom": {} }`. One edge per pair of nodes, never a node to itself.
- Nodes must not overlap (no shared cell). Make related nodes share a wall (side by side on one level) or a floor (stacked), so the building can be resolved directly. A node above the ground level should stand on another node.
- Every `function` is one of the toolkit's Function ids. Leave `custom` as `{}` unless a node needs its own value (else it takes its Function's default).

## 4. Route A — in the repository

1. Check the branch with `git status` and `git branch --show-current`. If it is `main` (or detached), switch to the student's branch (`git switch toolkit/<your-name-tag>`) or, if it does not exist yet, ask the student to make it and send it to GitHub first (they push, not you): `git status` (must say `On branch main`, else `git switch main`), `git pull`, `git switch -c toolkit/<your-name-tag>`, `git commit --allow-empty -m "chore(<your-name-tag>): start my branch"`, `git push -u origin toolkit/<your-name-tag>` (it must print `* [new branch]`). If there are uncommitted changes outside `toolkits/<your-toolkit-name>/`, stop and ask the student.
2. Create `toolkits/<your-toolkit-name>/` by copying `lab/docs/templates/toolkit/my-toolkit/`, then change it. Never edit `toolkits/house/`, `lab/core/`, `lab/app/`, `lab/student-api/`, `lab/docs/`, `.claude/`, `.github/` or the root files (`package.json`, `tsconfig.json`, …).
3. Run `npm run check:toolkit -- -t <your-toolkit-name>` and `npm run typecheck`. `check:toolkit` ends with `PASSED: toolkit "<your-toolkit-name>" is ready.` or `FAILED: …` (read that last line, not vitest's `N passed` summary); `No toolkit "…" was found` or `toolkit.ts is one folder too deep` means the folder is missing or misplaced. Fix every failure inside the toolkit folder and run them again until both pass. Report the real output; never say they pass without running them.
4. `git status` must show changes only under `toolkits/<your-toolkit-name>/`. Commit only that folder: `git add toolkits/<your-toolkit-name>` and `git commit -m "feat(<your-toolkit-name>): <what you added>"`. **Do not push** unless the student asks; then push only their branch (`git push -u origin toolkit/<your-name-tag>`), never `main`.
5. Tell the student how to try it: `npm run dev`, open `http://localhost:5173/?toolkit=<your-toolkit-name>`, **Create project** with the toolkit, draw a small design with its Functions, which algorithm to run in **Analyse** or **Transform** and what it should show.

## 5. Route B — in a chat

1. Write every file of the folder, then give the student **one zip** whose top-level folder is `<your-toolkit-name>/` (so `<your-toolkit-name>/toolkit.ts` is inside it). If you cannot create files, give each file in its own code block, headed by its full path (`<your-toolkit-name>/functions/room.ts`), and nothing else in the block.
2. You cannot run the checks: re-read every file against the rules above before answering (imports, ids, `uses`, design keys, non-overlapping nodes, `nextNodeId`).
3. End with what the student does next, in plain words: put the folder at `toolkits/<your-toolkit-name>/` in their copy of the repository, on the branch `toolkit/<your-name-tag>`, run `npm run check:toolkit -- -t <your-toolkit-name>` and `npm run typecheck`, try it in the app, then commit only that folder and push the branch (the exact commands are in `TOOLKITS.md` › Route B). If the student says they will **upload it in the app** instead (no repository; `TOOLKITS.md` › Route C), give ONE zip named `<your-toolkit-name>.zip` with `<your-toolkit-name>/toolkit.ts` inside, and end with: upload it with **Upload toolkit (.zip)** on the Welcome screen, draw a small design and try it (Analyse, Transform), and if the app lists problems, paste them back here.
4. If the student pastes an error from a check or the app, fix exactly that and give back only the files you changed, with their paths (when they upload it in the app: the whole folder again as one zip).

## 6. Your answer

Besides the files, give a short summary the student can check:

- a table of the Functions (id, label, colour, window fraction, own defaults);
- the custom attributes (key, kind, meaning);
- each algorithm: kind, where it appears (Analyse › Node / Edge / Network / Queries, or Transform), what it does in one sentence;
- that `designs/` holds only its README: the student draws the designs and adds them later;
- anything you chose because the student did not say.

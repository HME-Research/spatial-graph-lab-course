# Make your own toolkit

A **toolkit** gives Spatial Graph Lab a vocabulary for one kind of building: the **Functions** a node can have (Reading room, Stacks…), the **custom attributes** they carry (occupancy, target area…), **algorithms** that analyse or transform a design, and **example designs**. It is one folder, `toolkits/<toolkit-id>/`, and it is the only place you work. This guide says how to plan it, what goes in each folder, what to watch out for, and how to make it with an AI assistant, either inside the repository (Route A) or in a chat (Route B).

Reference for every detail: [`STUDENT-API.md`](STUDENT-API.md). A complete toolkit to learn from: [`toolkits/house/`](../../toolkits/house/) (read it, never edit it). A small starter to copy: [`lab/docs/templates/toolkit/my-toolkit/`](templates/toolkit/my-toolkit/).

## 1. Decide before you start

| Decision | Rule | Tip |
|---|---|---|
| **Toolkit id** = folder name | `<initials>-<toolkit-name>`: lowercase letters, digits and `-`, starting with a letter | Your initials, then the toolkit name, words joined with `-`: HK's "Small library" is `hk-small-library` (folder `toolkits/hk-small-library/`, branch `toolkit/hk-small-library`). It keeps the id unique in the class. Saved projects remember it, so don't rename it later. |
| **Toolkit name** | free text, in `toolkit.ts` | Shown as `Toolkit: <name>`. |
| **Functions** | one per node programme; each has an `id` (lowercase letters, digits and `-`, starting with a letter) | Start with 3–6. Ids are stored in every design: add new ones rather than renaming. |
| **Custom attributes** | `number` (`min`, `max`), `text`, `boolean`, `enum` (`values`), optional `default` | Only add one when an algorithm reads it or you want to record it. Keys are stored in designs: pick clear camelCase names (`targetArea`). |
| **Algorithms** | analysis (reads) or transformation (proposes changes) | One small analysis first. Write each as a rule you could explain in one sentence. |
| **Example design** | a small design that uses your Functions | Becomes your `defaultDesign`: the checks run every algorithm on it. |

Write the idea down in one or two sentences first. It is your toolkit's `README.md`, and it is what you will give an AI assistant.

## 2. The folder

```
toolkits/<toolkit-id>/
  toolkit.ts        required: name, defaultDesign, custom attributes of every node / edge
  README.md         recommended: what the toolkit is for, its Functions, attributes, algorithms, designs
  functions/        one Function per .ts file (defineFunction)
  algorithms/       one algorithm per .ts file (defineGraphAlgorithm, defineDesignAnalysis, defineSpatialAlgorithm)
  designs/          example designs, schema-v2 .json files (each appears in Open example…)
  assets/           optional: Rhino .3dm façade files your designs use
  lib/              optional: helper code shared by several algorithms (not read by the app)
```

| Folder / file | What goes in it | Rules |
|---|---|---|
| `toolkit.ts` | `export default defineToolkit({ name, defaultDesign?, custom? })`. `custom.nodes` / `custom.edges`: attributes every node / edge has. | Required. `defaultDesign` names a file in `designs/` without `.json`. |
| `functions/*.ts` | `export default defineFunction({ id, label, colour?, facade?, custom? })` | One per file; name the file after its `id`. `colour` is `#rrggbb`; `facade.windowFraction` is 0 (closed) to 1 (fully glazed). Repeating a toolkit attribute in `custom` gives this Function its own default. |
| `algorithms/*.ts` | one default-exported algorithm per file | Analyses declare `inputs` (none → Analyse › Network, one node → Node, one edge → Edge, other → Queries). Transformations may declare `parameters` and return operations. |
| `designs/*.json` | designs exported from the app (**Export JSON**) or written by hand | Valid schema v2; every node's `function` should be one of your ids; `metadata.name` and `.description` are shown in Open example…. |
| `assets/*.3dm` | façade modules a design imports | At most 20 MB each; a design names a file by its asset id; `check:toolkit` checks they match. |
| `lib/*.ts` | shared helpers | Every file in `algorithms/` must be an algorithm, so helpers live here and are imported with `../lib/…`. |

The app reads only `.ts` files directly in `functions/` and `algorithms/`, `.json` files in `designs/` and `.3dm` files in `assets/`. A `README.md` in any folder is ignored by the app (the starter has one in every folder that explains it).

## 3. Things to consider

**Boundaries (checked by tests).**
- Your toolkit may import **only** `@student-api` and files in its own folder. No npm packages, no other toolkit, nothing from `lab/core/`, `lab/app/` or `lab/student-api/`.
- Change **only** `toolkits/<toolkit-id>/`. Never edit `toolkits/house/`, `lab/core/`, `lab/app/`, `lab/student-api/`, `lab/docs/`, `.claude/`, `.github/` or the root files (`package.json`, `tsconfig.json`, …).

**Ids are forever.** Designs store your Function ids and attribute keys; projects store your toolkit id. Renaming one later makes old designs show "unknown Function" warnings. Add, don't rename.

**Algorithms.**
- An algorithm never changes the design directly: an analysis returns a result to show; a transformation returns operations that the student previews and **Applies** (one Undo reverses it). The app checks every result.
- Deterministic: the same design gives the same result. No `Math.random()` (use a seed parameter), no dates, no network.
- Fast and finite: toolkit code is not sandboxed, so an endless loop freezes the browser tab.
- Values can be missing: a custom value may be absent or `null`. Check `typeof value === 'number'` before using it.
- A design analysis gets **only** the custom fields it lists in `uses` (`uses: { nodeFields: ['occupancy'] }`).
- One algorithm file also works without a toolkit: upload it in **Analyse** or **Transform** (**Upload your own (.ts)**). An uploaded transform cannot use `ctx.customOf` (it needs your `functions/` folder): read fields with `ctx.nodeCustom(nodeId)`, which works in both places.
- One cell is 3 × 3 m and one level 3 m high. Read areas with `ctx.metrics.value('area', id)` rather than computing them.
- A 3D edge is a relationship, not a staircase or corridor: whether it can be built is worked out by the app.

**Designs.** Easiest: build the design in the app with your toolkit active, then **Export JSON** into `designs/`. Keep your default design small: every algorithm must run on it without failing.

**Façade files.** Big `.3dm` files make the repository slow for everyone. Use one only if a design really needs it.

**Your tutor reads your README.** Say what the toolkit is for, list its Functions, attributes, algorithms and designs, and how to try it.

## 4. Check it

Run these in the repository folder (first time: `npm install`):

```
npm run check:toolkit -- -t <toolkit-id>
npm run typecheck
npm run dev
```

- `check:toolkit` loads your toolkit exactly as the app does. It fails with a readable message if a definition or design is invalid, if a design uses a façade file that is not in `assets/`, or if an algorithm fails on your default design (analyses get the first node / edge as their input).
- `typecheck` checks your TypeScript.
- `npm run dev`, then open `http://localhost:5173/?toolkit=<toolkit-id>` (or choose your toolkit when you create a project). The **Project** section lists any problem in your toolkit files until you fix it; the page reloads when you save a file.

Then try it: **Open example…** › *Toolkit: <name>*; run your analyses in **Analyse** and your transformations in **Transform**.

## 5. Two ways to make it with an AI assistant

Both routes end the same way: your folder `toolkits/<toolkit-id>/`, checked, committed on your own branch **`toolkit/<toolkit-id>`** and pushed. **Never commit to `main`**, and push only your branch. No Pull Request is needed: your tutor collects the branches.

The assistant follows [`lab/docs/ai-kit/toolkit/PROMPT.md`](ai-kit/toolkit/PROMPT.md). In the app, **Guide › Toolkits & JSON › Make your own toolkit** shows both routes with the prompts to copy and the kit to download.

### Route A — a coding agent in the repository (for example Claude Code in VS Code)

The agent reads the repository itself, writes the folder and runs the checks. No download needed.

1. Open the repository folder in VS Code and start from an up-to-date `main`: `git switch main`, then `git pull`.
2. Make your branch: `git switch -c toolkit/<toolkit-id>`.
3. Give the agent this prompt (fill in the blanks):

<!-- prompt:agent -->
```
Read lab/docs/TOOLKITS.md and lab/docs/ai-kit/toolkit/PROMPT.md in this repository, then create my toolkit following them exactly. Work only inside toolkits/<toolkit-id>/ on my branch toolkit/<toolkit-id>, run the checks, and commit only my folder. Do not push: I will push.

Toolkit id: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
Example design: ___
```
<!-- /prompt -->

   In Claude Code you can also type `/create-toolkit` and answer its questions.
4. Read what it wrote, open the app with `?toolkit=<toolkit-id>` and try it. Ask for changes in plain words.
5. Push your branch: `git push -u origin toolkit/<toolkit-id>`.

### Route B — a chat assistant (for example Claude in the browser)

The assistant cannot see the repository, so you give it the **toolkit kit** and put its answer in place yourself.

1. **Download the kit**: in the app, **Guide › Toolkits & JSON › Make your own toolkit › Chat assistant › Toolkit kit (.zip)**. It holds the AI's instructions (`PROMPT.md`), this guide, `STUDENT-API.md`, the starter folder and the House toolkit as an example.
2. Open a new chat, **attach the zip** and send this prompt (fill in the blanks):

<!-- prompt:chat -->
```
I've attached the Spatial Graph Lab toolkit kit. Read PROMPT.md and every file in it, then write my toolkit following it exactly. Give me the folder <toolkit-id>/ as a zip; if you cannot make files, give every file in its own code block, headed by its path.

Toolkit id: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
Example design: ___
```
<!-- /prompt -->

3. Put the folder in the repository and push your branch. In a terminal in the repository folder (VS Code: Terminal › New Terminal):

<!-- commands:chat -->
```
git switch main
git pull
git switch -c toolkit/<toolkit-id>
# unzip: the folder must end up at toolkits/<toolkit-id>/ (toolkit.ts directly inside it)
npm install
npm run check:toolkit -- -t <toolkit-id>
npm run typecheck
npm run dev
# try it at http://localhost:5173/?toolkit=<toolkit-id>, then stop the server (Ctrl+C)
git add toolkits/<toolkit-id>
git status
git commit -m "feat(<toolkit-id>): first version of my toolkit"
git push -u origin toolkit/<toolkit-id>
```
<!-- /commands -->

   `git status` must list **only** files under `toolkits/<toolkit-id>/`. If it lists anything else, don't commit: undo that change first.
   With GitHub Desktop instead: *Current branch › New branch* `toolkit/<toolkit-id>`, copy the folder, commit, then *Publish branch*.
4. If a check fails, copy the **whole** message back into the chat and ask it to fix exactly that. Replace the changed files, check again, commit and push again (`git push`).

### Later changes

Stay on your branch (`git switch toolkit/<toolkit-id>`), change files, check, then `git add toolkits/<toolkit-id>`, `git commit -m "feat(<toolkit-id>): …"` and `git push`. In Route B, send the chat the files you changed (or the whole folder as a zip) so it works on the current version.

## 6. When something goes wrong

| Message or symptom | What to do |
|---|---|
| `toolkit folder "…" must be lowercase letters…` | Rename the folder: lowercase letters, digits, `-`, starting with a letter. |
| The app says your toolkit doesn't exist | The folder must be `toolkits/<toolkit-id>/toolkit.ts`, not `toolkits/<toolkit-id>/<toolkit-id>/toolkit.ts` (a common unzip mistake). |
| A Function or algorithm is **disabled** | Select it (or read the Project section) for the reason; usually an invalid field or a duplicate id. |
| `… imports …` refused by a test | Import only `@student-api` and your own files. |
| An algorithm fails on the default design | Run it in the app on that design to see the message; check for missing values (`null`) and empty lists. |
| The browser tab freezes | An endless loop in an algorithm: every `while` must end. |
| You committed on `main` by mistake | Don't push. `git switch -c toolkit/<toolkit-id>` makes your branch with that commit on it; push that branch. |

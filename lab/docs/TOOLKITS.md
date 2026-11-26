# Make your own toolkit

A **toolkit** gives Spatial Graph Lab a vocabulary for one kind of building: the **Functions** a node can have (Bedroom, Kitchen…), the **custom attributes** they carry (number of beds, has a window…), **algorithms** that analyse or transform a design, and **example designs**. It is one folder, `toolkits/<your-toolkit-name>/`, and it is the only place you work. This guide says how to plan it, what goes in each folder, what to watch out for, and how to make it with an AI assistant, either inside the repository (Route A) or in a chat (Route B).

Reference for every detail: [`STUDENT-API.md`](STUDENT-API.md). A complete toolkit to learn from: the House example, [`toolkits/house/`](../../toolkits/house/) (read it, never edit it). A small starter to copy: [`lab/docs/templates/toolkit/my-toolkit/`](templates/toolkit/my-toolkit/).

## 1. Decide before you start

| Decision | Rule | Tip |
|---|---|---|
| **Your toolkit name** = folder name | `u<3 digits>-<initials>-<toolkit-name>`, lowercase letters, digits and `-` | `u`, the last 3 digits of your student number, your initials, then a short name, joined with `-`: student number …123, initials HK, toolkit House give `u123-hk-house` (folder `toolkits/u123-hk-house/`, branch `toolkit/u123-hk-house`). Saved projects remember it: don't rename it later. |
| **Display name** | free text: `name` in `toolkit.ts` | Shown as `Toolkit: <name>`. |
| **Functions** | one per node programme; each has an `id` (lowercase letters, digits and `-`, starting with a letter) | Start with 3–6. Ids are stored in every design: add new ones rather than renaming. |
| **Custom attributes** | `number` (`min`, `max`), `text`, `boolean`, `enum` (`values`), optional `default` | Only add one when an algorithm reads it or you want to record it. Keys are stored in designs: pick clear camelCase names (`targetArea`). |
| **Algorithms** | analysis (reads) or transformation (proposes changes) | One small analysis first. Write each as a rule you could explain in one sentence. |
| **Example design** | a small design that uses your Functions | Becomes your `defaultDesign`: the checks run every algorithm on it. |

Write the idea down in one or two sentences first. It is your toolkit's `README.md`, and it is what you will give an AI assistant.

## 2. The folder

```
toolkits/<your-toolkit-name>/
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
| `designs/*.json` | designs drawn in the app (the design's JSON: **Data** view › **JSON**, or one scenario's `design` in a file from **Project › Export project**) or written by hand | Valid schema v2; every node's `function` should be one of your ids; `metadata.name` and `.description` are shown in Open example…. |
| `assets/*.3dm` | façade modules a design imports | At most 20 MB each; a design names a file by its asset id; `check:toolkit` checks they match. |
| `lib/*.ts` | shared helpers | Every file in `algorithms/` must be an algorithm, so helpers live here and are imported with `../lib/…`. |

The app reads only `.ts` files directly in `functions/` and `algorithms/`, `.json` files in `designs/` and `.3dm` files in `assets/`. A `README.md` in any folder is ignored by the app (the starter has one in every folder that explains it).

## 3. Things to consider

**Boundaries (checked by tests).**
- Your toolkit may import **only** `@student-api` and files in its own folder. No npm packages, no other toolkit, nothing from `lab/core/`, `lab/app/` or `lab/student-api/`.
- Change **only** `toolkits/<your-toolkit-name>/`. Never edit `toolkits/house/`, `lab/core/`, `lab/app/`, `lab/student-api/`, `lab/docs/`, `.claude/`, `.github/` or the root files (`package.json`, `tsconfig.json`, …).

**Don't rename.** Designs store your Function ids and attribute keys; projects store your toolkit name. Renaming one later makes old designs show "unknown Function" warnings. Add, don't rename.

**Algorithms.**
- An algorithm never changes the design directly: an analysis returns a result to show; a transformation returns operations that the student previews and **Applies** (one Undo reverses it). The app checks every result.
- Deterministic: the same design gives the same result. No `Math.random()` (use a seed parameter), no dates, no network.
- Fast and finite: toolkit code is not sandboxed, so an endless loop freezes the browser tab.
- Values can be missing: a custom value may be absent or `null`. Check `typeof value === 'number'` before using it.
- A design analysis gets **only** the custom fields it lists in `uses` (`uses: { nodeFields: ['occupancy'] }`).
- One algorithm file also works without a toolkit: upload it in **Analyse** or **Transform** (**Upload your own (.ts)**). An uploaded transform cannot use `ctx.customOf` (it needs your `functions/` folder): read fields with `ctx.nodeCustom(nodeId)`, which works in both places.
- One cell is 3 × 3 m and one level 3 m high. Read areas with `ctx.metrics.value('area', id)` rather than computing them.
- A 3D edge is a relationship, not a staircase or corridor: whether it can be built is worked out by the app.

**Designs.** Easiest: build the design in the app with your toolkit active, then **Project › Export project**. The exported `.project.json` holds each scenario's design under `scenarios[…].design`: give that file to your AI and ask it to save the design of one scenario as `toolkits/<your-toolkit-name>/designs/<name>.json` (with a `metadata.name` and `.description`). The **Data** view › **JSON** shows the same design text. Keep your default design small: every algorithm must run on it without failing.

**Façade files.** Big `.3dm` files make the repository slow for everyone. Use one only if a design really needs it.

**Your tutor reads your README.** Say what the toolkit is for, list its Functions, attributes, algorithms and designs, and how to try it.

## 4. Check it

Run these in the repository folder (first time on a computer: `npm ci`, which installs exactly the versions the course fixed):

```
npm run check:toolkit -- -t <your-toolkit-name>
npm run typecheck
npm run dev
```

- `check:toolkit` loads your toolkit exactly as the app does. It ends with one line: `PASSED: toolkit "<your-toolkit-name>" is ready.` or `FAILED: … (read the red message above)`. Look for that line, not for vitest's `Tests … passed` summary (a failed run also says `N passed`). It fails with a readable message if the toolkit is not found (for example `No toolkit "u123-hk-house" was found…`, or `toolkit.ts is one folder too deep…` after a common unzip mistake), if a folder name is not valid, if a definition or design is invalid, if a design uses a façade file that is not in `assets/`, or if an algorithm fails on your default design (analyses get the first node / edge as their input).
- `typecheck` checks your TypeScript. It prints nothing when everything is fine.
- `npm run dev`, then open `http://localhost:5173/?toolkit=<your-toolkit-name>` (or the address it prints; or choose your toolkit when you create a project). **Project › Advanced** lists any problem in your toolkit files until you fix it; the page reloads when you save a file.

Then try it: **Open example…** › *Toolkit: <name>*; run your analyses in **Analyse** and your transformations in **Transform**.

## 5. Two ways to make it with an AI assistant

Both routes end the same way: your folder `toolkits/<your-toolkit-name>/`, checked, committed on your own branch **`toolkit/<your-toolkit-name>`** and pushed. **Never commit to `main`**, and push only your branch. No Pull Request is needed: your tutor collects the branches. Your tutor may also accept a zip of the folder (`<your-toolkit-name>.zip`, with `<your-toolkit-name>/toolkit.ts` directly inside it): see the tutorial, *Hand in*.

The assistant follows [`lab/docs/ai-kit/toolkit/PROMPT.md`](ai-kit/toolkit/PROMPT.md). In the app, **Guide › Toolkits & JSON › Make your own toolkit** shows both routes with the prompts to copy and the kit to download.

### Route A — a coding agent in the repository (for example Claude Code in VS Code)

The agent reads the repository itself, writes the folder and runs the checks. No download needed.

1. Open the repository folder in VS Code. Run `git status`: its first line must say `On branch main` (on another branch? `git switch main` first, so that your branch starts from the course version). Then get the newest course version: `git pull`.
2. Make your branch (`switch -c` = create it and go to it) and send it to GitHub at once, with an empty first commit: `git switch -c toolkit/<your-toolkit-name>`, `git commit --allow-empty -m "chore(<your-toolkit-name>): start my toolkit"`, then `git push -u origin toolkit/<your-toolkit-name>` (`-u` remembers GitHub as where this branch goes, so later a plain `git push` is enough). This puts your branch on GitHub: you must see `* [new branch]`. If that first push says `rejected` or `Everything up-to-date`, someone already has that name: change your toolkit name a little (never pull someone else's branch).
3. Before you send anything, check the branch: `git branch --show-current` must show `toolkit/<your-toolkit-name>`. Then give the agent this prompt (the rules come first; fill in the blanks):

<!-- prompt:agent -->
```
Rules: work only in toolkits/<your-toolkit-name>/ on my branch toolkit/<your-toolkit-name>. Do not change lab/ or any other folder or file, do not install or update packages, and do not push: I will push.
Read lab/docs/TOOLKITS.md and lab/docs/ai-kit/toolkit/PROMPT.md in this repository, then create my toolkit following them exactly. The folder name is exactly my toolkit name. Run the checks and commit only my folder.

Toolkit name: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
Example design: ___
```
<!-- /prompt -->

   In Claude Code you can also type `/create-toolkit` and answer its questions. Let the agent edit files without asking each time, but say no if it wants to run `git push`, `git reset` or `git clean`, install a package, or change files outside your folder.
4. Read what it wrote, open the app with `?toolkit=<your-toolkit-name>` and try it. Ask for changes in plain words.
5. Push your commits: `git push`.

### Route B — a chat assistant (for example Claude in the browser)

The assistant cannot see the repository, so you give it the **toolkit kit** and put its answer in place yourself.

1. **Download the kit**: in the app, **Guide › Toolkits & JSON › Make your own toolkit › Chat assistant › Toolkit kit (.zip)**. It holds the AI's instructions (`PROMPT.md`), this guide, `STUDENT-API.md`, the starter folder and the House toolkit as an example.
2. Open a new chat, **attach the zip** (if your chat refuses it, try another chat or ask your tutor) and send this prompt (fill in the blanks):

<!-- prompt:chat -->
```
I've attached the Spatial Graph Lab toolkit kit. Read PROMPT.md and every file in it, then write my toolkit following it exactly. The folder name is exactly my toolkit name. Give me the folder <your-toolkit-name>/ as a zip; if you cannot make files, give every file in its own code block, headed by its path.

Toolkit name: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
Example design: ___
```
<!-- /prompt -->

3. Put the folder in the repository and push your branch. In a terminal in the repository folder (VS Code: Terminal › New Terminal):

<!-- commands:chat -->
```
git status
# the first line must say "On branch main"; on another branch? run git switch main first
git pull
git switch -c toolkit/<your-toolkit-name>
git commit --allow-empty -m "chore(<your-toolkit-name>): start my toolkit"
git push -u origin toolkit/<your-toolkit-name>
# this puts your branch on GitHub: you must see * [new branch]
# unzip: the folder must end up at toolkits/<your-toolkit-name>/ (toolkit.ts directly inside it)
# first time on this computer only:
npm ci
npm run check:toolkit -- -t <your-toolkit-name>
# it must end with PASSED: toolkit "<your-toolkit-name>" is ready.
npm run typecheck
npm run dev
# try it at http://localhost:5173/?toolkit=<your-toolkit-name> (or the address npm run dev prints), then stop the server (Ctrl+C)
git add toolkits/<your-toolkit-name>
git status
git commit -m "feat(<your-toolkit-name>): first version of my toolkit"
git push
```
<!-- /commands -->

   Run the lines one at a time (the `#` lines are things you do by hand). Under *Changes to be committed*, `git status` must list **only** files under `toolkits/<your-toolkit-name>/`. If it lists anything else, don't commit: undo that change first.
   With GitHub Desktop instead: *Current branch › New branch* `toolkit/<your-toolkit-name>`, then send it to GitHub from the terminal with the `git commit --allow-empty …` and `git push -u …` lines above (Desktop cannot make an empty commit); copy the folder, commit only your toolkit's files, then *Push origin*.
4. If a check fails, copy the **whole** message back into the chat and ask it to fix exactly that. Replace the changed files, check again, commit and push again (`git push`).

### Later changes

Stay on your branch (`git switch toolkit/<your-toolkit-name>`), change files, check, then `git add toolkits/<your-toolkit-name>`, `git commit -m "feat(<your-toolkit-name>): …"` and `git push`. In Route B, send the chat the files you changed (or the whole folder as a zip) so it works on the current version. Pushed from another computer? `git pull --no-rebase --no-edit` first. When the course updates the app: commit your work, then, on your branch, `git pull --no-rebase --no-edit origin main` (fetches `main` from GitHub and merges it into the branch you are on; `--no-edit` keeps git from opening an editor), `npm ci`, run the checks and `git push`.

## 6. When something goes wrong

| Message or symptom | What to do |
|---|---|
| `toolkit folder "…" must be lowercase letters…` | Rename the folder: lowercase letters, digits, `-`, starting with a letter. |
| The app says your toolkit doesn't exist | The folder must be `toolkits/<your-toolkit-name>/toolkit.ts`, not `toolkits/<your-toolkit-name>/<your-toolkit-name>/toolkit.ts` (a common unzip mistake). |
| A Function or algorithm is **disabled** | Select it (or read the Project section) for the reason; usually an invalid field or a duplicate id. |
| `… imports …` refused by a test | Import only `@student-api` and your own files. |
| An algorithm fails on the default design | Run it in the app on that design to see the message; check for missing values (`null`) and empty lists. |
| The browser tab freezes | An endless loop in an algorithm: every `while` must end. |
| You committed on `main` by mistake | GitHub refuses the push, so nothing is lost. Commit or put back what `git status` lists, then: `git switch toolkit/<your-toolkit-name>`, `git merge --no-edit main` (this merges your local `main`, which holds the commits),  `git branch -f main origin/main`, `git push`. No branch yet? `git switch -c toolkit/<your-toolkit-name>`, `git branch -f main origin/main`, `git push -u origin toolkit/<your-toolkit-name>`. A `CONFLICT`, or commits that change files outside your folder: `git merge --abort` and ask your tutor. |

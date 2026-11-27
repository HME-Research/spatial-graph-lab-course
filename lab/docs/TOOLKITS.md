# Make your own toolkit

A **toolkit** gives Spatial Graph Lab a vocabulary for one kind of building: the **Functions** a node can have (Bedroom, Kitchen…), the **custom attributes** they carry (number of beds, has a window…), **algorithms** that analyse or transform a design, and **designs** you draw yourself. It is one folder, `toolkits/<your-toolkit-name>/`, and it is the only place you work. This guide says how to plan it, what goes in each folder, what to watch out for, and how to make it with an AI assistant, either inside the repository (Route A), in a chat (Route B), or in a chat and uploaded in the app with no Git (Route C).

Reference for every detail: [`STUDENT-API.md`](STUDENT-API.md). A complete toolkit to learn from: the House example, [`toolkits/house/`](../../toolkits/house/) (read it, never edit it). A small starter to copy: [`lab/docs/templates/toolkit/my-toolkit/`](templates/toolkit/my-toolkit/).

## 1. Decide before you start

| Decision | Rule | Tip |
|---|---|---|
| **Your name tag** = your branch | `u<3 digits>-<initials>`, lowercase | `u`, the last 3 digits of your student number and your initials: student number …123, initials HK give `u123-hk`. Your branch is `toolkit/u123-hk`: one branch for all your work, named after you, not after a toolkit. |
| **Your toolkit name** = folder name | `<your-name-tag>-<toolkit-name>`, lowercase letters, digits and `-` | your name tag, then a short name of the toolkit: `u123-hk-house` (folder `toolkits/u123-hk-house/`, on the branch `toolkit/u123-hk`). Saved projects remember it: don't rename it later. |
| **`name` in `toolkit.ts`** | exactly your toolkit name | `name: 'u123-hk-house'`, the same text as the folder, so the app shows one name everywhere (`Toolkit: u123-hk-house`). |
| **Functions** | one per node programme; each has an `id` (lowercase letters, digits and `-`, starting with a letter) | Start with 3–6. Ids are stored in every design: add new ones rather than renaming. |
| **Custom attributes** | `number` (`min`, `max`), `text`, `boolean`, `enum` (`values`), optional `default` | Only add one when an algorithm reads it or you want to record it. Keys are stored in designs: pick clear camelCase names (`targetArea`). |
| **Algorithms** | analysis (reads) or transformation (proposes changes) | One small analysis first. Write each as a rule you could explain in one sentence. |
| **Designs** | yours: draw them in the app and add them to `designs/` later | Your AI writes no design: it makes `designs/` with only a short `README.md` (a zip or a commit cannot carry an empty folder) and sets no `defaultDesign`. Once you add one, the checks run every algorithm on your first design; you may then name it as `defaultDesign`. |

Write the idea down in one or two sentences first. It is your toolkit's `README.md`, and it is what you will give an AI assistant.

## 2. The folder

```
toolkits/<your-toolkit-name>/
  toolkit.ts        required: name, custom attributes of every node / edge (defaultDesign only once you have a design)
  README.md         recommended: what the toolkit is for, its Functions, attributes, algorithms, designs
  functions/        one Function per .ts file (defineFunction)
  algorithms/       one algorithm per .ts file (defineGraphAlgorithm, defineDesignAnalysis, defineSpatialAlgorithm)
  designs/          your designs, schema-v2 .json files (each appears in Open toolkit design…); at first only README.md
  assets/           optional: Rhino .3dm façade files your designs use
  lib/              optional: helper code shared by several algorithms (not read by the app)
```

| Folder / file | What goes in it | Rules |
|---|---|---|
| `toolkit.ts` | `export default defineToolkit({ name, defaultDesign?, custom? })`. `custom.nodes` / `custom.edges`: attributes every node / edge has. | Required. `defaultDesign` names a file in `designs/` without `.json`. |
| `functions/*.ts` | `export default defineFunction({ id, label, colour?, facade?, custom? })` | One per file; name the file after its `id`. `colour` is `#rrggbb`; `facade.windowFraction` is 0 (closed) to 1 (fully glazed). Repeating a toolkit attribute in `custom` gives this Function its own default. |
| `algorithms/*.ts` | one default-exported algorithm per file | Analyses declare `inputs` (none → Analyse › Network, one node → Node, one edge → Edge, other → Queries). Transformations may declare `parameters` and return operations. |
| `designs/*.json` | designs drawn in the app (the design's JSON: **Data** view › **JSON**, or one scenario's `design` in a file from **Project › Export project**) or written by hand | Valid schema v2; every node's `function` should be one of your ids; `metadata.name` and `.description` are shown in Open toolkit design…. |
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

**Designs.** They are yours: your AI leaves `designs/` with only a `README.md` that says how to add one. Build a design in the app with your toolkit active (`?toolkit=<your-toolkit-name>`, or **Project › Add a toolkit…** for a project made without one), then **Project › Export project**. The exported `.project.json` holds each scenario's design under `scenarios[…].design`: give that file to your AI and ask it to save the design of one scenario as `toolkits/<your-toolkit-name>/designs/<name>.json` (with a `metadata.name` and `.description`). The **Data** view › **JSON** shows the same design text. Run `npm run check:toolkit` again: until there is a design it prints a *Note* that the algorithms were checked but not run on an example; once there is one, every algorithm must run on your first design without failing. In Route C, ask the chat to add the design to your zip, then upload the new zip.

**Façade files.** Big `.3dm` files make the repository slow for everyone. Use one only if a design really needs it.

**Your tutor reads your README.** Say what the toolkit is for, list its Functions, attributes, algorithms and designs, and how to try it.

## 4. Check it

Run these in the repository folder (first time on a computer: `npm ci`, which installs exactly the versions the course fixed):

```
npm run check:toolkit -- -t <your-toolkit-name>
npm run typecheck
npm run dev
```

- `check:toolkit` loads your toolkit exactly as the app does. It ends with one line: `PASSED: toolkit "<your-toolkit-name>" is ready.` or `FAILED: … (read the red message above)`. Look for that line, not for vitest's `Tests … passed` summary (a failed run also says `N passed`). It fails with a readable message if the toolkit is not found (for example `No toolkit "u123-hk-house" was found…`, or `toolkit.ts is one folder too deep…` after a common unzip mistake), if a folder name is not valid, if a definition or design is invalid, if a design uses a façade file that is not in `assets/`, or if an algorithm fails on your default (or first) design (analyses get the first node / edge as their input). With no design yet it prints a *Note* before `PASSED`: the algorithms were checked but not run.
- `typecheck` checks your TypeScript. It prints nothing when everything is fine.
- `npm run dev`, then open `http://localhost:5173/?toolkit=<your-toolkit-name>` (or the address it prints; or choose your toolkit when you create a project). **Project › Advanced** lists any problem in your toolkit files until you fix it; the page reloads when you save a file.

Then try it: **Create project** with your toolkit (or, once you have added designs, **Open toolkit design…** › *Toolkit: <name>*); run your analyses in **Analyse** and your transformations in **Transform**.

## 5. Ways to make it with an AI assistant

Routes A and B end the same way: your folder `toolkits/<your-toolkit-name>/`, checked, committed on your own branch **`toolkit/<your-name-tag>`** and pushed. **Never commit to `main`**, and push only your branch. No Pull Request is needed: your tutor collects the branches. Your tutor may also accept a zip of the folder (`<your-toolkit-name>.zip`, with `<your-toolkit-name>/toolkit.ts` directly inside it): see the tutorial, *Submit your work*.

The assistant follows [`lab/docs/ai-kit/toolkit/PROMPT.md`](ai-kit/toolkit/PROMPT.md). In the app, **Guide › Toolkits & JSON › Make your own toolkit** shows the three routes with the prompts to copy and the kit to download.

### Route A — a coding agent in the repository (for example Claude Code in VS Code)

The agent reads the repository itself, writes the folder and runs the checks. No download needed.

1. Open the repository folder in VS Code. Run `git status`: its first line must say `On branch main` (on another branch? `git switch main` first, so that your branch starts from the course version). Then get the newest course version: `git pull`.
2. Make your branch (`switch -c` = create it and go to it) and send it to GitHub at once, with an empty first commit: `git switch -c toolkit/<your-name-tag>`, `git commit --allow-empty -m "chore(<your-name-tag>): start my branch"`, then `git push -u origin toolkit/<your-name-tag>` (`-u` remembers GitHub as where this branch goes, so later a plain `git push` is enough). This puts your branch on GitHub: you must see `* [new branch]`. If that first push says `rejected` or `Everything up-to-date`, someone already has that name tag: add a letter to it (`u123-hka`) (never pull someone else's branch).
3. Before you send anything, check the branch: `git branch --show-current` must show `toolkit/<your-name-tag>`. Then give the agent this prompt (the rules come first; fill in the blanks):

<!-- prompt:agent -->
```
Rules: work only in toolkits/<your-toolkit-name>/ on my branch toolkit/<your-name-tag>. Do not change lab/ or any other folder or file, do not install or update packages, and do not push: I will push.
Read lab/docs/TOOLKITS.md and lab/docs/ai-kit/toolkit/PROMPT.md in this repository, then create my toolkit following them exactly. The folder name is exactly my toolkit name. Run the checks and commit only my folder.
Do not write any design: make the folder designs/ with only a short README.md that says how to add a design, and do not set defaultDesign in toolkit.ts. I will draw my designs in the app.

Toolkit name: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
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
Do not write any design: make the folder designs/ with only a short README.md that says how to add a design, and do not set defaultDesign in toolkit.ts. I will draw my designs in the app.

Toolkit name: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
```
<!-- /prompt -->

3. Put the folder in the repository and push your branch. In a terminal in the repository folder (VS Code: Terminal › New Terminal):

<!-- commands:chat -->
```
git status
# the first line must say "On branch main"; on another branch? run git switch main first
git pull
git switch -c toolkit/<your-name-tag>
git commit --allow-empty -m "chore(<your-name-tag>): start my branch"
git push -u origin toolkit/<your-name-tag>
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
   With GitHub Desktop instead: *Current branch › New branch* `toolkit/<your-name-tag>`, then send it to GitHub from the terminal with the `git commit --allow-empty …` and `git push -u …` lines above (Desktop cannot make an empty commit); copy the folder, commit only your toolkit's files, then *Push origin*.
4. If a check fails, copy the **whole** message back into the chat and ask it to fix exactly that. Replace the changed files, check again, commit and push again (`git push`).

### Route C — a chat assistant, uploaded in the app (no Git, no repository)

Everything happens in the browser; the tutorial page *Exercise 2 in the browser: your own toolkit* (`tutorial/06-toolkit-in-the-browser.html`) shows every step.

1. Download the **toolkit kit** (as in Route B, or **Guide › Toolkits & JSON › Make your own toolkit › Upload in the app**), attach it to a new chat and send this prompt (fill in the blanks):

<!-- prompt:browser -->
```
Rules: write only the files of my toolkit folder <your-toolkit-name>/. Import only from @student-api and from files in that folder, and use no packages.
I've attached the Spatial Graph Lab toolkit kit. Read PROMPT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write my toolkit following it exactly. The folder name is exactly my toolkit name.
I will upload it in the app with Upload toolkit (.zip), not put it in a repository: give me ONE zip, <your-toolkit-name>.zip, with the folder <your-toolkit-name>/ inside it and toolkit.ts directly inside that folder.
Do not write any design: make the folder designs/ with only a short README.md that says how to add a design, and do not set defaultDesign in toolkit.ts. I will draw my designs in the app.

Toolkit name: ___
My idea: ___
Functions (and their attributes): ___
Algorithms: ___
```
<!-- /prompt -->

2. In the app: **Upload toolkit (.zip)** on the Welcome screen. A new project opens with your toolkit. If the app lists problems, paste them all back into the chat, ask it to fix exactly those and give the whole folder again as one zip, then upload the new zip (**Project › Toolkit › Upload toolkit (.zip)** replaces the same toolkit after a confirm).
3. Try it (draw a small design, then **Analyse** and **Transform**; add your own designs to the zip later), keep it with **Project › Export project** (the toolkit is saved inside the project file), and hand in the zip from **Project › Toolkit › Download toolkit (.zip)** (`<your-toolkit-name>.zip`, with `<your-toolkit-name>/toolkit.ts` directly inside).

### Later changes

Stay on your branch (`git switch toolkit/<your-name-tag>`), change files, check, then `git add toolkits/<your-toolkit-name>`, `git commit -m "feat(<your-toolkit-name>): …"` and `git push`. In Route B, send the chat the files you changed (or the whole folder as a zip) so it works on the current version. Pushed from another computer? `git pull --no-rebase --no-edit` first. When the course updates the app: commit your work, then, on your branch, `git pull --no-rebase --no-edit origin main` (fetches `main` from GitHub and merges it into the branch you are on; `--no-edit` keeps git from opening an editor), `npm ci`, run the checks and `git push`.

## Upload a toolkit zip in the app

In the browser, **Welcome › Upload toolkit (.zip)** (or **Project › Toolkit › Upload toolkit (.zip)**) loads a toolkit folder from a zip: `<your-toolkit-name>/toolkit.ts` (the folder may also sit at the zip root or inside one more folder). Every file is checked exactly as `npm run check:toolkit` checks a repository toolkit (definitions, Functions, attributes, algorithms, designs and their conformance); imports may only be `@student-api` and the toolkit's own files. Any problem is listed with its file (**Copy the problems** copies them for your AI) and the project stays as it is.

- **Limits:** the zip at most 5 MB, at most 200 files, a text file at most 500 KB (2 MB together), façade files in `assets/` at most 20 MB together.
- **Saved with the project:** the toolkit is saved inside the project file (**Project › Export project**), so the project opens with it on any computer. It is used instead of a repository toolkit with the same name and shown as "(uploaded)".
- **Replace or start again:** a zip of the same toolkit name replaces it after a confirm; another toolkit opens as a new project. A project made without a toolkit gets one with **Project › Toolkit › Add a toolkit…** (a toolkit of the app or your own zip; your rooms and values stay; it cannot be removed again).
- **Hand-in shape:** **Project › Toolkit › Download toolkit (.zip)** gives `<your-toolkit-name>.zip` back, with `<your-toolkit-name>/toolkit.ts` directly inside.
- **Isolation:** its analyses and transforms run in the same isolated worker as uploaded analyses and transforms.

## 6. When something goes wrong

| Message or symptom | What to do |
|---|---|
| `toolkit folder "…" must be lowercase letters…` | Rename the folder: lowercase letters, digits, `-`, starting with a letter. |
| The app says your toolkit doesn't exist | The folder must be `toolkits/<your-toolkit-name>/toolkit.ts`, not `toolkits/<your-toolkit-name>/<your-toolkit-name>/toolkit.ts` (a common unzip mistake). |
| A Function or algorithm is **disabled** | Select it (or read the Project section) for the reason; usually an invalid field or a duplicate id. |
| `… imports …` refused by a test | Import only `@student-api` and your own files. |
| An algorithm fails on the default design | Run it in the app on that design to see the message; check for missing values (`null`) and empty lists. |
| The browser tab freezes | An endless loop in an algorithm: every `while` must end. |
| You committed on `main` by mistake | GitHub refuses the push, so nothing is lost. Commit or put back what `git status` lists, then: `git switch toolkit/<your-name-tag>`, `git merge --no-edit main` (this merges your local `main`, which holds the commits),  `git branch -f main origin/main`, `git push`. No branch yet? `git switch -c toolkit/<your-name-tag>`, `git branch -f main origin/main`, `git push -u origin toolkit/<your-name-tag>`. A `CONFLICT`, or commits that change files outside your folder: `git merge --abort` and ask your tutor. |

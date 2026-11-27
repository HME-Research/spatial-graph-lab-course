# Spatial Graph Lab

A browser app that shows how a **graph of rooms and relationships becomes architecture**. Built for the course *Graph, Rules & Space* (Bartlett AD Skills Module) by Heba Eiz.

**Open the app:** https://spatial-graph-lab.vercel.app/ (nothing to install)

**Read the tutorial:** https://spatial-graph-lab.vercel.app/tutorial/ (in your browser, no download needed)

You draw rooms (nodes) and their relationships (edges); the app shows the same design as a 2D diagram, a 3D graph, a plan, a data table and generated architecture. **Analyses** read a design and show a result; **transforms** propose a change you preview, apply and undo. A **toolkit** gives the app the vocabulary of one building type: its room Functions, their attributes, its algorithms and example designs.

## Start here: the tutorial

[Read it in your browser](https://spatial-graph-lab.vercel.app/tutorial/), no download needed. Step-by-step pages for every way of working, from using the app to handing in your toolkit. The same pages are in [`tutorial/`](tutorial/01-start-here.html) in your copy of the repository.

| You want to… | You need | Tutorial pages |
|---|---|---|
| Design, analyse and transform in the app | a browser | [2. About the app](tutorial/02-about-the-app.html), [3. Use the app](tutorial/03-use-the-app.html) |
| Write your own analysis or transform (Exercise 1) and upload it | a browser and an AI chat | [4. Your own analysis](tutorial/04-your-own-analysis.html), [5. Exercise 1: your own transform](tutorial/05-your-own-transform.html) |
| Make your own toolkit (Exercise 2) in the browser, no Git | a browser and an AI chat | [6. Exercise 2 in the browser](tutorial/06-toolkit-in-the-browser.html) |
| Make your own toolkit (Exercise 2) in the repository | this repository on your computer, and an AI assistant | [7. About the repository](tutorial/07-about-the-repository.html) to [14. Keep working](tutorial/14-keep-working-and-update.html) |

## The one rule

You work **only** in your own folder **`toolkits/<your-toolkit-name>/`**, on your own branch **`toolkit/<your-name-tag>`**. Your name tag is like `u123-hk`: `u`, the last 3 digits of your student number and your initials. Your branch is `toolkit/u123-hk`, and your toolkit name is your name tag plus a short name, like `u123-hk-house` ([tutorial page 10](tutorial/10-make-your-branch.html)). Never change anything else: `lab/` is the app itself, `toolkits/house/` is the House example, and the files at the root set up the build. Never commit to `main`. A check on GitHub flags any branch that changes files outside its toolkit folder.

Using a coding agent (Claude Code, Codex, Copilot, Cursor…)? It reads [`AGENTS.md`](AGENTS.md), which gives it the same rules.

## Get it on your computer

You need [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/) 22.12 or newer and [VS Code](https://code.visualstudio.com/) ([tutorial page 8](tutorial/08-install-the-tools.html)).

Clone it into your repositories folder, `source/repos` in your home folder (make the folder first if it is missing; [tutorial page 9](tutorial/09-clone-the-repository.html) shows how, and how to clone from VS Code instead).

Windows, in Command Prompt:

```bat
cd /d "%USERPROFILE%\source\repos"
```

macOS, in Terminal:

```sh
cd ~/source/repos
```

Then, on both:

```sh
git clone https://github.com/HME-Research/spatial-graph-lab-course.git
cd spatial-graph-lab-course
npm ci
npm run dev
```

`npm ci` installs exactly the versions the course fixed and never changes a course file. Open the address `npm run dev` prints (usually http://localhost:5173/). Stop it with `Ctrl+C`.

| Command | What it does |
|---|---|
| `npm run dev` | runs the app on your computer; it reloads when you save a file |
| `npm run check:toolkit -- -t <your-toolkit-name>` | loads your toolkit exactly as the app does and runs every algorithm on its default design; its last line says `PASSED: toolkit "<your-toolkit-name>" is ready.` or `FAILED: …` (for example when your toolkit is not found) |
| `npm run typecheck` | checks the TypeScript of the whole repository, your toolkit included |

Open your toolkit in the app with `http://localhost:5173/?toolkit=<your-toolkit-name>`. Once your branch is pushed, your tutor can open it on their computer (and online, once branch previews are set up).

## What is in this repository

| Folder or file | What it is | Yours? |
|---|---|---|
| `toolkits/<your-toolkit-name>/` | your toolkit: `toolkit.ts`, `functions/`, `algorithms/`, `designs/`, `assets/`, `lib/`, `README.md` | **yes** |
| `toolkits/house/` | the House example: read it, copy from it | no |
| `tutorial/` | the step-by-step tutorial and the AI kits | no |
| `lab/` | the app: `core/`, `app/`, `student-api/` (what toolkit code imports as `@student-api`), `docs/`, `scripts/`, `public/` | no |
| `AGENTS.md`, `CLAUDE.md`, `.claude/` | instructions for coding agents | no |
| `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | the build set-up | no |
| `node_modules/`, `dist/` | made on your computer by `npm ci` and the build; git ignores them: leave them where they are | no |

Student documentation: [`lab/docs/TOOLKITS.md`](lab/docs/TOOLKITS.md) (make a toolkit) and [`lab/docs/STUDENT-API.md`](lab/docs/STUDENT-API.md) (everything toolkit code can use).

## Licence

[MIT](LICENSE) © 2026 Heba Eiz.

## For maintainers

The app has no backend: everything runs in the browser. `npm test -- --run` runs the unit tests, `npm run build` type-checks and builds into `dist/` (what Vercel serves). Read [`lab/docs/ARCHITECTURE.md`](lab/docs/ARCHITECTURE.md), [`lab/docs/DECISIONS.md`](lab/docs/DECISIONS.md) and [`lab/docs/DEVELOPMENT-WORKFLOW.md`](lab/docs/DEVELOPMENT-WORKFLOW.md) before changing `lab/`. The course fork, branch rules and yearly reset: [`lab/docs/GITHUB-ACCESS.md`](lab/docs/GITHUB-ACCESS.md).

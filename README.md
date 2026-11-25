# Spatial Graph Lab

A browser app that shows how a **graph of rooms and relationships becomes architecture**. Built for the course *Graph, Rules & Space* (Bartlett AD Skills Module) by Heba Eiz.

**Open the app:** https://spatial-graph-lab.vercel.app/ (nothing to install)

You draw rooms (nodes) and their relationships (edges); the app shows the same design as a 2D diagram, a 3D graph, a plan, a data table and generated architecture. **Analyses** read a design and show a result; **transforms** propose a change you preview, apply and undo. A **toolkit** gives the app the vocabulary of one building type: its room Functions, their attributes, its algorithms and example designs.

## What you can do

| You want to… | You need | Start with |
|---|---|---|
| Design, analyse and transform in the app | a browser | the [live app](https://spatial-graph-lab.vercel.app/) › **Guide** |
| Write your own analysis with an AI chat and upload it | a browser and an AI chat | the app › **Analyse** › ⓘ beside **Upload your own (.ts)** |
| Make your own toolkit | this repository on your computer, and an AI assistant | [`lab/docs/TOOLKITS.md`](lab/docs/TOOLKITS.md) |

## The one rule

You work **only** in your own folder **`toolkits/<toolkit-id>/`**, on your own branch **`toolkit/<toolkit-id>`**. Never change anything else: `lab/` is the app itself, `toolkits/house/` is the example toolkit, and the files at the root set up the build. Never commit to `main`. A check on GitHub flags any branch that changes files outside its toolkit folder.

Using a coding agent (Claude Code, Codex, Copilot, Cursor…)? It reads [`AGENTS.md`](AGENTS.md), which gives it the same rules.

## Get it on your computer

You need [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/) 22.12 or newer and an editor such as [VS Code](https://code.visualstudio.com/).

```sh
git clone https://github.com/HME-Research/spatial-graph-lab-course.git
cd spatial-graph-lab-course
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173/). Stop it with `Ctrl+C`.

| Command | What it does |
|---|---|
| `npm run dev` | runs the app on your computer; it reloads when you save a file |
| `npm run check:toolkit -- -t <toolkit-id>` | loads your toolkit exactly as the app does and runs every algorithm on its default design |
| `npm run typecheck` | checks the TypeScript of the whole repository, your toolkit included |

Open your toolkit in the app with `http://localhost:5173/?toolkit=<toolkit-id>`. Once your branch is pushed, the course team can also open it online.

## What is in this repository

| Folder or file | What it is | Yours? |
|---|---|---|
| `toolkits/<toolkit-id>/` | your toolkit: `toolkit.ts`, `functions/`, `algorithms/`, `designs/`, `assets/`, `lib/`, `README.md` | **yes** |
| `toolkits/house/` | the example toolkit: read it, copy from it | no |
| `lab/` | the app: `core/`, `app/`, `student-api/` (what toolkit code imports as `@student-api`), `docs/`, `scripts/`, `public/` | no |
| `AGENTS.md`, `CLAUDE.md`, `.claude/` | instructions for coding agents | no |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | the build set-up | no |

Student documentation: [`lab/docs/TOOLKITS.md`](lab/docs/TOOLKITS.md) (make a toolkit) and [`lab/docs/STUDENT-API.md`](lab/docs/STUDENT-API.md) (everything toolkit code can use).

## Licence

[MIT](LICENSE) © 2026 Heba Eiz.

## For maintainers

The app has no backend: everything runs in the browser. `npm test -- --run` runs the unit tests, `npm run build` type-checks and builds into `dist/` (what Vercel serves). Read [`lab/docs/ARCHITECTURE.md`](lab/docs/ARCHITECTURE.md), [`lab/docs/DECISIONS.md`](lab/docs/DECISIONS.md) and [`lab/docs/DEVELOPMENT-WORKFLOW.md`](lab/docs/DEVELOPMENT-WORKFLOW.md) before changing `lab/`. The course fork, branch rules and yearly reset: [`lab/docs/GITHUB-ACCESS.md`](lab/docs/GITHUB-ACCESS.md).
